// Cron job dispatcher — triggered by Cloudflare Cron Triggers
// Frequencies from wrangler.toml: */5 * * * * and 0 4 * * *

import { handleDueReminders } from "./due-reminders.js";
import { handleRoutines } from "./routines.js";
import { handleProjectFollowups } from "./project-followup.js";
import { handleCheckin } from "./checkin.js";
import { handleCleanup } from "./cleanup.js";
import { handleNightlySummary } from "./nightly-summary.js";

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
      } else if (cron === "0 4 * * *") {
        // Daily 4 AM UTC: cleanup + nightly summary
        await handleCleanup(config, env, ctx);
        await handleNightlySummary(config, env, ctx);
      }

      return new Response("OK");
    } catch (error) {
      console.error("Cron error:", error);
      return new Response("Error", { status: 500 });
    }
  },
};