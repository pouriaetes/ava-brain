// Secrets accessed via env — set via `wrangler secret put <NAME>`
// TELEGRAM_BOT_TOKEN    — from BotFather, on hot path of every message
// TELEGRAM_WEBHOOK_SECRET — verifies Telegram's secret_token header
// OWNER_TELEGRAM_ID     — initial fallback; runtime copy stored in D1 settings
// MASTER_KEY            — encrypts provider api_key_enc in D1
// ADMIN_SESSION_SECRET  — signs admin session cookies
import { log } from "./lib/logger.js";

export function getConfig(env) {
  const ownerTelegramId = env.OWNER_TELEGRAM_ID;
  if (!ownerTelegramId || !/^\d+$/.test(String(ownerTelegramId))) {
    // The webhook fails closed on this (rejects everyone), which is the safe
    // direction — but surface the misconfiguration to the operator rather than
    // leaving it implicit. Fire-and-forget: getConfig stays synchronous.
    log(env.DB, "warn", "config_owner_telegram_id_invalid", {
      error: "OWNER_TELEGRAM_ID is missing or invalid; the bot will reject all users until it is set to the owner's numeric Telegram ID.",
    }).catch(() => {});
  }
  return {
    TELEGRAM_BOT_TOKEN: env.TELEGRAM_BOT_TOKEN,
    TELEGRAM_WEBHOOK_SECRET: env.TELEGRAM_WEBHOOK_SECRET,
    OWNER_TELEGRAM_ID: ownerTelegramId,
    MASTER_KEY: env.MASTER_KEY,
    ADMIN_SESSION_SECRET: env.ADMIN_SESSION_SECRET,
    AI: env.AI,
    DB: env.DB,
    KV: env.KV,
    ENVIRONMENT: env.ENVIRONMENT || "production",
  };
}