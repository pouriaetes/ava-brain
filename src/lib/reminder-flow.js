// src/lib/reminder-flow.js — the reminder creation flow: deterministic time
// extraction first, AI extraction as the fallback, then persistence via
// ReminderManager. Multi-step continuation ("tell me the exact time" → user
// supplies it) uses the explicit pending-intent session state instead of heuristic
// memory rows.

import { ReminderManager } from "./reminders.js";
import { AIProviderManager } from "./ai.js";
import { encrypt, decrypt } from "./crypto.js";
import { log } from "./logger.js";
import { t } from "./i18n.js";
import { setPendingIntent, clearPendingIntent } from "./state.js";

function toEnglishDigits(input) {
  return String(input || "")
    .replace(/[۰-۹]/g, (c) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(c)))
    .replace(/[٠-٩]/g, (c) => String("٠١٢٣٤٥٦٧٨٩".indexOf(c)));
}

export function deterministicReminderExtract(text) {
  try {
    const original = String(text || "").replace(/\s+/g, " ").trim();
    const normalized = toEnglishDigits(original).toLowerCase();

    const offsetMs = 3.5 * 60 * 60 * 1000;
    const tehranNow = new Date(Date.now() + offsetMs);

    const hasDaily = /(هر\s*روز|روزانه|every\s*day)/i.test(normalized);
    const hasWeekly = /(هر\s*هفته|هفتگی|every\s*week)/i.test(normalized);
    const hasTomorrow = /(فردا|tomorrow)/i.test(normalized);

    let hour = null;
    let minute = 0;

    const colonMatch = normalized.match(/(\d{1,2})[:：](\d{2})/);
    if (colonMatch) {
      hour = parseInt(colonMatch[1], 10);
      minute = parseInt(colonMatch[2], 10);
    } else {
      const halfMatch = normalized.match(/(\d{1,2})\s*ونیم/);
      if (halfMatch) {
        hour = parseInt(halfMatch[1], 10);
        minute = 30;
      } else {
        const hourMatch =
          normalized.match(/ساعت\s*(\d{1,2})/) ||
          normalized.match(/(\d{1,2})\s*(بعد\s*از\s*ظهر|عصر|شب|صبح|ظهر)/);
        if (hourMatch) {
          hour = parseInt(hourMatch[1], 10);
        }
      }
    }

    if (hour === null || isNaN(hour)) {
      return { success: false, needsInput: true };
    }

    const hasPm = /(بعد\s*از\s*ظهر|عصر|شب)/i.test(normalized);
    const hasAm = /(صبح)/i.test(normalized);

    if (!hasPm && !hasAm && hour < 12 && tehranNow.getUTCHours() >= hour) {
      hour += 12;
    }

    if (hasPm && hour < 12) hour += 12;
    if (hasAm && hour === 12) hour = 0;

    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      return { success: false, needsInput: true };
    }

    let schedule_type = "once";
    if (hasDaily) {
      schedule_type = "daily";
    } else if (
      hasWeekly ||
      /(شنبه|یکشنبه|دوشنبه|سه\s*شنبه|سه‌شنبه|چهارشنبه|پنج\s*شنبه|پنج‌شنبه|جمعه)/i.test(normalized)
    ) {
      schedule_type = "weekly";
    }

    const targetTehran = new Date(
      Date.UTC(
        tehranNow.getUTCFullYear(),
        tehranNow.getUTCMonth(),
        tehranNow.getUTCDate(),
        hour,
        minute,
        0,
        0
      )
    );

    if (hasTomorrow) {
      targetTehran.setUTCDate(targetTehran.getUTCDate() + 1);
    }

    if (schedule_type === "weekly") {
      let targetDay = null;
      if (/یکشنبه/i.test(normalized)) targetDay = 0;
      else if (/دوشنبه/i.test(normalized)) targetDay = 1;
      else if (/سه\s*شنبه|سه‌شنبه/i.test(normalized)) targetDay = 2;
      else if (/چهارشنبه/i.test(normalized)) targetDay = 3;
      else if (/پنج\s*شنبه|پنج‌شنبه/i.test(normalized)) targetDay = 4;
      else if (/جمعه/i.test(normalized)) targetDay = 5;
      else if (/شنبه/i.test(normalized)) targetDay = 6;

      if (targetDay !== null) {
        while (targetTehran.getUTCDay() !== targetDay || targetTehran <= tehranNow) {
          targetTehran.setUTCDate(targetTehran.getUTCDate() + 1);
        }
      } else if (targetTehran <= tehranNow) {
        targetTehran.setUTCDate(targetTehran.getUTCDate() + 7);
      }
    } else if (targetTehran <= tehranNow) {
      targetTehran.setUTCDate(targetTehran.getUTCDate() + 1);
    }

    const remind_at_utc = new Date(targetTehran.getTime() - offsetMs).toISOString();
    const description = original.length > 300 ? original.substring(0, 300) : original;
    const title = original.length > 80 ? original.substring(0, 80) : original;

    return {
      success: true,
      reminder: {
        title,
        description,
        schedule_type,
        remind_at_utc,
        local_time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
        days_of_week: [],
        interval_hours: null,
        delete_after_done: schedule_type === "once"
      }
    };
  } catch {
    return { success: false, needsInput: true };
  }
}

