// src/lib/respond.js — turn a Decision into a concrete reply. This is the single
// response dispatch: workflow execution, reminder creation, daily plan, entity
// actions/queries, manual fallback, and plain chat all live here. Admin workflow
// testing reuses the same runWorkflow engine, never a duplicate.

import { runWorkflow } from "./workflow-engine.js";
import { executeAction, summarizeActionResults } from "./validator.js";
import { ReminderManager } from "./reminders.js";
import { ProjectManager } from "./projects.js";
import { handleReminderCreate } from "./reminder-flow.js";
import { t, pick } from "./i18n.js";
import { log } from "./logger.js";
import { formatLocalTime, getPersona } from "./repos.js";
import { buildCommandHelp } from "../capabilities.js";
import { fetchUrlContent } from "./websearch.js";

function sanitize(msg) {
  return String(msg || "").replace(/[A-Za-z0-9_-]{24,}/g, "[REDACTED]").replace(/(api[_-]?key|authorization|token|secret|password)\s*[:=]\s*\S+/gi, "$1: [REDACTED]").substring(0, 300);
}

// Voice-reply triggers (settings-driven) that force a voice reply to a chat answer.
export async function isVoiceReplyRequest(text, env, settings) {
  const t = String(text || "").toLowerCase();
  if (!t) return false;
  let triggers = ["با صدا جواب بده", "جواب صوتی", "ویس بده", "ویس جواب", "voice reply", "reply with voice", "answer with voice", "send voice"];
  try {
    if (settings && settings.keyword_voice_reply_triggers) {
      triggers = settings.keyword_voice_reply_triggers.split(",").map((s) => s.trim().toLowerCase()).filter((s) => s.length > 0);
    }
  } catch {}
  return triggers.some((kw) => t.includes(kw));
}

async function formatEntityQuery(entity, env, config, chatId, memoryManager, lang) {
  const db = env.DB;
  const fa = lang === "fa";
  if (entity === "reminder") {
    const rows = (await db.prepare("SELECT * FROM reminders WHERE status IN ('pending','notified') ORDER BY remind_at_utc ASC LIMIT 10").all()).results || [];
    if (!rows.length) return fa ? "یادآوری فعالی نداری." : "You have no reminders.";
    const lines = rows.map((r, i) => `${i + 1}. ${r.title || "(no title)"} — ${formatLocalTime(r.remind_at_utc)}`);
    return (fa ? "📌 یادآوری‌ها:\n" : "📌 Reminders:\n") + lines.join("\n");
  }
  if (entity === "project") {
    const rows = (await db.prepare("SELECT * FROM projects WHERE status IN ('active','paused') ORDER BY updated_at DESC LIMIT 10").all()).results || [];
    if (!rows.length) return fa ? "پروژه فعالی نداری." : "You have no active projects.";
    const lines = rows.map((p, i) => `${i + 1}. ${p.name}${p.status === "paused" ? " (paused)" : ""}`);
    return (fa ? "📁 پروژه‌ها:\n" : "📁 Projects:\n") + lines.join("\n");
  }
  if (entity === "event") {
    const rows = (await db.prepare("SELECT * FROM events WHERE next_occurrence_utc >= datetime('now') ORDER BY next_occurrence_utc ASC LIMIT 10").all()).results || [];
    if (!rows.length) return fa ? "رویداد آینده‌ای نداری." : "You have no upcoming events.";
    const lines = rows.map((e, i) => `${i + 1}. ${e.title} — ${formatLocalTime(e.next_occurrence_utc)}`);
    return (fa ? "📅 رویدادها:\n" : "📅 Events:\n") + lines.join("\n");
  }
  if (entity === "memory") {
    const parts = [];
    const facts = (await db.prepare("SELECT * FROM profile_facts ORDER BY updated_at DESC LIMIT 8").all()).results || [];
    if (facts.length) parts.push((fa ? "🧠 حقایق:\n" : "🧠 Facts:\n") + facts.map((f) => `- ${f.fact_key}: ${f.fact_value}`).join("\n"));
    const lt = (await db.prepare("SELECT * FROM memory_long_term ORDER BY last_accessed_at DESC LIMIT 8").all()).results || [];
    if (lt.length) parts.push((fa ? "📚 حافظه بلندمدت:\n" : "📚 Long-term memory:\n") + lt.map((m) => `- ${m.title}`).join("\n"));
    if (!parts.length) return fa ? "چیز خاصی ذخیره نکرده‌ام." : "I haven't stored anything notable.";
    return parts.join("\n\n");
  }
  return fa ? "متوجه نشدم." : "I didn't catch that.";
}

