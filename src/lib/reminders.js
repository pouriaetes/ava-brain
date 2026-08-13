// Reminders and events management with Jalali calendar support
import { jalaliToGregorian, gregorianToJalali, validateJalaliDate, formatJalaliDate } from "./dates.js";
import { log } from "./logger.js";
import { toDigits } from "./repos.js";

// OPT-011: single canonical parser for a reminder's repeat_rule (JSON object, or
// legacy plain-string schedule type like "once"/"daily"). Shared by the reminder
// cron, the reschedule lifecycle, the daily planner, and the admin reminders page
// so those implementations cannot drift apart.
export function parseRepeatRule(raw) {
  if (!raw) {
    return { schedule_type: "once", recurring: false, delete_after_done: true };
  }
  const s = String(raw).trim();
  if (s.startsWith("{")) {
    try {
      const p = JSON.parse(s);
      const schedule_type = p.schedule_type || (p.interval_hours ? "interval" : "once");
      return {
        ...p,
        schedule_type,
        recurring: schedule_type !== "once",
        delete_after_done: p.delete_after_done === true || schedule_type === "once",
      };
    } catch {
      return { schedule_type: s, recurring: false, delete_after_done: s === "" || s === "once" };
    }
  }
  return { schedule_type: s, recurring: s !== "once" && s !== "", delete_after_done: s === "" || s === "once" };
}

