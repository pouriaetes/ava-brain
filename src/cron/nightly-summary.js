// Optional nightly summary: digest of day (completed tasks, reminders, projects)
import { sendTelegramMessage } from "../lib/telegram.js";
import { log } from "../lib/logger.js";

export async function handleNightlySummary(config, env, ctx) {
  try {
    const summaryEnabled = await env.DB.prepare("SELECT value FROM settings WHERE key = 'nightly_summary_enabled'").first();
    if (!summaryEnabled || summaryEnabled.value !== "true") return;

    const lastRun = await env.DB.prepare("SELECT value FROM settings WHERE key = 'nightly_summary_last_run_at'").first();
    const lastDate = lastRun?.value ? new Date(lastRun.value).toDateString() : null;
    const today = new Date().toDateString();

    if (lastDate === today) return;

    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayStartStr = todayStart.toISOString();

    const completedProjects = await env.DB
      .prepare("SELECT COUNT(*) as count FROM projects WHERE status = 'completed' AND updated_at >= ?")
      .bind(todayStartStr)
      .first();

    const activeReminders = await env.DB
      .prepare("SELECT COUNT(*) as count FROM reminders WHERE status = 'pending' AND created_at >= ?")
      .bind(todayStartStr)
      .first();

    const activeProjects = await env.DB
      .prepare("SELECT * FROM projects WHERE status = 'active' ORDER BY updated_at DESC LIMIT 3")
      .all();

    let message = "<b>🌙 Nightly Summary</b>\n\n";
    message += `✅ Completed projects today: ${completedProjects.count || 0}\n`;
    message += `⏰ Active reminders set today: ${activeReminders.count || 0}\n\n`;

    if (activeProjects.results && activeProjects.results.length > 0) {
      message += "<b>Active projects:</b>\n";
      for (const project of activeProjects.results) {
        message += `- ${project.name} (${project.progress_percent || 0}%)\n`;
      }
    }

    try {
      const MemoryManager = (await import("../lib/memory.js")).MemoryManager;
      const AIProviderManager = (await import("../lib/ai-providers.js")).AIProviderManager;
      const { encrypt, decrypt } = await import("../lib/crypto.js");
      const memoryManager2 = new MemoryManager(config, null, { info: log.info, error: log.error, warn: log.warn }, env.DB);
      const aiManager2 = new AIProviderManager(config, { encrypt, decrypt }, { info: log.info, error: log.error, warn: log.warn }, env.DB);
      await aiManager2.initialize();
      const summaryResult = await memoryManager2.summarizeOldShortTerm(config.OWNER_TELEGRAM_ID, aiManager2);
      if (summaryResult.summarized > 0) {
        await log(env.DB, "info", "nightly_memory_summarization", { entriesSummarized: summaryResult.summarized });
      }
    } catch (summaryError) {
      await log(env.DB, "warn", "nightly_memory_summarization_skipped", { error: summaryError.message });
    }

    await sendTelegramMessage(config, config.OWNER_TELEGRAM_ID, message, { parse_mode: "HTML" });

    await env.DB
      .prepare("UPDATE settings SET value = ?, updated_at = datetime('now') WHERE key = 'nightly_summary_last_run_at'")
      .bind(new Date().toISOString())
      .run();

    await log(env.DB, "info", "nightly_summary_sent", { date: today });
  } catch (error) {
    await log(env.DB, "error", "nightly_summary_cron", { error: error.message });
  }
}