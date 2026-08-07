// Reminders and events management with Jalali calendar support
import { jalaliToGregorian, gregorianToJalali, validateJalaliDate, formatJalaliDate } from "./dates.js";
import { log } from "./logger.js";

export class ReminderManager {
  constructor(config, crypto, logger, db) {
    this.config = config;
    this.crypto = crypto;
    this.logger = logger;
    this.db = db;
  }

  // Create a reminder
  async createReminder({ title, description, entityId, eventId, projectId, remindAtUtc, repeatRule, priority = "medium", sourceMessageId = "" }) {
    try {
      const result = await this.db
        .prepare(
          "INSERT INTO reminders (title, description, entity_id, event_id, project_id, remind_at_utc, repeat_rule, priority, source_message_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(title, description, entityId || null, eventId || null, projectId || null, remindAtUtc, repeatRule || "", priority, sourceMessageId)
        .run();

      await this.logger.info(this.db, "reminders", "created", { title, remindAtUtc, priority });
      return { id: result.meta?.last_row_id || null, success: true };
    } catch (error) {
      await this.logger.error(this.db, "reminders", "create_error", { error: error.message, title });
      throw error;
    }
  }

  // Create a calendar event with Jalali support
  async createEvent({ entityId, type, title, calendar, year, month, day, remindOffsetsMinutes = [60, 1440], notes = "", importance = 1 }) {
    try {
      let nextOccurrenceUtc;
      let nextOccurrence;

      if (calendar === "jalali") {
        if (!validateJalaliDate(year, month, day)) {
          throw new Error("Invalid Jalali date");
        }
        const gregorian = jalaliToGregorian(year, month, day);
        nextOccurrence = new Date(Date.UTC(gregorian.year, gregorian.month - 1, gregorian.day));
      } else {
        nextOccurrence = new Date(Date.UTC(year, month - 1, day));
      }

      // Ensure next occurrence is in the future (for recurring events)
      const now = new Date();
      while (nextOccurrence < now) {
        nextOccurrence.setUTCFullYear(nextOccurrence.getUTCFullYear() + 1);
      }
      nextOccurrenceUtc = nextOccurrence.toISOString();

      const result = await this.db
        .prepare(
          "INSERT INTO events (entity_id, type, title, calendar, year, month, day, next_occurrence_utc, remind_offsets_minutes, notes, importance) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(
          entityId || null,
          type,
          title,
          calendar,
          year || null,
          month,
          day,
          nextOccurrenceUtc,
          JSON.stringify(remindOffsetsMinutes),
          notes,
          importance
        )
        .run();

      const eventId = result.meta?.last_row_id || null;

      // Create reminders for each offset
      for (const offset of remindOffsetsMinutes) {
        const remindAt = new Date(nextOccurrence.getTime() - offset * 60 * 1000);
        await this.createReminder({
          title: `${title} ${offset >= 1440 ? `(in ${offset / 1440} day(s))` : `(in ${offset} minutes)`}`,
          description: notes,
          eventId,
          remindAtUtc: remindAt.toISOString(),
          priority: "medium",
        });
      }

      await this.logger.info(this.db, "events", "created", {
        title,
        calendar,
        year,
        month,
        day,
      });

      return { id: eventId, success: true };
    } catch (error) {
      await this.logger.error(this.db, "events", "create_error", { error: error.message, title });
      throw error;
    }
  }

  // Get due reminders
  async getDueReminders(now = new Date().toISOString()) {
    try {
      const results = await this.db.prepare(
        `SELECT * FROM reminders
         WHERE status = 'pending'
           AND remind_at_utc IS NOT NULL
           AND CAST(strftime('%s', remind_at_utc) AS INTEGER) <= CAST(strftime('%s', 'now') AS INTEGER) + 300
           AND CAST(strftime('%s', remind_at_utc) AS INTEGER) >= CAST(strftime('%s', 'now') AS INTEGER) - 600`
      ).all();

      const nowMs = Date.parse(now) || Date.now();

      return (results.results || []).sort((a, b) => {
        const aTime = Date.parse(a.remind_at_utc);
        const bTime = Date.parse(b.remind_at_utc);
        if (isNaN(aTime)) return 1;
        if (isNaN(bTime)) return -1;
        return Math.abs(aTime - nowMs) - Math.abs(bTime - nowMs);
      });
    } catch (error) {
      await this.logger.error(this.db, "reminders", "due_error", { error: error.message });
      return [];
    }
  }

  // Mark reminder as notified
  async markNotified(reminderId) {
    try {
      await this.db
        .prepare("UPDATE reminders SET status = 'notified', notified_at = datetime('now'), updated_at = datetime('now') WHERE id = ?")
        .bind(reminderId)
        .run();
    } catch (error) {
      await this.logger.error(this.db, "reminders", "mark_notified_error", { error: error.message, reminderId });
    }
  }

  // Reschedule a recurring reminder to its next occurrence instead of marking it permanently notified
  async rescheduleRecurringReminder(reminderId, repeatRule, currentRemindAtUtc) {
    try {
      let rule = repeatRule || "";
      let schedule = {};

      if (rule && String(rule).trim().startsWith("{")) {
        try {
          schedule = JSON.parse(rule);
          rule = schedule.schedule_type || "";
        } catch {
          schedule = {};
        }
      }

      if (!rule && schedule.interval_hours) {
        rule = "interval";
      }

      const current = new Date(currentRemindAtUtc);
      const next = new Date(current);

      if (schedule.interval_hours && Number(schedule.interval_hours) > 0) {
        next.setTime(current.getTime() + Number(schedule.interval_hours) * 60 * 60 * 1000);
      } else if (rule === "hourly") {
        next.setTime(current.getTime() + 60 * 60 * 1000);
      } else if (rule === "daily") {
        next.setUTCDate(next.getUTCDate() + 1);
      } else if (rule === "weekly") {
        next.setUTCDate(next.getUTCDate() + 7);
      } else if (rule === "monthly") {
        next.setUTCMonth(next.getUTCMonth() + 1);
      } else {
        await this.markDone(reminderId);
        return;
      }

      await this.db.prepare(
        "UPDATE reminders SET remind_at_utc = ?, status = 'pending', notified_at = datetime('now'), updated_at = datetime('now') WHERE id = ?"
      ).bind(next.toISOString(), reminderId).run();

      await this.logger.info(this.db, "reminders", "rescheduled", {
        reminderId,
        repeatRule: rule,
        nextRemindAtUtc: next.toISOString()
      });
    } catch (error) {
      await this.logger.error(this.db, "reminders", "reschedule_error", {
        error: error.message,
        reminderId
      });
      await this.releaseReminder(reminderId);
    }
  }

  async claimReminder(id) {
    try {
      const result = await this.db.prepare(
        "UPDATE reminders SET status = 'processing', updated_at = datetime('now') WHERE id = ? AND status = 'pending'"
      ).bind(id).run();

      return (result.meta?.changes || 0) > 0;
    } catch (error) {
      await this.logger.error(this.db, "reminders", "claim_error", { error: error.message, id });
      return false;
    }
  }

  async markDone(id) {
    try {
      await this.db.prepare(
        "UPDATE reminders SET status = 'done', notified_at = datetime('now'), updated_at = datetime('now') WHERE id = ?"
      ).bind(id).run();
    } catch (error) {
      await this.logger.error(this.db, "reminders", "mark_done_error", { error: error.message, id });
    }
  }

  async releaseReminder(id) {
    try {
      await this.db.prepare(
        "UPDATE reminders SET status = 'pending', updated_at = datetime('now') WHERE id = ? AND status = 'processing'"
      ).bind(id).run();
    } catch (error) {
      await this.logger.error(this.db, "reminders", "release_error", { error: error.message, id });
    }
  }

  async cleanupDoneOnceReminders() {
    try {
      const result = await this.db.prepare(
        `DELETE FROM reminders
         WHERE status = 'done'
           AND (
             repeat_rule IS NULL
             OR repeat_rule = ''
             OR repeat_rule = 'once'
             OR repeat_rule LIKE '%"schedule_type":"once"%'
           )
           AND (
             updated_at IS NULL
             OR CAST(strftime('%s', updated_at) AS INTEGER) <= CAST(strftime('%s', 'now') AS INTEGER) - 60
           )`
      ).run();

      const deleted = result.meta?.changes || 0;
      if (deleted > 0) {
        await this.logger.info(this.db, "reminders", "done_once_reminders_cleaned", { deleted });
      }
    } catch (error) {
      await this.logger.error(this.db, "reminders", "cleanup_done_once_error", { error: error.message });
    }
  }

  // Get upcoming reminders for a user
  async getUpcomingReminders(limit = 10) {
    try {
      const results = await this.db
        .prepare("SELECT * FROM reminders WHERE status = 'pending' ORDER BY remind_at_utc ASC LIMIT ?")
        .bind(limit)
        .all();

      return results.results || [];
    } catch (error) {
      await this.logger.error(this.db, "reminders", "upcoming_error", { error: error.message });
      return [];
    }
  }

  // Get upcoming events
  async getUpcomingEvents(limit = 10) {
    try {
      const results = await this.db
        .prepare("SELECT * FROM events WHERE next_occurrence_utc >= datetime('now') ORDER BY next_occurrence_utc ASC LIMIT ?")
        .bind(limit)
        .all();

      return results.results || [];
    } catch (error) {
      await this.logger.error(this.db, "events", "upcoming_error", { error: error.message });
      return [];
    }
  }

  // Update event next occurrence after it passes
  async updateEventNextOccurrence(eventId) {
    try {
      const event = await this.db.prepare("SELECT * FROM events WHERE id = ?").bind(eventId).first();
      if (!event) return;

      let nextOccurrence;
      if (event.calendar === "jalali") {
        const gregorian = jalaliToGregorian(event.year, event.month, event.day);
        nextOccurrence = new Date(Date.UTC(gregorian.year, gregorian.month - 1, gregorian.day));
      } else {
        nextOccurrence = new Date(Date.UTC(event.year, event.month - 1, event.day));
      }

      const now = new Date();
      while (nextOccurrence <= now) {
        nextOccurrence.setUTCFullYear(nextOccurrence.getUTCFullYear() + 1);
      }

      await this.db
        .prepare("UPDATE events SET next_occurrence_utc = ?, updated_at = datetime('now') WHERE id = ?")
        .bind(nextOccurrence.toISOString(), eventId)
        .run();

      // Create new reminders for next occurrence
      const offsets = JSON.parse(event.remind_offsets_minutes || "[60,1440]");
      for (const offset of offsets) {
        const remindAt = new Date(nextOccurrence.getTime() - offset * 60 * 1000);
        await this.createReminder({
          title: `${event.title} ${offset >= 1440 ? `(in ${offset / 1440} day(s))` : `(in ${offset} minutes)`}`,
          description: event.notes,
          eventId,
          remindAtUtc: remindAt.toISOString(),
          priority: "medium",
        });
      }
    } catch (error) {
      await this.logger.error(this.db, "events", "next_occurrence_error", { error: error.message, eventId });
    }
  }
}