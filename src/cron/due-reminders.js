import { sendTelegramMessage } from "../lib/telegram.js";
import { log } from "../lib/logger.js";
import { ReminderManager, parseRepeatRule } from "../lib/reminders.js";
import { AIProviderManager } from "../lib/ai.js";
import { encrypt, decrypt } from "../lib/crypto.js";
import { getPersona } from "../lib/repos.js";

// A reminder that deterministically fails to send is retried at most this many
// times (releaseReminder increments failed_attempts per failed attempt), then
// marked 'failed' so it stops consuming cron/AI/Telegram resources and is
// surfaced to the admin instead of retrying forever.
const MAX_REMINDER_RETRY_ATTEMPTS = 5;

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
    await log.warn(env.DB, "due_reminders", "ai_init_failed", { error: error.message }, ctx);
  }

  try {
    const dueReminders = await reminderManager.getDueReminders(new Date().toISOString());
    if (!dueReminders.length) return;

    const ownerId = config.OWNER_TELEGRAM_ID;
    const persona = await getPersona(env.DB);

    for (const reminder of dueReminders) {
      // Cap retries on a poison reminder that keeps hard-failing: mark it 'failed'
      // (terminal, admin-visible) instead of attempting to claim/send it again.
      if ((reminder.failed_attempts || 0) >= MAX_REMINDER_RETRY_ATTEMPTS) {
        await env.DB.prepare(
          "UPDATE reminders SET status = 'failed', updated_at = datetime('now') WHERE id = ? AND status = 'pending'"
        ).bind(reminder.id).run();
        await log.warn(env.DB, "due_reminders", "reminder_failed_after_retries", {
          reminderId: reminder.id,
          failedAttempts: reminder.failed_attempts,
        }, ctx);
        continue;
      }

      let sent = false;

      try {
        const claimed = await reminderManager.claimReminder(reminder.id);
        if (!claimed) continue;

        const reminderText = reminder.description || reminder.title || "reminder";
        let finalText = "";

        try {
          if (aiManager) {
            const aiResult = await aiManager.chat(
              [
                {
                  role: "user",
                  content: `Generate a short, natural reminder message for the user. Use the same language as this reminder text. Reminder: ${reminderText}. Do not ask questions.`
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
          }, ctx);
        }

        if (!finalText) {
          finalText = `🔔 ${reminder.title || ""}\n${reminder.description || ""}`.trim();
        }

        await sendTelegramMessage(config, ownerId, finalText);
        sent = true;

        const schedule = parseRepeatRule(reminder.repeat_rule);

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
        }, ctx);
      }
    }

    await log.info(env.DB, "due_reminders", "processed", { count: dueReminders.length }, ctx);
  } catch (error) {
    await log.error(env.DB, "due_reminders", "cron_error", { error: error.message }, ctx);
  }
}
