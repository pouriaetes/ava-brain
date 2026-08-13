// Telegram webhook handler — owner-only, secret verification, typing, routing.
// This file is a thin shell: authentication, dedupe, voice transcription, context
// assembly, then it delegates the routing decision to decide.js and the reply to
// respond.js. All decision logic (commands, session state, keyword matching,
// Judge, workflow resolution, entity actions) lives in one place.

import { log } from "../lib/logger.js";
import { sendTelegramMessage, sendTypingAction, downloadTelegramFile, sendTelegramAudio, sendTelegramPhoto } from "../lib/telegram.js";
import { MemoryManager } from "../lib/memory.js";
import { SessionManager } from "../lib/sessions.js";
import { AIProviderManager } from "../lib/ai.js";
import { encrypt, decrypt } from "../lib/crypto.js";
import { getSettingsBatch } from "../lib/settings.js";
import { decideMessage } from "../lib/decide.js";
import { respondToDecision } from "../lib/respond.js";
import { setManualFallback } from "../lib/state.js";
import { chatJson } from "../lib/json-ai.js";
import { sanitizeJudgeDebugError } from "../lib/judge.js";

// Upper bound for the assembled conversational memory context passed to AI calls.
const MAX_MEMORY_CONTEXT_CHARS = 6000;

// Judge Debug structured output — display-only mapping of capability ids to the
// labels shown in the diagnostic block.
const DEBUG_CAPABILITY_LABELS = {
  task_or_reminder: "task",
  daily_plan: "daily_plan",
  normal_chat: "just_chat",
  smart_ai: "smart_ai",
  search: "web-search",
  image_generation: "image_generation",
  tts: "tts",
  stt: "stt",
  entity_manage: "entity_manage"
};

function formatProviderInfo(aiManager, capabilities) {
  const caps = Array.isArray(capabilities) ? capabilities : [capabilities];
  for (const cap of caps) {
    const entry = aiManager && aiManager.lastAttempts && aiManager.lastAttempts[cap];
    if (entry && entry.providers && entry.providers.length > 0) {
      return {
        provider: entry.ok ? entry.providers[entry.providers.length - 1] : entry.providers.join(", "),
        ok: !!entry.ok,
        error: entry.error || null
      };
    }
  }
  return { provider: null, ok: true, error: null };
}

function buildJudgeDebugBlock(d) {
  const lines = ["Judge:"];
  lines.push(`    enabled = ${d.judge.enabled}`);
  lines.push(`    decision = ${d.judge.decision}`);
  if (d.judge.result) lines.push(`    result = ${d.judge.result}`);
  if (d.judge.error) lines.push(`    error = ${d.judge.error}`);
  if (d.task) {
    lines.push("");
    lines.push("Task:");
    lines.push(`    ${d.task.label} = ${d.task.ok}`);
    if (!d.task.ok) {
      lines.push("    result = failed");
      if (d.task.error) lines.push(`    error = ${d.task.error}`);
    }
  }
  if (d.webSearch) {
    lines.push("");
    lines.push("Web search:");
    lines.push(`    executed = ${d.webSearch.executed}`);
    lines.push(`    result = ${d.webSearch.ok ? "success" : "failed"}`);
    if (d.webSearch.error) lines.push(`    error = ${d.webSearch.error}`);
  }
  if (d.response) {
    lines.push("");
    lines.push("Response generation:");
    if (d.response.provider) lines.push(`    provider = ${sanitizeJudgeDebugError(d.response.provider)}`);
    lines.push(`    result = ${d.response.ok ? "success" : "failed"}`);
    if (d.response.error) lines.push(`    error = ${d.response.error}`);
  }
  return lines.join("\n");
}

async function deleteTelegramMessage(config, chatId, messageId) {
  const { TELEGRAM_BOT_TOKEN } = config;
  if (!TELEGRAM_BOT_TOKEN || !chatId || !messageId) return;
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId }),
    });
  } catch (error) {}
}

