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
      const results = await this.db
        .prepare(
          "SELECT * FROM reminders WHERE status = 'pending' AND remind_at_utc <= ? ORDER BY priority DESC, remind_at_utc ASC"
        )
        .bind(now)
        .all();

      return results.results || [];
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