async function handleDailyPlanTelegram(config, env, request) {
  try {
    const { DailyPlanManager } = await import("../lib/daily-plan.js");
    const ownerId = String(config.OWNER_TELEGRAM_ID || "");
    if (!ownerId) return { message: "Daily Plan is not available right now." };
    const origin = request ? new URL(request.url).origin : "";
    const mgr = new DailyPlanManager(config, env, { info: log.info, error: log.error, warn: log.warn }, env.DB);
    const baseUrl = await mgr.getAppBaseUrl(origin);
    const plan = await mgr.ensureTodayPlan(ownerId);
    const link = `${baseUrl.replace(/\/+$/, "")}/question/${plan.access_token}`;
    const tz = await mgr.getTimezone();
    const { localParts } = await import("../lib/daily-plan.js");
    const today = localParts(tz).date;
    const keyboard = { inline_keyboard: [[{ text: "📋 باز کردن پلن امروز", url: link }]] };
    if (plan.status === "plan_generated" || plan.status === "questionnaire_completed" || plan.status === "no_plan_data") {
      const text = `برنامه امروز (${today}):`;
      const { sendTelegramMessage } = await import("./telegram.js");
      await sendTelegramMessage(config, ownerId, text, { reply_markup: keyboard });
      return { message: "برنامه امروز آماده است." };
    }
    const text = `برنامه امروزت رو بسازیم (${today}):`;
    const { sendTelegramMessage } = await import("./telegram.js");
    await sendTelegramMessage(config, ownerId, text, { reply_markup: keyboard });
    if (plan.status === "questionnaire_pending" && !plan.questionnaire_sent_at) {
      await env.DB.prepare("UPDATE daily_plans SET questionnaire_sent_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").bind(plan.id).run();
    }
    return { message: "چک‌این روزانه فرستاده شد." };
  } catch (error) {
    await log(env.DB, "warn", "daily_plan_telegram_failed", { error: error.message });
    return { message: "برنامه امروز فعلاً در دسترس نیست." };
  }
}