// Asia/Tehran wall-clock pieces of an ISO instant: { date:"YYYY-MM-DD", hour, minute }.
function tehranParts(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const dateStr = d.toLocaleString("en-CA", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit" });
  const timeStr = d.toLocaleString("en-GB", { timeZone: "Asia/Tehran", hour: "2-digit", minute: "2-digit", hour12: false });
  const [hh, mm] = timeStr.split(":").map(Number);
  return { date: dateStr, hour: hh, minute: mm };
}

// Parse a natural-language clock reference ("ساعت ۸", "08:00", "8 شب", "at 9pm")
// into { hour, minute } or null when no usable clock is present.
function parseClockReference(ref) {
  const s = toDigits(ref).toLowerCase();
  const colon = s.match(/(\d{1,2})[:：](\d{2})/);
  let hour = null;
  let minute = null;
  if (colon) {
    hour = parseInt(colon[1], 10);
    minute = parseInt(colon[2], 10);
  } else {
    const m = s.match(/(\d{1,2})/);
    if (m) hour = parseInt(m[1], 10);
  }
  if (hour === null || hour < 0 || hour > 23) return null;
  if (minute !== null && (minute < 0 || minute > 59)) return null;
  const isPm = /(بعد\s*از\s*ظهر|عصر|شب|pm|p\.?\s*m\.?)/.test(s);
  const isAm = /(صبح|am|a\.?\s*m\.?)/.test(s);
  if (isPm && hour < 12) hour += 12;
  if (isAm && hour === 12) hour = 0;
  return { hour, minute };
}

// Parse a natural-language day reference ("فردا"/"امروز"/"tomorrow"/"today")
// into a day offset, or null.
function parseDayReference(ref) {
  const s = toDigits(ref).toLowerCase();
  if (/(فردا|tomorrow)/.test(s)) return 1;
  if (/(امروز|today)/.test(s)) return 0;
  return null;
}

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
           AND CAST(strftime('%s', remind_at_utc) AS INTEGER) <= CAST(strftime('%s', ?) AS INTEGER) + 300
           AND CAST(strftime('%s', remind_at_utc) AS INTEGER) >= CAST(strftime('%s', ?) AS INTEGER) - 600`
      ).bind(now, now).all();

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
      const schedule = parseRepeatRule(repeatRule);
      const rule = schedule.schedule_type || "";

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
      // Atomic claim: only update if status is 'pending'
      // This prevents race conditions where multiple cron executions claim the same reminder
      const result = await this.db.prepare(
        "UPDATE reminders SET status = 'notified', notified_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND status = 'pending'"
      ).bind(id).run();

      // Return true only if exactly one row was affected (claim succeeded)
      return (result.meta?.changes || 0) > 0;
    } catch (error) {
      await this.logger.error(this.db, "reminders", "claim_error", { error: error.message, id });
      return false;
    }
  }

  async markDone(id) {
    try {
      // Use 'notified' status instead of 'done' to match schema constraint
      // Schema only allows: 'pending', 'notified', 'cancelled'
      await this.db.prepare(
        "UPDATE reminders SET status = 'notified', notified_at = datetime('now'), updated_at = datetime('now') WHERE id = ?"
      ).bind(id).run();
    } catch (error) {
      await this.logger.error(this.db, "reminders", "mark_done_error", { error: error.message, id });
    }
  }

  async releaseReminder(id) {
    try {
      // Revert a claimed ('notified') reminder back to 'pending' so a failed send
      // can be retried by a future cron run, and count the failure so the retry is
      // bounded (see handleDueReminders' MAX_REMINDER_RETRY_ATTEMPTS). Only
      // transitions from 'notified' so a reminder that reached another terminal
      // state is never resurrected.
      await this.db.prepare(
        "UPDATE reminders SET status = 'pending', failed_attempts = failed_attempts + 1 WHERE id = ? AND status = 'notified'"
      ).bind(id).run();
      await this.logger.info(this.db, "reminders", "release_reverted_to_pending", { id });
    } catch (error) {
      await this.logger.error(this.db, "reminders", "release_error", { error: error.message, id });
    }
  }

  async cleanupDoneOnceReminders() {
    try {
      const result = await this.db.prepare(
        `DELETE FROM reminders
         WHERE status = 'notified'
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

  // ---------------------------------------------------------------- CRUD for NL actions
  async getReminderById(id) {
    return await this.db.prepare("SELECT * FROM reminders WHERE id = ?").bind(id).first();
  }

  async getEventById(id) {
    return await this.db.prepare("SELECT * FROM events WHERE id = ?").bind(id).first();
  }

  // Find reminders matching a natural-language reference. The bot is single-owner
  // (the webhook rejects non-owners before this runs), so no owner column exists to
  // filter on. Returns every match so the caller can disambiguate.
  async findReminders({ reference = null, sourceMessageId = null, limit = 50 } = {}) {
    if (sourceMessageId) {
      const rows = (await this.db.prepare(
        "SELECT * FROM reminders WHERE source_message_id = ? ORDER BY remind_at_utc ASC LIMIT ?"
      ).bind(String(sourceMessageId), limit).all()).results || [];
      return rows;
    }
    if (!reference) return [];
    const clockRef = parseClockReference(reference);
    const dayOffset = parseDayReference(reference);
    const haystack = toDigits(reference).toLowerCase();
    // "the previous one" / "the last reminder" → the single most recent one.
    if (!clockRef && dayOffset === null && /(previous|last|قبلی|آخری)/.test(haystack)) {
      const last = await this.db.prepare(
        "SELECT * FROM reminders WHERE status IN ('pending', 'notified') ORDER BY created_at DESC LIMIT 1"
      ).first();
      return last ? [last] : [];
    }
    const rows = (await this.db.prepare(
      "SELECT * FROM reminders WHERE status IN ('pending', 'notified') ORDER BY remind_at_utc ASC LIMIT ?"
    ).bind(limit).all()).results || [];
    const matches = [];
    for (const r of rows) {
      if (clockRef) {
        const parts = tehranParts(r.remind_at_utc);
        if (!parts || parts.hour !== clockRef.hour) continue;
        if (clockRef.minute !== null && parts.minute !== clockRef.minute) continue;
        matches.push(r);
        continue;
      }
      if (dayOffset !== null) {
        const parts = tehranParts(r.remind_at_utc);
        if (!parts) continue;
        const target = new Date(Date.now() + dayOffset * 86400000)
          .toLocaleString("en-CA", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit" });
        if (parts.date === target) {
          matches.push(r);
          continue;
        }
      }
      const titleDesc = toDigits(`${r.title || ""} ${r.description || ""}`).toLowerCase();
      if (titleDesc.includes(haystack)) {
        matches.push(r);
      }
    }
    return matches;
  }

  async findEvents(reference, limit = 10) {
    if (!reference) return [];
    const haystack = toDigits(reference).toLowerCase();
    const rows = (await this.db.prepare(
      "SELECT * FROM events ORDER BY next_occurrence_utc ASC LIMIT ?"
    ).bind(limit).all()).results || [];
    return rows.filter((e) => toDigits(`${e.title} ${e.notes || ""}`).toLowerCase().includes(haystack));
  }

  async updateReminder(id, updates) {
    const allowedFields = ["title", "description", "remind_at_utc", "repeat_rule", "status", "priority"];
    const fields = [];
    const values = [];
    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key) && value !== undefined && value !== null && value !== "") {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    }
    if (fields.length === 0) return { success: false, error: "No valid fields to update" };
    values.push(id);
    const result = await this.db
      .prepare(`UPDATE reminders SET ${fields.join(", ")}, updated_at = datetime('now') WHERE id = ?`)
      .bind(...values)
      .run();
    const changes = result.meta?.changes || 0;
    if (changes === 0) return { success: false, notFound: true, error: "Reminder not found" };
    await this.logger.info(this.db, "reminders", "updated", { id, updates: Object.keys(updates) });
    return { success: true };
  }

  async deleteReminder(id) {
    const result = await this.db.prepare("DELETE FROM reminders WHERE id = ?").bind(id).run();
    const changes = result.meta?.changes || 0;
    if (changes === 0) return { success: false, notFound: true, error: "Reminder not found" };
    await this.logger.info(this.db, "reminders", "deleted", { id });
    return { success: true };
  }
}