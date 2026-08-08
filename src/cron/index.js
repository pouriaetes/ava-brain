// Cron job dispatcher — triggered by Cloudflare Cron Triggers
// Frequencies from wrangler.toml: */5 * * * * and 0 4 * * *

import { handleDueReminders } from "./due-reminders.js";
import { handleRoutines } from "./routines.js";
import { handleProjectFollowups } from "./project-followup.js";
import { handleCheckin } from "./checkin.js";
import { handleCleanup } from "./cleanup.js";
import { handleNightlySummary } from "./nightly-summary.js";
import { MemoryManager } from "../lib/memory.js";
import { AIProviderManager } from "../lib/ai.js";
import { log } from "../lib/logger.js";
import { encrypt, decrypt } from "../lib/crypto.js";

export default {
  async scheduled(controller, env, ctx) {
    const config = {
      TELEGRAM_BOT_TOKEN: env.TELEGRAM_BOT_TOKEN,
      TELEGRAM_WEBHOOK_SECRET: env.TELEGRAM_WEBHOOK_SECRET,
      OWNER_TELEGRAM_ID: env.OWNER_TELEGRAM_ID,
      MASTER_KEY: env.MASTER_KEY,
      ADMIN_SESSION_SECRET: env.ADMIN_SESSION_SECRET,
      AI: env.AI,
      DB: env.DB,
      KV: env.KV,
    };

    const cron = controller.cron;

    try {
      if (cron === "*/5 * * * *") {
        // Every 5 minutes: reminders, routines, project follow-ups, optional checkin
        await handleDueReminders(config, env, ctx);
        await handleRoutines(config, env, ctx);
        await handleProjectFollowups(config, env, ctx);
        await handleCheckin(config, env, ctx);
        try {
          const providerHealthManager = new AIProviderManager(config, { encrypt, decrypt }, { info: log.info, error: log.error, warn: log.warn }, env.DB);
          await providerHealthManager.initialize();
          await providerHealthManager.cleanupFailedProviders();
        } catch (healthCleanupError) {
          await log(env.DB, "warn", "provider_health_cleanup_failed", { error: healthCleanupError.message });
        }
      } else if (cron === "0 4 * * *") {
        // Daily 4 AM UTC: cleanup + nightly summary
        await handleCleanup(config, env, ctx);
        await handleNightlySummary(config, env, ctx);
      } else if (cron === "0 6 */2 * *") {
        try {
          const memoryManager = new MemoryManager(config, null, { info: log.info, error: log.error, warn: log.warn }, env.DB);
          const aiManager = new AIProviderManager(config, { encrypt, decrypt }, { info: log.info, error: log.error, warn: log.warn }, env.DB);
          await aiManager.initialize();
          const reviewResult = await memoryManager.reviewShortTermForDatesAndImportance(config.OWNER_TELEGRAM_ID, aiManager);
          await log(env.DB, "info", "periodic_memory_review_cron", reviewResult);
        } catch (reviewError) {
          await log(env.DB, "warn", "periodic_memory_review_cron_failed", { error: reviewError.message });
        }
      }

      return new Response("OK");
    } catch (error) {
      console.error("Cron error:", error);
      return new Response("Error", { status: 500 });
    }
  },
};