// Respond to a Decision. Returns:
//   { responseText, media, wantsVoice, manualFallback, webSearchExecuted, workflowError, entityActionLabel }
export async function respondToDecision({
  decision,
  telegramMessage,
  message,
  chatId,
  session,
  settings = {},
  config,
  env,
  aiManager,
  memoryManager,
  conversationHistory = [],
  finalMemoryContext = "",
  activeCustomWorkflows = [],
  request = null,
  isVoiceInput = false,
}) {
  const language = decision.language || "en";
  const cap = decision.capability;
  let responseText = null;
  let media = null; // { image_base64 } | { audio_base64 }
  let wantsVoice = false;
  let manualFallback = false;
  let webSearchExecuted = false;
  let workflowError = null;
  let entityActionLabel = null;

  // Judge genuinely failed and manual fallback is enabled → command menu.
  if (
    settings["judge_manual_fallback_enabled"] === "true"
    && decision.source === "judge"
    && decision.judgeResult?._debugError
    && decision.capabilityId === "normal_chat"
  ) {
    const commandLines = buildCommandHelp(activeCustomWorkflows);
    responseText = pick(
      language,
      `سیستم دسته‌بندی الان مشکل فنی داره و نمی‌تونم خودم تشخیص بدم چی می‌خوای. 🙏 لطفاً خودت یکی از این دستورها رو بفرست (مثلاً /web_search قیمت بیت‌کوین):\n\n${commandLines}`,
      `Something went wrong with my routing and I couldn't decide what you need. Please pick one manually (e.g. /web_search bitcoin price):\n\n${commandLines}`
    );
    manualFallback = true;
    return { responseText, media, wantsVoice, manualFallback, webSearchExecuted, workflowError, entityActionLabel };
  }

  // Entity action (edit/delete/complete) — the deterministic action layer decides
  // the actual outcome.
  if (decision.action) {
    const managers = {
      MemoryManager: memoryManager,
      ReminderManager: new ReminderManager(config, null, { info: log.info, error: log.error, warn: log.warn }, env.DB),
      ProjectManager: new ProjectManager(config, null, { info: log.info, error: log.error, warn: log.warn }, env.DB),
    };
    const actionParams = {
      ...decision.action.params,
      message: telegramMessage,
      chat_id: chatId,
      replied_to_message_id: telegramMessage.replied_to_message_id || null,
      lang: language,
    };
    const result = await executeAction(decision.action.type, actionParams, managers, config);
    responseText = summarizeActionResults([result]);
    entityActionLabel = decision.action.type;
    const taskDebug = { label: decision.action.type, ok: !!(result && result.success), error: result && result.error ? sanitize(result.error) : null };
    return { responseText, media, wantsVoice, manualFallback, webSearchExecuted, workflowError, entityActionLabel, taskDebug };
  }

  // Entity query (list/show existing items).
  if (decision.query) {
    responseText = await formatEntityQuery(decision.query.entity, env, config, chatId, memoryManager, language);
    return { responseText, media, wantsVoice, manualFallback, webSearchExecuted, workflowError, entityActionLabel };
  }

  // Entity management without a resolvable operation.
  if (decision.needsClarification || decision.capabilityId === "entity_manage") {
    responseText = t(language, "entity_clarify");
    const taskDebug = { label: "entity_manage", ok: false, error: "No resolvable action was determined; no database change was made" };
    return { responseText, media, wantsVoice, manualFallback, webSearchExecuted, workflowError, entityActionLabel, taskDebug };
  }

  // Reminder creation (with explicit pending-intent continuation).
  if (decision.capabilityId === "task_or_reminder") {
    let text = decision.messageText;
    if (decision.pending && decision.pending.collected && decision.pending.collected.text) {
      text = `${decision.pending.collected.text} ${text}`;
    }
    const reminderMsg = { ...message, text, chat: message.chat || { id: chatId } };
    const outcome = await handleReminderCreate(config, env, reminderMsg, language, aiManager, settings["timezone"] || "Asia/Tehran", session?.id || null);
    responseText = outcome.message;
    const taskDebug = { label: "reminder created", ok: outcome.created, error: outcome.created ? null : "reminder was not persisted" };
    return { responseText, media, wantsVoice, manualFallback, webSearchExecuted, workflowError, entityActionLabel, taskDebug };
  }

  // Daily plan.
  if (decision.capabilityId === "daily_plan") {
    const dpOutcome = await handleDailyPlanTelegram(config, env, request);
    responseText = dpOutcome.message;
    return { responseText, media, wantsVoice, manualFallback, webSearchExecuted, workflowError, entityActionLabel };
  }

  // Workflow-backed capability (search, smart_ai, image_generation, tts, stt,
  // and any custom workflow). Admin test runs call runWorkflow directly with the
  // same engine.
  if (cap && cap.handler === "workflow") {
    try {
      const workflowContext = {
        topic: decision.judgeResult?.topic || "",
        systemPrompt: undefined,
        audioBuffer: null,
        workflowId: decision.workflowId || undefined,
        chatId,
        messageText: decision.messageText,
        source: "message",
        selectionSource: decision.source,
        judgeResult: decision.judgeResult,
      };
      const workflowResult = await runWorkflow(decision.capabilityId, decision.messageText, workflowContext, config, env, aiManager);
      if (workflowResult.image_base64) {
        media = { image_base64: workflowResult.image_base64 };
        responseText = "\u{1F3A8}";
      } else if (workflowResult.audio_base64) {
        media = { audio_base64: workflowResult.audio_base64 };
        responseText = "";
      } else {
        responseText = workflowResult.text || "Got it.";
      }
      if (decision.capabilityId === "search") webSearchExecuted = true;
    } catch (err) {
      workflowError = sanitize(err.message);
      responseText = t(language, "workflow_generic_error");
      if (decision.capabilityId === "search") webSearchExecuted = true;
    }
    return { responseText, media, wantsVoice, manualFallback, webSearchExecuted, workflowError, entityActionLabel };
  }

  // Plain chat (and the legacy URL-summary convenience: a message containing a
  // link asks Ava to read it, so fetch + summarize instead of guessing).
  if (decision.capabilityId === "normal_chat" || cap?.handler === "chat") {
    const text = decision.messageText;
    const urlMatch = String(text || "").match(/https?:\/\/[^\s]+/i);
    if (urlMatch) {
      try {
        const pageContent = await fetchUrlContent(urlMatch[0]);
        const urlSummaryPrompt = `You are Ava. Summarize the following web page content concisely for the user, in their own language. Focus on the key points only.\n\nPage content:\n${pageContent}`;
        const aiResponse = await aiManager.chat([{ role: "user", content: urlSummaryPrompt }], { capabilities: ["chat"] });
        responseText = aiResponse.content || t(language, "url_read_error");
      } catch (urlError) {
        responseText = t(language, "url_read_error");
      }
    } else {
      try {
        const nowTehran = new Date().toLocaleString("en-US", { timeZone: "Asia/Tehran", weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
        let basePersona = await getPersona(env.DB, settings);
        const isTaskMode = (session && session.mode === "task");
        basePersona += isTaskMode
          ? " You are currently in task management mode. Be concise, action-oriented, and focused on getting things done efficiently. Use clear, directive language."
          : " You are currently in chat mode. Be warm, conversational, and friendly. Engage naturally with the user.";
        const thinkingPrompt = `First, think step-by-step about what the user really needs. Consider:
1. What is the user's intent?
2. What information do they need?
3. What is the most helpful response?
Then provide your final answer.

${basePersona}

The current real date and time (Asia/Tehran timezone) is: ${nowTehran}. Always use this as the true current date/time when the user asks about time, dates, or anything time-relative like "today", "tomorrow", or "how much time is left" — never guess or say you don't know the time.

Context about the user you are talking to:
${finalMemoryContext}`;
        const aiResponse = await aiManager.chat(
          [...conversationHistory, { role: "user", content: text || "" }],
          { capabilities: ["chat"], systemPrompt: thinkingPrompt }
        );
        responseText = aiResponse.content || "Got it.";
        if (isVoiceInput || await isVoiceReplyRequest(text, env, settings)) wantsVoice = true;
      } catch (aiError) {
        responseText = t(language, "ai_error_saved");
        await memoryManager.saveShortTerm(chatId, "pending_message", text || "", 2, {});
      }
    }
    return { responseText, media, wantsVoice, manualFallback, webSearchExecuted, workflowError, entityActionLabel };
  }

  // Fallback.
  responseText = "Got it.";
  return { responseText, media, wantsVoice, manualFallback, webSearchExecuted, workflowError, entityActionLabel };
}