function parseReminderJson(text) {
  try {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}") + 1;
    if (start === -1 || end <= start) return null;
    return JSON.parse(text.slice(start, end));
  } catch {
    return null;
  }
}

async function extractReminderFromMessage(config, env, messageText, aiManager = null, timezone = "Asia/Tehran") {
  try {
    if (!aiManager) {
      aiManager = new AIProviderManager(
        config,
        { encrypt, decrypt },
        { info: log.info, error: log.error, warn: log.warn },
        env.DB
      );
      await aiManager.initialize();
    }

    const now = new Date();
    const utcIso = now.toISOString();
    const configuredTimezone = timezone;
    const tehranLocal = now.toLocaleString("en-US", {
      timeZone: configuredTimezone,
      weekday: "long",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });

    const systemPrompt = [
      "You are the reminder extraction module for Ava.",
      `Current UTC: ${utcIso}`,
      `Current time (${configuredTimezone}): ${tehranLocal}`,
      "Extract exactly one reminder from the user's message.",
      "Return ONLY compact JSON, no markdown.",
      `Schema: {"ok":true,"title":"short label","description":"reminder text","schedule_type":"once|daily|weekly|monthly|hourly|interval","remind_at_utc":"ISO UTC string","local_time":"HH:MM or empty","days_of_week":[0-6],"interval_hours":number|null,"delete_after_done":boolean}`,
      "Rules:",
      "- Use schedule_type=once for a one-time reminder; delete_after_done=true.",
      "- Use schedule_type=daily for every day, weekly for every week, monthly for every month, hourly for every hour, interval for every N hours.",
      `- If a specific date has no explicit time, use 08:00 local time (${configuredTimezone}).`,
      `- remind_at_utc must be the next future occurrence, converted from ${configuredTimezone} to UTC.`,
      "- For weekly, Sunday=0.",
      `- If relative time like 'X minutes later/from now' is provided, compute from current time (${configuredTimezone}) and convert to UTC.`,
      "- Reject invalid hours/minutes (hour must be 0..23, minute 0..59).",
      "- If time expression is invalid (e.g. impossible hour), return {\"ok\":false,\"missing\":\"time\"}.",
      "- If there is not enough information to determine at least a plausible time, return {\"ok\":false,\"missing\":\"time\"}."
    ].join("\n");

    const result = await aiManager.chat(
      [{ role: "user", content: `User message: ${messageText}` }],
      { capabilities: ["chat"], systemPrompt }
    );

    const parsed = parseReminderJson(result?.content || "");
    if (!parsed || parsed.ok === false) {
      return { success: false, needsInput: true };
    }

    const remindAt = new Date(parsed.remind_at_utc);
    if (!parsed.remind_at_utc || isNaN(remindAt.getTime())) {
      return { success: false, needsInput: true };
    }

    const allowedScheduleTypes = ["once", "daily", "weekly", "monthly", "hourly", "interval"];
    const scheduleType = allowedScheduleTypes.includes(parsed.schedule_type)
      ? parsed.schedule_type
      : "once";

    const intervalHours = Number(parsed.interval_hours);

    return {
      success: true,
      reminder: {
        title: parsed.title || "",
        description: parsed.description || "",
        schedule_type: scheduleType,
        remind_at_utc: remindAt.toISOString(),
        local_time: parsed.local_time || "",
        days_of_week: Array.isArray(parsed.days_of_week) ? parsed.days_of_week : [],
        interval_hours: Number.isFinite(intervalHours) && intervalHours > 0 ? intervalHours : null,
        delete_after_done: parsed.delete_after_done === true || scheduleType === "once"
      }
    };
  } catch (error) {
    await log.warn(env.DB, "reminder_flow", "reminder_extraction_failed", { error: error.message });
    return { success: false, needsInput: false, error: true };
  }
}

