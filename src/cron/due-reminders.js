import { sendTelegramMessage } from "../lib/telegram.js";
import { log } from "../lib/logger.js";
import { ReminderManager } from "../lib/reminders.js";
import { AIProviderManager } from "../lib/ai.js";
import { encrypt, decrypt } from "../lib/crypto.js";

function parseReminderSchedule(repeatRule) {
  if (!repeatRule) {
    return { schedule_type: "once", delete_after_done: true };
  }

  const raw = String(repeatRule).trim();

  if (raw.startsWith("{")) {
    try {
      const parsed = JSON.parse(raw);
      const schedule_type = parsed.schedule_type || (parsed.interval_hours ? "interval" : "once");

      return {
        ...parsed,
        schedule_type,
        delete_after_done: parsed.delete_after_done === true || schedule_type === "once"
      };
    } catch {
      return {
        schedule_type: raw || "once",
        delete_after_done: raw === "" || raw === "once"
      };
    }
  }

  const schedule_type = raw;

  return {
    schedule_type,
    delete_after_done: schedule_type === "" || schedule_type === "once"
  };
}

async function getReminderPersona(db) {
  try {
    const row = await db.prepare("SELECT value FROM settings WHERE key = 'persona'").first();
    return row?.value || "You are Ava, a smart and friendly personal assistant.";
  } catch {
    return "You are Ava, a smart and friendly personal assistant.";
  }
}

export async function handleDueReminders(config, env, ctx) {
  const reminderManager = new ReminderManager(
    config,
    null,
    { info: log.info, error: log.error, warn: log.warn },
    env.DB
  );

  await reminderManager.cleanupDoneOnceReminders();

  let aiManager = null;
  try {
    aiManager = new AIProviderManager(
      config,
      { encrypt, decrypt },
      { info: log.info, error: log.error, warn: log.warn },
      env.DB
    );
    await aiManager.initialize();
  } catch (error) {
    await log.warn(env.DB, "due_reminders", "ai_init_failed", { error: error.message });
  }

  try {
    const dueReminders = await reminderManager.getDueReminders(new Date().toISOString());
    if (!dueReminders.length) return;

    const ownerId = config.OWNER_TELEGRAM_ID;
    const persona = await getReminderPersona(env.DB);

    for (const reminder of dueReminders) {
      let sent = false;

      try {
        const claimed = await reminderManager.claimReminder(reminder.id);
        if (!claimed) continue;

        const taskText = reminder.description || reminder.title || "reminder";
        let finalText = "";

        try {
          if (aiManager) {
            const aiResult = await aiManager.chat(
              [
                {
                  role: "user",
                  content: `Generate a short, natural reminder message for the user. Use the same language as this task text. Task: ${taskText}. Do not ask questions.`
                }
              ],
              {
                capabilities: ["chat"],
                systemPrompt: persona
              }
            );

            finalText = (aiResult?.content || "").trim();
          }
        } catch (aiError) {
          await log.warn(env.DB, "due_reminders", "ai_message_failed", {
            reminderId: reminder.id,
            error: aiError.message
          });
        }

        if (!finalText) {
          finalText = `🔔 ${reminder.title || ""}\n${reminder.description || ""}`.trim();
        }

        await sendTelegramMessage(config, ownerId, finalText);
        sent = true;

        const schedule = parseReminderSchedule(reminder.repeat_rule);

        if (schedule.schedule_type === "once" || schedule.delete_after_done === true) {
          await reminderManager.markDone(reminder.id);
        } else {
          await reminderManager.rescheduleRecurringReminder(
            reminder.id,
            reminder.repeat_rule,
            reminder.remind_at_utc
          );
        }
      } catch (error) {
        if (!sent) {
          await reminderManager.releaseReminder(reminder.id);
        }

        await log.error(env.DB, "due_reminders", "reminder_send_failed", {
          reminderId: reminder.id,
          error: error.message
        });
      }
    }

    await log.info(env.DB, "due_reminders", "processed", { count: dueReminders.length });
  } catch (error) {
    await log.error(env.DB, "due_reminders", "cron_error", { error: error.message });
  }
}
