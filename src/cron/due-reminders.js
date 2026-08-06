// Check due reminders and send notifications to owner
import { sendTelegramMessage } from "../lib/telegram.js";
import { log } from "../lib/logger.js";
import { ReminderManager } from "../lib/reminders.js";

export async function handleDueReminders(config, env, ctx) {
  const reminderManager = new ReminderManager(config, null, { info: log.info, error: log.error, warn: log.warn }, env.DB);

  try {
    const dueReminders = await reminderManager.getDueReminders();

    if (dueReminders.length === 0) return;

    const ownerId = config.OWNER_TELEGRAM_ID;

    for (const reminder of dueReminders) {
      try {
        const message = `🔔 <b>Reminder</b>\n\n<b>${reminder.title}</b>\n${reminder.description || ""}`;
        await sendTelegramMessage(config, ownerId, message, { parse_mode: "HTML" });

        if (reminder.repeat_rule && reminder.repeat_rule !== "") {
          await reminderManager.rescheduleRecurringReminder(reminder.id, reminder.repeat_rule, reminder.remind_at_utc);
        } else {
          await reminderManager.markNotified(reminder.id);
        }

        // If linked to an event, update next occurrence for recurring events
        if (reminder.event_id) {
          await reminderManager.updateEventNextOccurrence(reminder.event_id);
        }
      } catch (error) {
        await log(env.DB, "error", "due_reminder_send", {
          reminderId: reminder.id,
          error: error.message,
        });
      }
    }

    await log(env.DB, "info", "due_reminders_processed", { count: dueReminders.length });
  } catch (error) {
    await log(env.DB, "error", "due_reminders_cron", { error: error.message });
  }
}