// sessionId is used to manage the explicit pending-intent state for multi-step
// reminder creation. Returns { message, created }.
export async function handleReminderCreate(config, env, message, language, aiManager = null, timezone = "Asia/Tehran", sessionId = null) {
  try {
    const text = message?.text || "";
    const chatId = String(message?.chat?.id || "");

    let extraction = deterministicReminderExtract(text);
    if (!extraction.success) {
      extraction = await extractReminderFromMessage(config, env, text, aiManager, timezone);
    }

    if (!extraction.success) {
      // Keep the original text as an explicit pending intent so a follow-up like
      // "11 همین شبی" can be combined with it instead of being routed as chat.
      if (sessionId && chatId) {
        await setPendingIntent(env.DB, sessionId, {
          intent: "task_or_reminder",
          collected: { text },
          missing: ["time"],
          metadata: { chatId },
        });
      }
      if (extraction.needsInput) {
        return { message: t(language, "reminder_ask_time"), created: false };
      }
      return { message: t(language, "reminder_could_not_register"), created: false };
    }

    const r = extraction.reminder;
    let remindAt = new Date(r.remind_at_utc);

    if (r.schedule_type === "once" && remindAt.getTime() <= Date.now()) {
      return { message: t(language, "reminder_time_past"), created: false };
    }

    if (r.schedule_type !== "once" && remindAt.getTime() <= Date.now()) {
      const nowDate = new Date();
      while (remindAt <= nowDate) {
        if (r.schedule_type === "hourly") {
          remindAt.setTime(remindAt.getTime() + 60 * 60 * 1000);
        } else if (r.schedule_type === "interval" && Number(r.interval_hours) > 0) {
          remindAt.setTime(remindAt.getTime() + Number(r.interval_hours) * 60 * 60 * 1000);
        } else if (r.schedule_type === "weekly") {
          remindAt.setUTCDate(remindAt.getUTCDate() + 7);
        } else if (r.schedule_type === "monthly") {
          remindAt.setUTCMonth(remindAt.getUTCMonth() + 1);
        } else {
          remindAt.setUTCDate(remindAt.getUTCDate() + 1);
        }
      }
      r.remind_at_utc = remindAt.toISOString();
    }

    const reminderManager = new ReminderManager(
      config,
      null,
      { info: log.info, error: log.error, warn: log.warn },
      env.DB
    );

    const repeatRule = JSON.stringify({
      schedule_type: r.schedule_type,
      local_time: r.local_time,
      days_of_week: r.days_of_week,
      interval_hours: r.interval_hours,
      delete_after_done: r.delete_after_done
    });

    const createResult = await reminderManager.createReminder({
      title: r.title || text.substring(0, 100),
      description: r.description || text,
      remindAtUtc: r.remind_at_utc,
      repeatRule,
      priority: "medium",
      sourceMessageId: String(message?.message_id || "")
    });

    if (!createResult?.success || !createResult?.id) {
      await log.error(env.DB, "reminder_flow", "reminder_create_not_persisted", {
        messageId: message?.message_id,
        chatId: message?.chat?.id,
        remindAtUtc: r.remind_at_utc,
        repeatRule
      });
      return { message: t(language, "reminder_not_saved"), created: false };
    }

    if (sessionId) {
      await clearPendingIntent(env.DB, sessionId);
    }

    return { message: t(language, "reminder_done"), created: true };
  } catch (error) {
    await log.error(env.DB, "reminder_flow", "reminder_create_failed", { error: error.message });
    return { message: t(language, "reminder_create_failed"), created: false };
  }
}
