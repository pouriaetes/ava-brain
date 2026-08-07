// Telegram webhook handler — owner-only, secret verification, typing, routing
import { getSession } from "../lib/auth.js";
import { log } from "../lib/logger.js";
import { sendTelegramMessage, sendTypingAction, downloadTelegramFile, sendTelegramAudio } from "../lib/telegram.js";
import { routeIntent } from "../lib/router.js";
import { executeAction } from "../lib/validator.js";
import { MemoryManager } from "../lib/memory.js";
import { ReminderManager } from "../lib/reminders.js";
import { ProjectManager } from "../lib/projects.js";
import { RoutineManager } from "../lib/routines.js";
import { SessionManager } from "../lib/sessions.js";
import { AIProviderManager } from "../lib/ai.js";
import { encrypt, decrypt } from "../lib/crypto.js";

export async function handleTelegramWebhook(request, env, config, ctx) {
  const start = Date.now();

  try {
    // 1. Verify secret token header
    const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
    if (secret !== config.TELEGRAM_WEBHOOK_SECRET) {
      await log(env.DB, "warn", "webhook_unauthorized", {});
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

    // 3. Typing indicator
    await sendTypingAction(config, chatId);

    // 3.5. Voice message transcription
    let isVoiceInput = false;
    if (message.voice && message.voice.file_id) {
      try {
        const audioBuffer = await downloadTelegramFile(config, message.voice.file_id);
        const aiManagerStt = new AIProviderManager(config, { encrypt, decrypt }, { info: log.info, error: log.error, warn: log.warn }, env.DB);
        await aiManagerStt.initialize();
        const transcription = await aiManagerStt.transcribeAudio(audioBuffer, { capabilities: ["stt"] });
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
        await log(env.DB, "warn", "voice_transcription_failed", { error: voiceError.message });
        await sendTelegramMessage(config, chatId, "Sorry, I couldn't process that voice message right now.");
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    // 4. Get or create session
    const sessionManager = new SessionManager(config, null, { info: log.info, error: log.error, warn: log.warn }, env.DB);
    const session = await sessionManager.getOrCreateSession(chatId);

    // 5. Get memory context
    const memoryManager = new MemoryManager(config, null, { info: log.info, error: log.error, warn: log.warn }, env.DB);
    const memoryContext = await memoryManager.getRelevantMemory(chatId, message.text || "");
    const recentTurns = await memoryManager.getShortTerm(chatId, 12);
    const conversationHistory = (recentTurns || [])
      .filter((entry) => entry.type === "user_message" || entry.type === "assistant_reply")
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      .map((entry) => ({
        role: entry.type === "assistant_reply" ? "assistant" : "user",
        content: entry.content || ""
      }));
    const telegramUserName = message.from?.first_name || "";
    const finalMemoryContext = telegramUserName ? `The user's Telegram first name is: ${telegramUserName}\n\n${memoryContext}` : memoryContext;

    // 6. Build message for router
    const telegramMessage = {
      from: message.from,
      chat: message.chat,
      message_id: message.message_id,
      text: message.text,
      date: message.date,
      entities: message.entities,
    };

    // 7. Route intent
    const routing = await routeIntent(telegramMessage, config, env, {
      id: session?.id || "",
      summary: session?.summary || "",
    });

    let reminderDraftContent = "";
    try {
      const draftRow = await env.DB.prepare(
        "SELECT content FROM memory_short_term WHERE session_id = ? AND type = 'reminder_draft' AND expires_at > ? ORDER BY created_at DESC LIMIT 1"
      ).bind(chatId, new Date().toISOString()).first();

      reminderDraftContent = draftRow?.content || "";
    } catch {
      reminderDraftContent = "";
    }

    if (
      reminderDraftContent &&
      looksLikeReminderFollowUp(String(message.text || ""))
    ) {
      routing.intent = "reminder_create";
    }

    if (routing.intent === "reminder_create") {
      const reminderOverrideText = reminderDraftContent
        ? `${reminderDraftContent}\n${message.text || ""}`
        : (message.text || "");

      const reminderOutcome = await handleReminderCreate(
        config,
        env,
        message,
        routing,
        chatId,
        reminderOverrideText
      );

      routing.actions = [];
      routing.response_hint = reminderOutcome.message;
    }

    // 8. Handle actions from routing
    const actionResults = [];
    if (routing.actions && routing.actions.length > 0) {
      const managers = {
        MemoryManager: memoryManager,
        ReminderManager: new ReminderManager(config, null, { info: log.info, error: log.error, warn: log.warn }, env.DB),
        ProjectManager: new ProjectManager(config, null, { info: log.info, error: log.error, warn: log.warn }, env.DB),
        RoutineManager: new RoutineManager(config, null, { info: log.info, error: log.error, warn: log.warn }, env.DB),
      };

      for (const actionName of routing.actions) {
        const result = await executeAction(actionName, { ...routing, message: telegramMessage }, managers, config);
        actionResults.push(result);
      }
    }

    // 9. Save memory if needed
    if (routing.memory_to_save && routing.memory_to_save.length > 0) {
      for (const memType of routing.memory_to_save) {
        await memoryManager.saveShortTerm(chatId, memType, message.text || "", 1, { routing });
      }
    }

    // 10. Generate response
    try {
      if (message.text && message.text.length > 10 && !message.text.startsWith("/")) {
        const extractionPrompt = `Analyze this message from a user and determine if it reveals any durable personal fact about them (their name, occupation, field of study, location, a preference, a skill, or similar). If yes, respond with ONLY a compact JSON object like {"category": "personal", "fact_key": "name", "fact_value": "Pouria", "confidence": 0.9} — if there are multiple facts, respond with a JSON array of such objects. If there is no clear durable personal fact in this message, respond with exactly: none\n\nMessage: "${message.text}"`;
        const aiManagerForExtraction = new AIProviderManager(config, { encrypt, decrypt }, { info: log.info, error: log.error, warn: log.warn }, env.DB);
        await aiManagerForExtraction.initialize();
        const extractionResult = await aiManagerForExtraction.chat(
          [{ role: "user", content: extractionPrompt }],
          { capabilities: ["chat"] }
        );
        const extractedText = (extractionResult.content || "").trim();
        if (extractedText && extractedText.toLowerCase() !== "none") {
          try {
            const jsonStart = extractedText.indexOf("{") !== -1 && (extractedText.indexOf("[") === -1 || extractedText.indexOf("{") < extractedText.indexOf("["))
              ? extractedText.indexOf("{")
              : extractedText.indexOf("[");
            const jsonEnd = Math.max(extractedText.lastIndexOf("}"), extractedText.lastIndexOf("]")) + 1;
            if (jsonStart !== -1 && jsonEnd > jsonStart) {
              const parsed = JSON.parse(extractedText.substring(jsonStart, jsonEnd));
              const factsArray = Array.isArray(parsed) ? parsed : [parsed];
              for (const fact of factsArray) {
                if (fact.category && fact.fact_key && fact.fact_value) {
                  await memoryManager.upsertProfileFact(fact.category, fact.fact_key, fact.fact_value, fact.confidence || 0.7, "auto_extracted", true);
                }
              }
            }
          } catch {
          }
        }
      }
    } catch (extractionError) {
      await log(env.DB, "warn", "profile_fact_extraction_failed", { error: extractionError.message });
    }
    let responseText;
    if (routing.response_hint) {
      responseText = routing.response_hint;
    } else if (routing.intent === "general_chat" || routing.intent === "voice_reply_request") {
      // Try AI response
      try {
        const aiManager = new AIProviderManager(config, { encrypt, decrypt }, { info: log.info, error: log.error, warn: log.warn }, env.DB);
        await aiManager.initialize();
        const nowTehran = new Date().toLocaleString("en-US", { timeZone: "Asia/Tehran", weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
        const systemPromptText = await getPersona(env.DB) + `\n\nThe current real date and time (Asia/Tehran timezone) is: ${nowTehran}. Always use this as the true current date/time when the user asks about time, dates, or anything time-relative like "today", "tomorrow", or "how much time is left" — never guess or say you don't know the time.` + "\n\nContext about the user you are talking to:\n" + finalMemoryContext;
        const aiResponse = await aiManager.chat(
          [
            ...conversationHistory,
            { role: "user", content: message.text || "" }
          ],
          { capabilities: ["chat"], systemPrompt: systemPromptText }
        );
        responseText = aiResponse.content || responseText;
      } catch (aiError) {
        responseText = "AI model connection is currently having issues, I saved your message.";
        await memoryManager.saveShortTerm(chatId, "pending_message", message.text || "", 2, {});
      }
    } else if (routing.intent === "image_request") {
      try {
        const aiManager = new AIProviderManager(config, { encrypt, decrypt }, { info: log.info, error: log.error, warn: log.warn }, env.DB);
        await aiManager.initialize();
        const imageResult = await aiManager.generateImage(message.text || "", { capabilities: ["image_gen"] });
        if (imageResult?.image_base64) {
          const { sendTelegramPhoto } = await import("../lib/telegram.js");
          await sendTelegramPhoto(config, chatId, imageResult.image_base64, "");
          responseText = "\u{1F3A8}";
        } else {
          responseText = "Sorry, I couldn't generate that image right now.";
        }
      } catch (imageError) {
        responseText = "Image generation is currently having issues, please try again later.";
        await log(env.DB, "warn", "image_generation_failed", { error: imageError.message });
      }
    } else if (actionResults.some(r => r?.success)) {
      responseText = "Done.";
    } else {
      responseText = "Got it.";
    }

    // 11. Send response
    if (responseText) {
      const wantsVoiceReply = isVoiceInput || routing.intent === "voice_reply_request";
      if (wantsVoiceReply && routing.intent !== "image_request") {
        try {
          const aiManagerTts = new AIProviderManager(config, { encrypt, decrypt }, { info: log.info, error: log.error, warn: log.warn }, env.DB);
          await aiManagerTts.initialize();
          const speechResult = await aiManagerTts.textToSpeech(responseText, { capabilities: ["tts"] });
          if (speechResult?.audio_base64) {
            await sendTelegramAudio(config, chatId, speechResult.audio_base64, "");
          } else {
            await sendTelegramMessage(config, chatId, responseText, { parse_mode: "HTML" });
          }
        } catch (ttsError) {
          await log(env.DB, "warn", "tts_failed", { error: ttsError.message });
          await sendTelegramMessage(config, chatId, responseText, { parse_mode: "HTML" });
        }
      } else {
        await sendTelegramMessage(config, chatId, responseText, { parse_mode: "HTML" });
      }

      // 12. Update session summary
      if (session?.id) {
        const newSummary = `${(session.summary || "")} ${message.text?.substring(0, 100)}`.trim().substring(0, 500);
        await sessionManager.updateSessionSummary(session.id, newSummary);
      }
      await memoryManager.saveShortTerm(chatId, "user_message", message.text || "", 1, {});
      await memoryManager.saveShortTerm(chatId, "assistant_reply", responseText, 1, {});
    }

    // 13. Update last interaction
    await env.DB
      .prepare("UPDATE settings SET value = ?, updated_at = datetime('now') WHERE key = 'last_interaction_at'")
      .bind(new Date().toISOString())
      .run();

    await log(env.DB, "info", "telegram_message", {
      chat_id: chatId,
      intent: routing.intent,
      elapsed: Date.now() - start,
    });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Telegram error:", error);
    await log(env.DB, "error", "telegram_webhook", { error: error.message });

    // Always respond to user
    try {
      const chatId = "unknown";
      await sendTelegramMessage(config, chatId, "Something went wrong. Don't worry, I've logged the error.");
    } catch {}

    return new Response(JSON.stringify({ ok: false, error: "Internal error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

async function getPersona(db) {
  try {
    const row = await db.prepare("SELECT value FROM settings WHERE key = 'persona'").first();
    return row?.value || "You are Ava, a smart and friendly personal assistant.";
  } catch {
    return "You are Ava, a smart and friendly personal assistant.";
  }
}

function parseReminderJson(text) {
  try {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}") + 1;
    if (start === -1 || end <= start) return null;
    return JSON.parse(text.slice(start, end));
  } catch {
    return null;
  }
}

function toEnglishDigits(input) {
  return String(input || "")
    .replace(/[۰-۹]/g, (c) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(c)))
    .replace(/[٠-٩]/g, (c) => String("٠١٢٣٤٥٦٧٨٩".indexOf(c)));
}

function looksLikeReminderFollowUp(text) {
  const t = String(text || "").trim();
  if (!t) return false;
  if (t.startsWith("/")) return false;

  return /(ساعت|صبح|بعد\s*از\s*ظهر|عصر|شب|ظهر|امروز|فردا|پس\s*فردا|پس‌فردا|هر\s*روز|هر\s*هفته|هر\s*شب|هر\s*ماه|یادآوری|یاد\s*آوری|یاد\s*اوری|یادم\s*بنداز|یادت\s*باشه|یادت\s*نره|\d{1,2}:\d{2}|[۰-۹]{1,2}[:：][۰-۹]{2})/i.test(t);
}

async function saveReminderDraft(env, chatId, content) {
  try {
    const safeContent = String(content || "").substring(0, 1500);
    if (!chatId || !safeContent) return;

    await env.DB.prepare(
      "DELETE FROM memory_short_term WHERE session_id = ? AND type = 'reminder_draft'"
    ).bind(chatId).run();

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    await env.DB.prepare(
      "INSERT INTO memory_short_term (session_id, type, content, importance, metadata, expires_at) VALUES (?, 'reminder_draft', ?, 3, '{}', ?)"
    ).bind(chatId, safeContent, expiresAt).run();
  } catch (error) {
    try {
      await log.warn(env.DB, "telegram", "save_reminder_draft_failed", { error: error.message });
    } catch {}
  }
}

async function clearReminderDraft(env, chatId) {
  try {
    if (!chatId) return;
    await env.DB.prepare(
      "DELETE FROM memory_short_term WHERE session_id = ? AND type = 'reminder_draft'"
    ).bind(chatId).run();
  } catch (error) {
    try {
      await log.warn(env.DB, "telegram", "clear_reminder_draft_failed", { error: error.message });
    } catch {}
  }
}

function deterministicReminderExtract(text) {
  try {
    const original = String(text || "").replace(/\s+/g, " ").trim();
    const normalized = toEnglishDigits(original).toLowerCase();

    const offsetMs = 3.5 * 60 * 60 * 1000;
    const tehranNow = new Date(Date.now() + offsetMs);

    const hasDaily = /(هر\s*روز|روزانه|every\s*day)/i.test(normalized);
    const hasWeekly = /(هر\s*هفته|هفتگی|every\s*week)/i.test(normalized);
    const hasTomorrow = /(فردا|tomorrow)/i.test(normalized);

    let hour = null;
    let minute = 0;

    const colonMatch = normalized.match(/(\d{1,2})[:：](\d{2})/);
    if (colonMatch) {
      hour = parseInt(colonMatch[1], 10);
      minute = parseInt(colonMatch[2], 10);
    } else {
      const hourMatch =
        normalized.match(/ساعت\s*(\d{1,2})/) ||
        normalized.match(/(\d{1,2})\s*(بعد\s*از\s*ظهر|عصر|شب|صبح|ظهر)/);

      if (hourMatch) {
        hour = parseInt(hourMatch[1], 10);
      }
    }

    if (hour === null || isNaN(hour)) {
      return { success: false, needsInput: true };
    }

    const hasPm = /(بعد\s*از\s*ظهر|عصر|شب)/i.test(normalized);
    const hasAm = /(صبح)/i.test(normalized);

    if (!hasPm && !hasAm && hour < 12 && tehranNow.getUTCHours() >= hour) {
      hour += 12;
    }

    if (hasPm && hour < 12) hour += 12;
    if (hasAm && hour === 12) hour = 0;

    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      return { success: false, needsInput: true };
    }

    let schedule_type = "once";
    if (hasDaily) {
      schedule_type = "daily";
    } else if (
      hasWeekly ||
      /(شنبه|یکشنبه|دوشنبه|سه\s*شنبه|سه‌شنبه|چهارشنبه|پنج\s*شنبه|پنج‌شنبه|جمعه)/i.test(normalized)
    ) {
      schedule_type = "weekly";
    }

    const targetTehran = new Date(
      Date.UTC(
        tehranNow.getUTCFullYear(),
        tehranNow.getUTCMonth(),
        tehranNow.getUTCDate(),
        hour,
        minute,
        0,
        0
      )
    );

    if (hasTomorrow) {
      targetTehran.setUTCDate(targetTehran.getUTCDate() + 1);
    }

    if (schedule_type === "weekly") {
      let targetDay = null;

      if (/یکشنبه/i.test(normalized)) targetDay = 0;
      else if (/دوشنبه/i.test(normalized)) targetDay = 1;
      else if (/سه\s*شنبه|سه‌شنبه/i.test(normalized)) targetDay = 2;
      else if (/چهارشنبه/i.test(normalized)) targetDay = 3;
      else if (/پنج\s*شنبه|پنج‌شنبه/i.test(normalized)) targetDay = 4;
      else if (/جمعه/i.test(normalized)) targetDay = 5;
      else if (/شنبه/i.test(normalized)) targetDay = 6;

      if (targetDay !== null) {
        while (targetTehran.getUTCDay() !== targetDay || targetTehran <= tehranNow) {
          targetTehran.setUTCDate(targetTehran.getUTCDate() + 1);
        }
      } else if (targetTehran <= tehranNow) {
        targetTehran.setUTCDate(targetTehran.getUTCDate() + 7);
      }
    } else if (targetTehran <= tehranNow) {
      targetTehran.setUTCDate(targetTehran.getUTCDate() + 1);
    }

    const remind_at_utc = new Date(targetTehran.getTime() - offsetMs).toISOString();
    const description = original.length > 300 ? original.substring(0, 300) : original;
    const title = original.length > 80 ? original.substring(0, 80) : original;

    return {
      success: true,
      reminder: {
        title,
        description,
        schedule_type,
        remind_at_utc,
        local_time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
        days_of_week: [],
        interval_hours: null,
        delete_after_done: schedule_type === "once"
      }
    };
  } catch {
    return { success: false, needsInput: true };
  }
}

async function extractReminderFromMessage(config, env, messageText) {
  const fallback = deterministicReminderExtract(messageText);

  try {
    const aiManager = new AIProviderManager(
      config,
      { encrypt, decrypt },
      { info: log.info, error: log.error, warn: log.warn },
      env.DB
    );

    await aiManager.initialize();

    const now = new Date();
    const utcIso = now.toISOString();
    const tehranLocal = now.toLocaleString("en-US", {
      timeZone: "Asia/Tehran",
      weekday: "long",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });

    const systemPrompt = [
      "You are the reminder extraction module for Ava.",
      `Current UTC: ${utcIso}`,
      `Current Tehran time: ${tehranLocal}`,
      "The input may be a single reminder request OR a previous reminder request plus the user's clarification.",
      "Combine all provided lines into exactly one reminder.",
      "Return ONLY compact JSON, no markdown.",
      `Schema: {"ok":true,"title":"short label","description":"task text","schedule_type":"once|daily|weekly|monthly|hourly|interval","remind_at_utc":"ISO UTC string","local_time":"HH:MM or empty","days_of_week":[0-6],"interval_hours":number|null,"delete_after_done":boolean}`,
      "Rules:",
      "- Use schedule_type=once for a one-time reminder; delete_after_done=true.",
      "- Use schedule_type=daily for every day, weekly for every week, monthly for every month, hourly for every hour, interval for every N hours.",
      "- If a specific date has no explicit time, use 08:00 Tehran time.",
      "- If only an hour is given without AM/PM, choose the next plausible future occurrence in Tehran time. Do not return ok:false only because AM/PM is missing.",
      "- remind_at_utc must be the next future occurrence, converted from Asia/Tehran to UTC.",
      "- For weekly, Sunday=0.",
      '- If there is no usable time/date at all, return {"ok":false,"missing":"time"}.'
    ].join("\n");

    const result = await aiManager.chat(
      [
        {
          role: "user",
          content: `User message: ${messageText}`
        }
      ],
      {
        capabilities: ["chat"],
        systemPrompt
      }
    );

    const parsed = parseReminderJson(result?.content || "");

    if (parsed && parsed.ok !== false) {
      const remindAt = new Date(parsed.remind_at_utc);

      if (parsed.remind_at_utc && !isNaN(remindAt.getTime())) {
        const allowedScheduleTypes = ["once", "daily", "weekly", "monthly", "hourly", "interval"];
        const scheduleType = allowedScheduleTypes.includes(parsed.schedule_type)
          ? parsed.schedule_type
          : "once";

        const intervalHours = Number(parsed.interval_hours);

        return {
          success: true,
          reminder: {
            title: parsed.title || "",
            description: parsed.description || "",
            schedule_type: scheduleType,
            remind_at_utc: remindAt.toISOString(),
            local_time: parsed.local_time || "",
            days_of_week: Array.isArray(parsed.days_of_week) ? parsed.days_of_week : [],
            interval_hours: Number.isFinite(intervalHours) && intervalHours > 0 ? intervalHours : null,
            delete_after_done: parsed.delete_after_done === true || scheduleType === "once"
          }
        };
      }
    }

    if (fallback.success) return fallback;

    return { success: false, needsInput: true };
  } catch (error) {
    try {
      await log.warn(env.DB, "telegram", "reminder_extraction_failed", { error: error.message });
    } catch {}

    if (fallback.success) return fallback;

    return { success: false, needsInput: false, error: true };
  }
}

async function handleReminderCreate(config, env, message, routing, chatId, overrideText) {
  const language = routing?.language === "fa" ? "fa" : "en";

  try {
    const rawText = String(overrideText || message?.text || "").trim();

    if (!rawText) {
      return {
        message:
          language === "fa"
            ? "لطفاً متن یادآوری را بفرست."
            : "Please send the reminder text."
      };
    }

    const extraction = await extractReminderFromMessage(config, env, rawText);

    if (!extraction.success) {
      if (chatId) await saveReminderDraft(env, chatId, rawText);

      if (extraction.needsInput) {
        return {
          message:
            language === "fa"
              ? "باشه، فقط زمان دقیق را بگو؛ مثلاً «فردا ساعت ۸ صبح» یا «هر روز ساعت ۹»."
              : "Sure, tell me the exact time; for example: tomorrow at 8 AM or every day at 9."
        };
      }

      return {
        message:
          language === "fa"
            ? "الان نتوانستم یادآوری را ثبت کنم؛ لطفاً دوباره بفرست."
            : "I could not register that reminder right now; please try again."
      };
    }

    const r = extraction.reminder;
    let remindAt = new Date(r.remind_at_utc);

    if (isNaN(remindAt.getTime())) {
      if (chatId) await saveReminderDraft(env, chatId, rawText);

      return {
        message:
          language === "fa"
            ? "باشه، فقط زمان دقیق را بگو؛ مثلاً «فردا ساعت ۸ صبح» یا «هر روز ساعت ۹»."
            : "Sure, tell me the exact time; for example: tomorrow at 8 AM or every day at 9."
      };
    }

    if (r.schedule_type === "once" && remindAt.getTime() <= Date.now()) {
      if (chatId) await saveReminderDraft(env, chatId, rawText);

      return {
        message:
          language === "fa"
            ? "آن زمان گذشته است؛ یک زمان آینده بگو."
            : "That time is in the past; tell me a future time."
      };
    }

    if (r.schedule_type !== "once" && remindAt.getTime() <= Date.now()) {
      const nowDate = new Date();

      while (remindAt <= nowDate) {
        if (r.schedule_type === "hourly") {
          remindAt.setTime(remindAt.getTime() + 60 * 60 * 1000);
        } else if (r.schedule_type === "interval" && Number(r.interval_hours) > 0) {
          remindAt.setTime(remindAt.getTime() + Number(r.interval_hours) * 60 * 60 * 1000);
        } else if (r.schedule_type === "weekly") {
          remindAt.setUTCDate(remindAt.getUTCDate() + 7);
        } else if (r.schedule_type === "monthly") {
          remindAt.setUTCMonth(remindAt.getUTCMonth() + 1);
        } else {
          remindAt.setUTCDate(remindAt.getUTCDate() + 1);
        }
      }

      r.remind_at_utc = remindAt.toISOString();
    }

    const reminderManager = new ReminderManager(
      config,
      null,
      { info: log.info, error: log.error, warn: log.warn },
      env.DB
    );

    const repeatRule = JSON.stringify({
      schedule_type: r.schedule_type,
      local_time: r.local_time,
      days_of_week: r.days_of_week,
      interval_hours: r.interval_hours,
      delete_after_done: r.delete_after_done
    });

    await reminderManager.createReminder({
      title: r.title || rawText.substring(0, 100),
      description: r.description || rawText,
      remindAtUtc: r.remind_at_utc,
      repeatRule,
      priority: "medium",
      sourceMessageId: String(message?.message_id || "")
    });

    if (chatId) await clearReminderDraft(env, chatId);

    return {
      message:
        language === "fa"
          ? "بله، ثبت کردم؛ به موقع یادت می‌اندازم."
          : "Done; I will remind you on time."
    };
  } catch (error) {
    try {
      await log.error(env.DB, "telegram", "reminder_create_failed", { error: error.message });
    } catch {}

    return {
      message:
        language === "fa"
          ? "ثبت یادآوری فعلاً مشکل داشت."
          : "Reminder creation failed."
    };
  }
}