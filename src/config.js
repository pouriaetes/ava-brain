// Secrets accessed via env — set via `wrangler secret put <NAME>`
// TELEGRAM_BOT_TOKEN    — from BotFather, on hot path of every message
// TELEGRAM_WEBHOOK_SECRET — verifies Telegram's secret_token header
// OWNER_TELEGRAM_ID     — initial fallback; runtime copy stored in D1 settings
// MASTER_KEY            — encrypts provider api_key_enc in D1
// ADMIN_SESSION_SECRET  — signs admin session cookies

export function getConfig(env) {
  return {
    TELEGRAM_BOT_TOKEN: env.TELEGRAM_BOT_TOKEN,
    TELEGRAM_WEBHOOK_SECRET: env.TELEGRAM_WEBHOOK_SECRET,
    OWNER_TELEGRAM_ID: env.OWNER_TELEGRAM_ID,
    MASTER_KEY: env.MASTER_KEY,
    ADMIN_SESSION_SECRET: env.ADMIN_SESSION_SECRET,
    AI: env.AI,
    DB: env.DB,
    KV: env.KV,
    ENVIRONMENT: env.ENVIRONMENT || "production",
  };
}