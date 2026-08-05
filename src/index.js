// Ava Brain — Main Cloudflare Worker entry point
// Routes: /admin/ava_brain/* → admin panel, /telegram → webhook, /health → health check
// Cron: */5 * * * * (due checks), 0 4 * * * (cleanup + nightly summary)

import { getConfig } from "./config.js";
import { handleAdmin } from "./routes/admin.js";
import { handleTelegramWebhook } from "./routes/telegram.js";
import { handleHealth } from "./routes/health.js";
import { log } from "./lib/logger.js";
import { default as cronHandler } from "./cron/index.js";

export default {
  async fetch(request, env, ctx) {
    const config = getConfig(env);
    const url = new URL(request.url);
    const pathname = url.pathname;

    try {
      // Admin routes
      if (pathname.startsWith("/admin/ava_brain/")) {
        return await handleAdmin(request, env, config);
      }

      // Telegram webhook
      if (pathname === "/telegram") {
        return await handleTelegramWebhook(request, env, config, ctx);
      }

      // Health check
      if (pathname === "/health") {
        return await handleHealth(request, env, config);
      }

      // 404
      return new Response("Not Found", { status: 404 });
    } catch (error) {
      console.error("Worker error:", error);
      await log(env.DB, "error", "worker_crash", {
        path: pathname,
        error: error.message,
      });

      return new Response("Internal Server Error", { status: 500 });
    }
  },

  async scheduled(controller, env, ctx) {
    return cronHandler.scheduled(controller, env, ctx);
  },
};