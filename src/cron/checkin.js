// Optional check-in routine: send a gentle daily check-in if enabled
import { sendTelegramMessage } from "../lib/telegram.js";
import { log } from "../lib/logger.js";

export async function handleCheckin(config, env, ctx) {
  try {
    const checkinEnabled = await env.DB.prepare("SELECT value FROM settings WHERE key = 'checkin_enabled'").first();

    if (!checkinEnabled || checkinEnabled.value !== "true") return;

    const lastCheckin = await env.DB.prepare("SELECT value FROM settings WHERE key = 'last_checkin_at'").first();
    const lastDate = lastCheckin?.value ? new Date(lastCheckin.value).toDateString() : null;
    const today = new Date().toDateString();

    if (lastDate === today) return; // Already sent today

    const message = "Hey Pouria, just checking in. How is your day going?";
    await sendTelegramMessage(config, config.OWNER_TELEGRAM_ID, message);

    await env.DB
      .prepare("UPDATE settings SET value = ?, updated_at = datetime('now') WHERE key = 'last_checkin_at'")
      .bind(new Date().toISOString())
      .run();

    await log(env.DB, "info", "checkin_sent", { date: today });
  } catch (error) {
    await log(env.DB, "error", "checkin_cron", { error: error.message });
  }
}