// Auto-learn durable personal facts from the conversation (side effect, not a reply).
async function maybeExtractProfileFacts({ decision, message, aiManager, memoryManager, settings }) {
  const excluded = ["task_or_reminder", "daily_plan", "search", "image_generation", "tts", "stt", "entity_manage"];
  const text = message.text || "";
  if (excluded.includes(decision.capabilityId)) return;
  if (text.length <= 10 || text.startsWith("/")) return;
  try {
    const extractionPrompt = `Analyze this message from a user and determine if it reveals any durable personal fact about them (their name, occupation, field of study, location, a preference, a skill, or similar). If yes, respond with ONLY a compact JSON object like {"category": "personal", "fact_key": "name", "fact_value": "Pouria", "confidence": 0.9} — if there are multiple facts, respond with a JSON array of such objects. If there is no clear durable personal fact in this message, respond with exactly: none\n\nMessage: "${text}"`;
    let extractedText = "";
    try {
      const first = await aiManager.chat(
        [{ role: "user", content: extractionPrompt }],
        { capabilities: ["chat"] }
      );
      extractedText = String(first?.content ?? "").trim();
    } catch {}
    if (extractedText && extractedText.toLowerCase() !== "none") {
      try {
        const { parsed } = await chatJson(
          aiManager,
          [{ role: "user", content: extractionPrompt }],
          { capabilities: ["chat"], temperature: 0.1 }
        );
        const factsArray = Array.isArray(parsed) ? parsed : [parsed];
        for (const fact of factsArray) {
          if (fact.category && fact.fact_key && fact.fact_value) {
            await memoryManager.upsertProfileFact(fact.category, fact.fact_key, fact.fact_value, fact.confidence || 0.7, "auto_extracted", true);
          }
        }
      } catch {}
    }
  } catch {}
}

