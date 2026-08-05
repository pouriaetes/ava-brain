// Telegram webhook handler — owner-only, secret verification, typing, routing
import { getSession } from "../lib/auth.js";
import { log } from "../lib/logger.js";
import { sendTelegramMessage, sendTypingAction } from "../lib/telegram.js";
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

    // 2. Owner-only check
    const fromId = String(body.message?.from?.id || body.callback_query?.from?.id || "");
    const chatId = String(body.message?.chat?.id || body.callback_query?.message?.chat?.id || "");
    const chatType = body.message?.chat?.type || body.callback_query?.message?.chat?.type || "private";

    if (fromId !== String(config.OWNER_TELEGRAM_ID)) {
      if (chatType === "group" || chatType === "supergroup") {
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json" },
        });
      }
      await sendTelegramMessage(config, chatId, "This bot is private.");
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
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

    // 4. Get or create session
    const sessionManager = new SessionManager(config, null, { info: log.info, error: log.error, warn: log.warn }, env.DB);
    const session = await sessionManager.getOrCreateSession(chatId);

    // 5. Get memory context
    const memoryManager = new MemoryManager(config, null, { info: log.info, error: log.error, warn: log.warn }, env.DB);
    const memoryContext = await memoryManager.getRelevantMemory(chatId, message.text || "");
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
    } else if (routing.intent === "general_chat") {
      // Try AI response
      try {
        const aiManager = new AIProviderManager(config, { encrypt, decrypt }, { info: log.info, error: log.error, warn: log.warn }, env.DB);
        await aiManager.initialize();
        const systemPromptText = await getPersona(env.DB) + "\n\nContext about the user you are talking to:\n" + finalMemoryContext;
        const aiResponse = await aiManager.chat(
          [
            { role: "user", content: message.text || "" }
          ],
          { capabilities: ["chat"], systemPrompt: systemPromptText }
        );
        responseText = aiResponse.content || responseText;
      } catch (aiError) {
        responseText = "AI model connection is currently having issues, I saved your message.";
        await memoryManager.saveShortTerm(chatId, "pending_message", message.text || "", 2, {});
      }
    } else if (actionResults.some(r => r?.success)) {
      responseText = "Done.";
    } else {
      responseText = "Got it.";
    }

    // 11. Send response
    if (responseText) {
      const results = await sendTelegramMessage(config, chatId, responseText, { parse_mode: "HTML" });

      // 12. Update session summary
      if (session?.id) {
        const newSummary = `${(session.summary || "")} ${message.text?.substring(0, 100)}`.trim().substring(0, 500);
        await sessionManager.updateSessionSummary(session.id, newSummary);
      }
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