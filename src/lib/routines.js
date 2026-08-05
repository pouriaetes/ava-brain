// Dynamic routines and scheduling management
// No hardcoded routines — all created at runtime via user request
import { log } from "./logger.js";

export class RoutineManager {
  constructor(config, crypto, logger, db) {
    this.config = config;
    this.crypto = crypto;
    this.logger = logger;
    this.db = db;
  }

  // Create a routine as draft
  async createRoutine({ name, actionType, scheduleType, localTime = "", intervalHours = null, cronExpression = "", payload = {} }) {
    try {
      const nextRunUtc = this.calculateNextRun(scheduleType, localTime, intervalHours, cronExpression);

      const result = await this.db
        .prepare(
          "INSERT INTO routines (name, action_type, schedule_type, local_time, interval_hours, cron_expression, payload, enabled, draft, next_run_utc) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(
          name,
          actionType,
          scheduleType,
          localTime,
          intervalHours,
          cronExpression,
          JSON.stringify(payload),
          0, // enabled=false
          1, // draft=true
          nextRunUtc
        )
        .run();

      const routineId = result.meta?.last_row_id || null;

      await this.logger.info(this.db, "routines", "draft_created", {
        routineId,
        name,
        scheduleType,
      });

      return { id: routineId, success: true };
    } catch (error) {
      await this.logger.error(this.db, "routines", "create_error", { error: error.message, name });
      throw error;
    }
  }

  // Confirm and enable a routine
  async confirmRoutine(routineId) {
    try {
      const routine = await this.db.prepare("SELECT * FROM routines WHERE id = ?").bind(routineId).first();
      if (!routine) return { success: false, error: "Routine not found" };

      const nextRunUtc = this.calculateNextRun(routine.schedule_type, routine.local_time, routine.interval_hours, routine.cron_expression);

      await this.db
        .prepare(
          "UPDATE routines SET enabled = 1, draft = 0, next_run_utc = ?, updated_at = datetime('now') WHERE id = ?"
        )
        .bind(nextRunUtc, routineId)
        .run();

      await this.logger.info(this.db, "routines", "confirmed", { routineId });
      return { success: true, nextRunUtc };
    } catch (error) {
      await this.logger.error(this.db, "routines", "confirm_error", { error: error.message, routineId });
      throw error;
    }
  }

  // Get active routines that are due
  async getDueRoutines(now = new Date().toISOString()) {
    try {
      const results = await this.db
        .prepare("SELECT * FROM routines WHERE enabled = 1 AND draft = 0 AND (next_run_utc IS NULL OR next_run_utc <= ?)")
        .bind(now)
        .all();

      return results.results || [];
    } catch (error) {
      await this.logger.error(this.db, "routines", "due_error", { error: error.message });
      return [];
    }
  }

  // Update routine last_run and next_run
  async recordRun(routineId) {
    try {
      const routine = await this.db.prepare("SELECT * FROM routines WHERE id = ?").bind(routineId).first();
      if (!routine) return;

      const nextRunUtc = this.calculateNextRun(routine.schedule_type, routine.local_time, routine.interval_hours, routine.cron_expression);

      await this.db
        .prepare(
          "UPDATE routines SET last_run_at = datetime('now'), next_run_utc = ?, updated_at = datetime('now') WHERE id = ?"
        )
        .bind(nextRunUtc, routineId)
        .run();
    } catch (error) {
      await this.logger.error(this.db, "routines", "record_run_error", { error: error.message, routineId });
    }
  }

  // Get all routines
  async getAllRoutines(limit = 100) {
    try {
      const results = await this.db
        .prepare("SELECT * FROM routines ORDER BY created_at DESC LIMIT ?")
        .bind(limit)
        .all();

      return results.results || [];
    } catch (error) {
      await this.logger.error(this.db, "routines", "list_error", { error: error.message });
      return [];
    }
  }

  // Update routine
  async updateRoutine(routineId, updates) {
    try {
      const allowedFields = [
        "name",
        "action_type",
        "schedule_type",
        "local_time",
        "interval_hours",
        "cron_expression",
        "payload",
        "enabled",
        "draft",
      ];

      const fields = [];
      const values = [];

      for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key)) {
          fields.push(`${key} = ?`);
          values.push(key === "payload" ? JSON.stringify(value) : value);
        }
      }

      if (fields.length === 0) return { success: false, error: "No valid fields to update" };

      values.push(routineId);
      const query = `UPDATE routines SET ${fields.join(", ")}, updated_at = datetime('now') WHERE id = ?`;
      await this.db.prepare(query).bind(...values).run();

      await this.logger.info(this.db, "routines", "updated", { routineId });
      return { success: true };
    } catch (error) {
      await this.logger.error(this.db, "routines", "update_error", { error: error.message, routineId });
      throw error;
    }
  }

  // Delete routine
  async deleteRoutine(routineId) {
    try {
      await this.db.prepare("DELETE FROM routines WHERE id = ?").bind(routineId).run();
      await this.logger.info(this.db, "routines", "deleted", { routineId });
      return { success: true };
    } catch (error) {
      await this.logger.error(this.db, "routines", "delete_error", { error: error.message, routineId });
      throw error;
    }
  }

  // Calculate next run time based on schedule type
  calculateNextRun(scheduleType, localTime, intervalHours, cronExpression) {
    const now = new Date();
    const next = new Date(now);

    switch (scheduleType) {
      case "daily": {
        // localTime format: HH:MM
        const [hours, minutes] = (localTime || "09:00").split(":").map(Number);
        next.setUTCHours(hours, minutes || 0, 0, 0);
        // Convert Tehran local to UTC (Tehran is UTC+3:30)
        next.setUTCMinutes(next.getUTCMinutes() - 210);
        if (next <= now) {
          next.setUTCDate(next.getUTCDate() + 1);
        }
        break;
      }
      case "interval": {
        const hours = intervalHours || 24;
        next.setTime(now.getTime() + hours * 60 * 60 * 1000);
        break;
      }
      case "weekly": {
        // localTime format: day,HH:MM (e.g., "monday,09:00")
        const [dayName, time] = (localTime || "monday,09:00").split(",");
        const days = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
        const targetDay = days[dayName.toLowerCase()] || 1;
        const [hours, minutes] = (time || "09:00").split(":").map(Number);

        next.setUTCDate(next.getUTCDate() + ((targetDay - next.getUTCDay() + 7) % 7));
        next.setUTCHours(hours, minutes || 0, 0, 0);
        next.setUTCMinutes(next.getUTCMinutes() - 210); // Tehran to UTC

        if (next <= now) {
          next.setUTCDate(next.getUTCDate() + 7);
        }
        break;
      }
      case "once": {
        // localTime format: ISO string or YYYY-MM-DD HH:MM
        const target = localTime ? new Date(localTime) : new Date(now.getTime() + 60 * 60 * 1000);
        return target.toISOString();
      }
      case "cron": {
        // For cron expressions, we'd need a cron parser; fallback to 1 hour from now
        next.setTime(now.getTime() + 60 * 60 * 1000);
        break;
      }
      default:
        next.setTime(now.getTime() + 24 * 60 * 60 * 1000);
    }

    return next.toISOString();
  }
}