export async function handleTelegramWebhook(request, env, config, ctx) {
  const start = Date.now();

  try {
    // 1. Verify secret token header
    const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
    if (secret !== config.TELEGRAM_WEBHOOK_SECRET) {
      await log(env.DB, "warn", "webhook_unauthorized", {}, ctx);
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = await request.json();
    if (!body.message && !body.callback_query) {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    // Dedupe: Telegram uses "at least once" delivery; short-circuit processed ids.
    const updateId = body.update_id;
    if (updateId != null) {
      const dedupeKey = `update:${updateId}`;
      try {
        const seen = await env.KV.get(dedupeKey);
        if (seen) {
          return new Response(JSON.stringify({ ok: true }), {
            headers: { "Content-Type": "application/json" }
          });
        }
        await env.KV.put(dedupeKey, "1", { expirationTtl: 3600 });
      } catch (e) {}
    }

    const fromId = String(body.message?.from?.id || body.callback_query?.from?.id || "");
    const chatId = String(body.message?.chat?.id || body.callback_query?.message?.chat?.id || "");
    const chatType = body.message?.chat?.type || body.callback_query?.message?.chat?.type || "private";
    if (!chatId) {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" }
      });
    }
    if (fromId !== String(config.OWNER_TELEGRAM_ID)) {
      if (chatType === "group" || chatType === "supergroup") {
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json" }
        });
      }
      await sendTelegramMessage(config, chatId, "This bot is private.");
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    const message = body.message || body.callback_query?.message;
    if (!message) {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Reply targeting context.
    const replyMessage = message.reply_to_message || null;
    const replyContext = replyMessage ? {
      message_id: replyMessage.message_id,
      chat_id: replyMessage.chat?.id || chatId,
      from_id: replyMessage.from?.id,
      text: replyMessage.text || replyMessage.caption || "",
    } : null;

    // 3. Typing indicator
    await sendTypingAction(config, chatId);

    const messageText = message.text || "";

    // Direct /slash utility commands that are not part of the decision model.
    if (messageText.startsWith("/")) {
      if (messageText === "/status") {
        return await handleStatusCommand(env, config, chatId, ctx);
      }
      if (messageText === "/help") {
        const { buildCommandHelp } = await import("../capabilities.js");
        const custom = (await env.DB.prepare("SELECT name, capability FROM workflows WHERE is_default = 0 AND enabled = 1 AND capability != 'normal_chat' ORDER BY name ASC").all()).results || [];
        const helpText = `Available commands:\n/start - Start the bot\n/help - Show this help\n/status - Show system status\n/forget <text> - Delete memory\n/judge_on - Enable Judge routing for this chat\n/judge_off - Disable Judge routing for this chat\n\n${buildCommandHelp(custom)}`;
        await sendTelegramMessage(config, chatId, helpText);
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json" }
        });
      }
      if (messageText === "/judge-off" || messageText === "/judge_off" || messageText === "/judge-on" || messageText === "/judge_on") {
        return await handleJudgeToggleCommand(env, config, chatId, messageText, ctx);
      }
    }

    // OPT-001: single AI provider manager for this request.
    let aiManager = null;
    try {
      aiManager = new AIProviderManager(config, { encrypt, decrypt }, { info: log.info, error: log.error, warn: log.warn }, env.DB);
      await aiManager.initialize();
    } catch (initError) {
      await log(env.DB, "warn", "ai_provider_init_failed", { error: initError.message }, ctx);
    }

    // 3.5. Voice message transcription.
    let isVoiceInput = false;
    if (message.voice && message.voice.file_id) {
      try {
        const audioBuffer = await downloadTelegramFile(config, message.voice.file_id);
        const transcription = await aiManager.transcribeAudio(audioBuffer, { capabilities: ["stt"] });
        if (transcription?.text) {
          message.text = transcription.text;
          isVoiceInput = true;
        } else {
          await sendTelegramMessage(config, chatId, "Sorry, I couldn't understand the voice message.");
          return new Response(JSON.stringify({ ok: true }), {
            headers: { "Content-Type": "application/json" }
          });
        }
      } catch (voiceError) {
        await log(env.DB, "warn", "voice_transcription_failed", { error: voiceError.message }, ctx);
        await sendTelegramMessage(config, chatId, "Sorry, I couldn't process that voice message right now.");
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    // 4. Session + memory context + settings (independent, run concurrently).
    const sessionManager = new SessionManager(config, null, { info: log.info, error: log.error, warn: log.warn }, env.DB);
    const memoryManager = new MemoryManager(config, null, { info: log.info, error: log.error, warn: log.warn }, env.DB);
    const [session, memoryContext, recentTurns, settingsMap] = await Promise.all([
      sessionManager.getOrCreateSession(chatId),
      memoryManager.getRelevantMemory(chatId, message.text || ""),
      memoryManager.getShortTerm(chatId, 12),
      getSettingsBatch(env.DB, ["judge_provider_id", "daily_plan_enabled", "judge_routing_enabled", "judge_debug_enabled", "judge_manual_fallback_enabled", "timezone", "persona", "keyword_voice_reply_triggers"]),
    ]);
    const conversationHistory = (recentTurns || [])
      .filter((entry) => entry.type === "user_message" || entry.type === "assistant_reply")
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      .map((entry) => ({
        role: entry.type === "assistant_reply" ? "assistant" : "user",
        content: entry.content || ""
      }));
    const telegramUserName = message.from?.first_name || "";
    let finalMemoryContext = telegramUserName ? `The user's Telegram first name is: ${telegramUserName}\n\n${memoryContext}` : memoryContext;
    if (finalMemoryContext.length > MAX_MEMORY_CONTEXT_CHARS) {
      finalMemoryContext = finalMemoryContext.substring(0, MAX_MEMORY_CONTEXT_CHARS);
    }

    const telegramMessage = {
      from: message.from,
      chat: message.chat,
      message_id: message.message_id,
      text: message.text,
      date: message.date,
      entities: message.entities,
      replied_to_message_id: replyContext ? replyContext.message_id : null,
      reply_to_text: replyContext ? replyContext.text : null,
    };

    // 5. Active custom workflows the decision system can pick semantically.
    let activeCustomWorkflows = [];
    try {
      activeCustomWorkflows = (await env.DB.prepare(
        "SELECT id, name, description, capability FROM workflows WHERE is_default = 0 AND enabled = 1"
      ).all()).results || [];
    } catch (wfFetchError) {}

    // 6. Single decision.
    const decision = await decideMessage({
      message: telegramMessage,
      session,
      settings: settingsMap,
      config,
      env,
      aiManager,
      activeCustomWorkflows,
    });

    // Clean up messages consumed by a manual-fallback draft re-run.
    if (decision.deleteMessageIds && decision.deleteMessageIds.length > 0) {
      for (const mid of decision.deleteMessageIds) {
        await deleteTelegramMessage(config, chatId, mid);
      }
    }

    // Reset per-capability provider attempt tracking so the debug "Response
    // generation" section reflects only the calls made while producing the reply.
    if (aiManager && typeof aiManager.resetAttempts === "function") {
      aiManager.resetAttempts();
    }

    // 7. Respond.
    const outcome = await respondToDecision({
      decision,
      telegramMessage,
      message,
      chatId,
      session,
      settings: settingsMap,
      config,
      env,
      aiManager,
      memoryManager,
      conversationHistory,
      finalMemoryContext,
      activeCustomWorkflows,
      request,
      isVoiceInput,
    });

    // 8. Send response.
    let telegramResponseText = outcome.responseText || "";
    if (settingsMap["judge_debug_enabled"] === "true") {
      const debugBlock = buildJudgeDebugBlock({
        judge: buildJudgeDebugState(decision, outcome),
        task: buildTaskDebugState(decision, outcome),
        webSearch: outcome.webSearchExecuted
          ? { executed: true, ok: !outcome.workflowError, error: outcome.workflowError ? sanitizeJudgeDebugError(outcome.workflowError) : undefined }
          : null,
        response: buildResponseDebugState(aiManager, outcome),
      });
      telegramResponseText = telegramResponseText ? `${debugBlock}\n\n${telegramResponseText}` : debugBlock;
    }

    if (outcome.media && outcome.media.image_base64) {
      await sendTelegramPhoto(config, chatId, outcome.media.image_base64, "");
    } else if (outcome.media && outcome.media.audio_base64) {
      await sendTelegramAudio(config, chatId, outcome.media.audio_base64, "");
    }

    if (telegramResponseText) {
      if (outcome.wantsVoice) {
        try {
          const speechResult = await aiManager.textToSpeech(telegramResponseText, { capabilities: ["tts"] });
          if (speechResult?.audio_base64) {
            await sendTelegramAudio(config, chatId, speechResult.audio_base64, "");
          } else {
            await sendTelegramMessage(config, chatId, telegramResponseText, { parse_mode: "HTML" });
          }
        } catch (ttsError) {
          await sendTelegramMessage(config, chatId, telegramResponseText, { parse_mode: "HTML" });
        }
      } else {
        const sendResults = await sendTelegramMessage(config, chatId, telegramResponseText, { parse_mode: "HTML" });
        if (outcome.manualFallback && session?.id) {
          const sentMessageId = Array.isArray(sendResults) && sendResults[0]?.result?.message_id != null
            ? sendResults[0].result.message_id
            : null;
          await setManualFallback(env.DB, session.id, { originalText: message.text || "", messageId: sentMessageId });
        }
      }
    }

    // 9. Side effects: profile-fact extraction, session mode, summary, memory.
    if (aiManager) {
      await maybeExtractProfileFacts({ decision, message, aiManager, memoryManager, settings: settingsMap });
    }

    const judgeMode = decision.capabilityId === "task_or_reminder" ? "task" : "chat";
    if (session?.id && judgeMode !== (session.mode || "chat")) {
      await sessionManager.updateSessionMode(session.id, judgeMode);
    }

    if (session?.id) {
      const newSummary = `${(session.summary || "")} ${message.text?.substring(0, 100)}`.trim().substring(0, 500);
      await sessionManager.updateSessionSummary(session.id, newSummary);
    }
    await memoryManager.saveShortTerm(chatId, "user_message", message.text || "", 1, { source_message_id: message.message_id });
    await memoryManager.saveShortTerm(chatId, "assistant_reply", telegramResponseText || outcome.responseText || "", 1, {});

    await env.DB
      .prepare("UPDATE settings SET value = ?, updated_at = datetime('now') WHERE key = 'last_interaction_at'")
      .bind(new Date().toISOString())
      .run();

    await log(env.DB, "info", "telegram_message", {
      chat_id: chatId,
      capability: decision.capabilityId,
      source: decision.source,
      workflow: decision.workflowId || null,
      elapsed: Date.now() - start,
    }, ctx);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Telegram error:", error);
    await log(env.DB, "error", "telegram_webhook", { error: error.message }, ctx);
    return new Response(JSON.stringify({ ok: false, error: "Internal error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

// --- debug helpers -----------------------------------------------------------

function buildJudgeDebugState(decision, outcome) {
  if (decision.source === "judge") {
    if (decision.judgeResult?._debugError) {
      return { enabled: true, decision: "unavailable", result: "failed", error: sanitizeJudgeDebugError(decision.judgeResult._debugError) };
    }
    return { enabled: true, decision: DEBUG_CAPABILITY_LABELS[decision.capabilityId] || decision.capabilityId || "unknown", result: null, error: null };
  }
  if (decision.capabilityId === "task_or_reminder") {
    return { enabled: false, decision: "task", result: null, error: null };
  }
  return { enabled: false, decision: "just_chat", result: null, error: null };
}

function buildTaskDebugState(decision, outcome) {
  if (outcome.taskDebug) {
    return {
      label: outcome.taskDebug.label,
      ok: outcome.taskDebug.ok,
      error: outcome.taskDebug.error ? sanitizeJudgeDebugError(outcome.taskDebug.error) : null,
    };
  }
  if (decision.capabilityId === "task_or_reminder") {
    return { label: "reminder created", ok: false, error: "reminder flow produced no result" };
  }
  if (decision.needsClarification) {
    return { label: "entity_manage", ok: false, error: "No resolvable action was determined; no database change was made" };
  }
  return null;
}

function buildResponseDebugState(aiManager, outcome) {
  if (outcome.media) return { ok: true, provider: null };
  if (outcome.workflowError) {
    const rg = formatProviderInfo(aiManager, ["chat", "smart_ai"]);
    return { ok: false, provider: rg.provider, error: sanitizeJudgeDebugError(outcome.workflowError) };
  }
  const rg = formatProviderInfo(aiManager, ["chat", "smart_ai"]);
  return { ok: true, provider: rg.provider };
}

// --- /status, /judge_on|off commands -----------------------------------------

async function handleStatusCommand(env, config, chatId, ctx) {
  try {
    let statusMessage = "📊 *Status Report*\n\n";
    const sessionInfo = await env.DB.prepare("SELECT id, mode, last_active_at FROM sessions WHERE chat_id = ? ORDER BY last_active_at DESC LIMIT 1").bind(chatId).first();
    statusMessage += `Mode: ${sessionInfo?.mode || 'chat'}\n`;
    statusMessage += `Last Active: ${sessionInfo?.last_active_at || 'N/A'}\n\n`;

    const sessionManagerStatus = new SessionManager(config, null, { info: log.info, error: log.error, warn: log.warn }, env.DB);
    const judgeStatus = sessionInfo?.id
      ? await sessionManagerStatus.getEffectiveJudgeState(sessionInfo.id)
      : { globalEnabled: false, chatOverride: null, enabled: false };
    const chatOverrideLabel = judgeStatus.chatOverride === null ? "NO OVERRIDE" : (judgeStatus.chatOverride ? "OFF" : "ON");
    statusMessage += `🧠 Judge Routing: ${judgeStatus.enabled ? 'ON' : 'OFF'}\n`;
    statusMessage += `   Global Judge: ${judgeStatus.globalEnabled ? 'ON' : 'OFF'}\n`;
    statusMessage += `   This Chat: ${chatOverrideLabel}\n`;
    statusMessage += `   Effective: ${judgeStatus.enabled ? 'ON' : 'OFF'}\n`;
    statusMessage += "\n";

    const reminderCount = await env.DB.prepare("SELECT COUNT(*) as count FROM reminders WHERE status = 'pending'").first();
    statusMessage += `⏰ Pending Reminders: ${reminderCount?.count || 0}\n`;
    const projectCount = await env.DB.prepare("SELECT COUNT(*) as count FROM projects WHERE status = 'active'").first();
    statusMessage += `🚀 Active Projects: ${projectCount?.count || 0}\n\n`;

    await sendTelegramMessage(config, chatId, statusMessage, { parse_mode: "Markdown" });
    return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
  } catch (cmdError) {
    await log(env.DB, "warn", "command_error", { error: cmdError.message, command: "/status" }, ctx);
    return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
  }
}

async function handleJudgeToggleCommand(env, config, chatId, command, ctx) {
  const disabled = command === "/judge-off" || command === "/judge_off";
  const sessionManager = new SessionManager(config, null, { info: log.info, error: log.error, warn: log.warn }, env.DB);
  const session = await sessionManager.getOrCreateSession(chatId);
  if (session?.id) {
    await sessionManager.setJudgeOverride(session.id, disabled);
  }
  const judgeStatus = session?.id
    ? await sessionManager.getEffectiveJudgeState(session.id)
    : { globalEnabled: false, chatOverride: disabled, enabled: false };
  const chatOverrideLabel = judgeStatus.chatOverride === null ? "NO OVERRIDE" : (judgeStatus.chatOverride ? "OFF" : "ON");
  let statusMsg = `🧠 Judge routing ${disabled ? "OFF" : "ON"} for this chat.\n\nGlobal Judge: ${judgeStatus.globalEnabled ? 'ON' : 'OFF'}\nThis chat: ${chatOverrideLabel}\nEffective: ${judgeStatus.enabled ? 'ON' : 'OFF'}`;
  if (disabled) {
    statusMsg += `\n\nSend /judge_on to re-enable for this chat.`;
  } else if (!judgeStatus.enabled) {
    statusMsg += `\n\nJudge is globally disabled by the administrator.`;
  }
  await sendTelegramMessage(config, chatId, statusMsg);
  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
}
