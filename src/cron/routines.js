// Execute due routines: news, custom messages, project followups, summaries
import { sendTelegramMessage } from "../lib/telegram.js";
import { log } from "../lib/logger.js";
import { RoutineManager } from "../lib/routines.js";
import { AIProviderManager } from "../lib/ai.js";
import { encrypt, decrypt } from "../lib/crypto.js";
import { MemoryManager } from "../lib/memory.js";

export async function handleRoutines(config, env, ctx) {
  const routineManager = new RoutineManager(config, null, { info: log.info, error: log.error, warn: log.warn }, env.DB);
  
  let aiManager = null;
  try {
    const { AIProviderManager } = await import("../lib/ai.js");
    const { encrypt, decrypt } = await import("../lib/crypto.js");
    aiManager = new AIProviderManager(config, { encrypt, decrypt }, { info: log.info, error: log.error, warn: log.warn }, env.DB);
    await aiManager.initialize();
  } catch (error) {
    await log(env.DB, "warn", "routine_ai_init", { error: error.message });
    // Continue without AI manager - routines that don't need AI will still work
  }

  try {
    const dueRoutines = await routineManager.getDueRoutines();

    for (const routine of dueRoutines) {
      try {
        const payload = JSON.parse(routine.payload || "{}");

        switch (routine.action_type) {
          case "news_ai": {
            await handleNewsRoutine(routine, payload, config, env, aiManager);
            break;
          }
          case "custom_message": {
            const message = payload.message || "Your routine is due.";
            await sendTelegramMessage(config, config.OWNER_TELEGRAM_ID, message, { parse_mode: "HTML" });
            break;
          }
          case "summary": {
            await handleSummaryRoutine(routine, payload, config, env, aiManager);
            break;
          }
          case "project_followup": {
            // Handled by project-followup cron
            break;
          }
          case "checkin": {
            await sendTelegramMessage(config, config.OWNER_TELEGRAM_ID, "How are you doing? Let me know if there's anything I can help with today.");
            break;
          }
          default: {
            await log(env.DB, "info", "routine_executed", { routineId: routine.id, name: routine.name });
          }
        }

        await routineManager.recordRun(routine.id);
      } catch (error) {
        await log(env.DB, "error", "routine_execution", {
          routineId: routine.id,
          error: error.message,
        });
      }
    }
  } catch (error) {
    await log(env.DB, "error", "routines_cron", { error: error.message });
  }
}

async function handleNewsRoutine(routine, payload, config, env, aiManager) {
  const sources = payload.sources || [];
  if (sources.length === 0) {
    await log(env.DB, "warn", "news_routine_no_sources", { routineId: routine.id });
    return;
  }

  let articles = [];
  for (const source of sources) {
    try {
      const feed = await fetch(source, { timeout: 15000 });
      const text = await feed.text();
      articles.push({ source, content: text.substring(0, 2000) });
    } catch (error) {
      await log(env.DB, "warn", "news_source_failed", { source, error: error.message });
      continue;
    }
  }

  if (articles.length === 0) {
    await sendTelegramMessage(config, config.OWNER_TELEGRAM_ID, "News routine ran but no sources were available.");
    return;
  }

  try {
    const summary = await aiManager.news(articles.map(a => a.content), { capabilities: ["news"] });
    const message = `<b>📰 News Summary</b>\n\n${summary.summary || "No summary available."}`;
    await sendTelegramMessage(config, config.OWNER_TELEGRAM_ID, message, { parse_mode: "HTML" });
  } catch (error) {
    await log(env.DB, "error", "news_ai_summary", { error: error.message });
    await sendTelegramMessage(config, config.OWNER_TELEGRAM_ID, "News summary could not be generated. I will try again next time.");
  }
}

async function handleSummaryRoutine(routine, payload, config, env, aiManager) {
  try {
    const memoryManager = new MemoryManager(config, null, { info: log.info, error: log.error, warn: log.warn }, env.DB);
    const longTerm = await memoryManager.getLongTerm({ type: "note" });

    if (longTerm.length === 0) {
      await sendTelegramMessage(config, config.OWNER_TELEGRAM_ID, "No notes to summarize yet.");
      return;
    }

    const textToSummarize = longTerm.slice(0, 5).map(item => item.content).join("\n\n---\n\n");
    const summary = await aiManager.summarize(textToSummarize, { capabilities: ["summary"] });

    const message = `<b>📝 Summary</b>\n\n${summary.summary || "No summary available."}`;
    await sendTelegramMessage(config, config.OWNER_TELEGRAM_ID, message, { parse_mode: "HTML" });
  } catch (error) {
    await log(env.DB, "error", "summary_routine", { error: error.message });
    await sendTelegramMessage(config, config.OWNER_TELEGRAM_ID, "Summary could not be generated.");
  }
}