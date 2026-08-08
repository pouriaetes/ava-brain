// Router / Brain Matrix
// Core routing logic that analyzes Telegram messages and determines intent, required tables, and actions
// Output format: Valid JSON according to the schema defined in the system

import { log } from "./logger.js";
import { AIProviderManager } from "./ai.js";
import { encrypt, decrypt } from "./crypto.js";

// Sample system prompt for the router
const ROUTER_SYSTEM_PROMPT = `
You are the routing module of "Ava". Return only a valid JSON object according to the provided schema, without any extra text.
Input: Current user message + short summary of current session + current Tehran time.
You must specify at least the necessary tables in tables_to_read, no more.
If the message was about a temporary project (near deadline, informal tone) and the user hasn't created a similar project before, intent=project_create and action=create_project with metadata.temporary=true.
If uncertainty is high, set needs_user_confirmation=true and fill missing_fields.
If the user asks to be reminded about a personal task at a specific time/date or repeatedly, use intent=reminder_create, not routine_create.
If the user asks you to search the internet, find current information online, or look something up on the web (e.g. "search for X", "find the latest news about X", "در نت بگرد", "جستجو کن", "پیدا کن در اینترنت"), use intent=web_search_request. Do not set any actions for this intent; it is handled directly.
If the user shares a URL or link and asks you to read, summarize, or explain it, use intent=url_summary_request. Do not set any actions for this intent; it is handled directly.
If the user asks for a recurring scheduled web search or news update (e.g. "every day at 5 find news about X and send it to me", "هر روز ساعت ۵ اخبار X رو پیدا کن و بفرست"), use intent=routine_create with action create_routine where action_type="news_ai", schedule_type matches the requested recurrence, local_time is the requested time in HH:MM 24-hour Tehran time, and payload={"query": "<the search topic in the user's own words>"}.
This includes requests that ask Ava to send a message, say something, or notify the user at a time/day/recurrence, such as "هر روز ساعت X بهم پیام بده", "بهم بگو", "یادم بنداز", "فردا ساعت ...", or "هر شنبه ...".

Allowed intents:
- general_chat
- profile_update
- ephemeral_note
- reminder_create
- reminder_query
- event_create
- event_query
- project_create
- project_update
- project_query
- project_complete
- routine_create
- routine_update
- routine_query
- news_config
- query_memory
- delete_request
- admin_help
- followup_response
- image_request
- voice_reply_request
- web_search_request
- url_summary_request

Allowed actions:
- create_reminder
- create_event
- upsert_entity
- create_project
- update_project
- complete_project
- create_routine
- update_routine
- delete_short_term_memory
- save_long_term_memory

Schema:
{
  "intent": "...",
  "confidence": 0.0,
  "language": "fa|en",
  "needs_user_confirmation": false,
  "missing_fields": [],
  "tables_to_read": [],
  "actions": [],
  "memory_to_save": [],
  "response_hint": ""
}
`;

export class Router {
  constructor(config, crypto, logger, db) {
    this.config = config;
    this.crypto = crypto;
    this.logger = logger;
    this.db = db;
    this.systemPrompt = ROUTER_SYSTEM_PROMPT;
  }

  async analyzeMessage(message, sessionSummary = "", tehranTime = null) {
    try {
      // Use rule-based analysis first for speed
      const ruleBasedResult = await this.ruleBasedAnalysis(message, sessionSummary);
      if (ruleBasedResult && ruleBasedResult.intent !== "general_chat") {
        return ruleBasedResult;
      }

      // Fall back to AI if rule-based analysis is uncertain
      return await this.aiBasedAnalysis(message, sessionSummary, tehranTime);

    } catch (error) {
      await this.logger.error(this.db, "router", "analysis_error", {
        message: message.text?.substring(0, 100),
        error: error.message,
      });

      // Return a safe default
      return {
        intent: "general_chat",
        confidence: 0.1,
        language: message.text && /[؀-ۿ]/.test(message.text) ? "fa" : "en",
        needs_user_confirmation: true,
        missing_fields: ["intent"],
        tables_to_read: [],
        actions: [],
        memory_to_save: [],
        response_hint: "I need more information to process your request.",
      };
    }
  }

  async ruleBasedAnalysis(message, sessionSummary) {
    const text = message.text?.toLowerCase() || "";
    const rawText = message.text || "";

    const keywordRows = (await this.db.prepare(
      "SELECT key, value FROM settings WHERE key IN ('keyword_note_triggers','keyword_reminder_triggers','keyword_project_trigger','keyword_project_create_triggers','keyword_project_exclude_triggers','keyword_voice_reply_triggers','keyword_image_request_triggers','keyword_help_triggers')"
    ).all()).results || [];
    const keywordMap = {};
    for (const row of keywordRows) {
      keywordMap[row.key] = row.value;
    }
    const parseKeywordSetting = (raw, fallbackArr) => {
      if (!raw || typeof raw !== "string" || raw.trim() === "") return fallbackArr;
      return raw.split(",").map((s) => s.trim().toLowerCase()).filter((s) => s.length > 0);
    };
    const noteTriggers = parseKeywordSetting(keywordMap.keyword_note_triggers, ["remember", "note"]);
    const reminderTriggers = parseKeywordSetting(keywordMap.keyword_reminder_triggers, ["remind", "reminder", "یادآوری", "یادم بنداز", "یادام بنداز", "یادت باشه", "یادت نره"]);
    const projectTrigger = parseKeywordSetting(keywordMap.keyword_project_trigger, ["project"]);
    const projectCreateTriggers = parseKeywordSetting(keywordMap.keyword_project_create_triggers, ["create", "new project", "start"]);
    const projectExcludeTriggers = parseKeywordSetting(keywordMap.keyword_project_exclude_triggers, ["update", "show", "list"]);
    const voiceReplyTriggers = parseKeywordSetting(keywordMap.keyword_voice_reply_triggers, ["با صدا جواب بده", "جواب صوتی", "ویس بده", "ویس جواب", "voice reply", "reply with voice", "answer with voice", "send voice"]);
    const imageRequestTriggers = parseKeywordSetting(keywordMap.keyword_image_request_triggers, ["عکس بساز", "تصویر بساز", "عکس بکش", "نقاشی بکش", "generate image", "create an image", "draw me", "draw a"]);
    const helpTriggers = parseKeywordSetting(keywordMap.keyword_help_triggers, ["help", "/help"]);
    if (noteTriggers.some((kw) => text.includes(kw))) {
      return {
        intent: "ephemeral_note",
        confidence: 0.8,
        language: /[؀-ۿ]/.test(text) ? "fa" : "en",
        needs_user_confirmation: false,
        missing_fields: [],
        tables_to_read: ["memory_short_term"],
        actions: ["save_long_term_memory"],
        memory_to_save: ["ephemeral_note"],
        response_hint: "Note saved to your memory.",
      };
    }

    if (reminderTriggers.some((kw) => text.includes(kw))) {
      return {
        intent: "reminder_create",
        confidence: 0.8,
        language: /[؀-ۿ]/.test(text) ? "fa" : "en",
        needs_user_confirmation: false,
        missing_fields: [],
        tables_to_read: ["reminders"],
        actions: [],
        memory_to_save: [],
        response_hint: ""
      };
    }

    const explicitReminderRegex = /(remind|reminder|یادآوری|یادم\s*بنداز|یادام\s*بنداز|یادت\s*باشه|یادت\s*نره|یادآوری\s*کن)/i;
    const explicitReminder = explicitReminderRegex.test(rawText);
    const scheduleRegex = /(هر\s*روز|هر\s*شب|هر\s*هفته|هر\s*ماه|هر\s*سال|هر\s*\d+\s*روز|هر\s*[۰-۹]+\s*روز|روزانه|هفتگی|ماهانه|فردا|پس\s*فردا|امروز|شنبه|یکشنبه|دوشنبه|سه\s*شنبه|چهارشنبه|پنج\s*شنبه|جمعه|every\s*(day|night|week|month|year)|daily|weekly|monthly|hourly|tomorrow|today|\d{1,2}:\d{2}|[۰-۹]{1,2}[:：][۰-۹]{2}|ساعت\s*\d+|ساعت\s*[۰-۹]+)/i;
    const notifyRegex = /(یادآوری|یادم\s*بنداز|یادام\s*بنداز|یادت\s*باشه|یادت\s*نره|صدام\s*(کن|بکن|بزن)|صدا\s*بزن|صدام\s*کنی|بیدارم\s*کن|بیدار\s*کن|بیدارم\s*کنی|(بهم|برام)?\s*(بگو|بگی|پیام\s*بده|پیام\s*بدی|خبر\s*بده|خبر\s*بدی|زنگ\s*بزن|زنگ\s*بزنی|بفرست|بفرستی|ارسال\s*کن|ارسال\s*کنی|یادآوری\s*کن)|remind|reminder)/i;

    if (explicitReminder || (scheduleRegex.test(rawText) && notifyRegex.test(rawText))) {
      return {
        intent: "reminder_create",
        confidence: 0.85,
        language: /[؀-ۿ]/.test(rawText) ? "fa" : "en",
        needs_user_confirmation: false,
        missing_fields: [],
        tables_to_read: ["reminders"],
        actions: [],
        memory_to_save: [],
        response_hint: ""
      };
    }

    const urlMatch = rawText.match(/https?:\/\/[^\s]+/i);
    if (urlMatch) {
      return {
        intent: "url_summary_request",
        confidence: 0.9,
        language: /[؀-ۿ]/.test(rawText) ? "fa" : "en",
        needs_user_confirmation: false,
        missing_fields: [],
        tables_to_read: [],
        actions: [],
        memory_to_save: [],
        response_hint: ""
      };
    }
    if (projectTrigger.some((kw) => text.includes(kw))) {
      if (projectCreateTriggers.some((kw) => text.includes(kw)) || !projectExcludeTriggers.some((kw) => text.includes(kw))) {
        return {
          intent: "project_create",
          confidence: 0.6,
          language: /[؀-ۿ]/.test(text) ? "fa" : "en",
          needs_user_confirmation: false,
          missing_fields: [],
          tables_to_read: ["projects"],
          actions: ["create_project"],
          memory_to_save: ["project_context"],
          response_hint: "Project created.",
        };
      }
    }

    if (voiceReplyTriggers.some((kw) => text.includes(kw))) {
      return {
        intent: "voice_reply_request",
        confidence: 0.6,
        language: /[؀-ۿ]/.test(text) ? "fa" : "en",
        needs_user_confirmation: false,
        missing_fields: [],
        tables_to_read: [],
        actions: [],
        memory_to_save: [],
        response_hint: ""
      };
    }
    if (imageRequestTriggers.some((kw) => text.includes(kw))) {
      return {
        intent: "image_request",
        confidence: 0.7,
        language: /[؀-ۿ]/.test(text) ? "fa" : "en",
        needs_user_confirmation: false,
        missing_fields: [],
        tables_to_read: [],
        actions: [],
        memory_to_save: [],
        response_hint: ""
      };
    }
    if (helpTriggers.some((kw) => text.includes(kw))) {
      return {
        intent: "admin_help",
        confidence: 0.9,
        language: /[؀-ۿ]/.test(text) ? "fa" : "en",
        needs_user_confirmation: false,
        missing_fields: [],
        tables_to_read: [],
        actions: [],
        memory_to_save: [],
        response_hint: "Available commands: /start, /help, /now, /reminders, /events, /projects, /routines, /profile, /status, /forget",
      };
    }

    // Default to general chat
    return {
      intent: "general_chat",
      confidence: 0.5,
      language: /[؀-ۿ]/.test(text) ? "fa" : "en",
      needs_user_confirmation: false,
      missing_fields: [],
      tables_to_read: [],
      actions: [],
      memory_to_save: [],
      response_hint: "",
    };
  }

  async aiBasedAnalysis(message, sessionSummary, tehranTime) {
    try {
      const aiManager = new AIProviderManager(this.config, { encrypt, decrypt }, this.logger, this.db);
      await aiManager.initialize();
      const userPrompt = `Current user message: "${message.text || ""}"
Session summary so far: "${sessionSummary || "(none)"}"
Current Tehran time: ${tehranTime || "(unknown)"}

Analyze this message and return ONLY the JSON object described in your instructions, with no extra text, no markdown code fences, just the raw JSON.`;
      const result = await aiManager.chat(
        [{ role: "user", content: userPrompt }],
        { capabilities: ["routing"], systemPrompt: this.systemPrompt }
      );
      const rawText = (result.content || "").trim();
      const jsonStart = rawText.indexOf("{");
      const jsonEnd = rawText.lastIndexOf("}") + 1;
      if (jsonStart === -1 || jsonEnd <= jsonStart) {
        throw new Error("AI routing response did not contain valid JSON");
      }
      const parsed = JSON.parse(rawText.substring(jsonStart, jsonEnd));
      return parsed;
    } catch (error3) {
      if (this.logger?.warn) {
        await this.logger.warn(this.db, "router", "ai_based_analysis_failed", { error: error3.message });
      }
      return await this.ruleBasedAnalysis(message, sessionSummary);
    }
  }

  async getRequiredTables(intent, message) {
    // Map intents to required tables
    const intentTableMap = {
      "general_chat": [],
      "profile_update": ["profile_facts"],
      "ephemeral_note": ["memory_short_term"],
      "reminder_create": ["reminders", "entities"],
      "reminder_query": ["reminders"],
      "event_create": ["events"],
      "event_query": ["events"],
      "project_create": ["projects"],
      "project_update": ["projects"],
      "project_query": ["projects"],
      "project_complete": ["projects"],
      "routine_create": ["routines"],
      "routine_update": ["routines"],
      "routine_query": ["routines"],
      "news_config": [],
      "web_search_request": [],
      "url_summary_request": [],
      "query_memory": ["memory_long_term", "memory_short_term"],
      "delete_request": ["memory_short_term"],
      "admin_help": [],
      "followup_response": ["projects"],
    };

    return intentTableMap[intent] || [];
  }

  validateOutput(output) {
    const schema = {
      intent: "string",
      confidence: "number",
      language: "string",
      needs_user_confirmation: "boolean",
      missing_fields: "array",
      tables_to_read: "array",
      actions: "array",
      memory_to_save: "array",
      response_hint: "string",
    };

    // Basic validation
    if (!output.intent) {
      throw new Error("Intent is required");
    }

    if (typeof output.confidence !== "number" || output.confidence < 0 || output.confidence > 1) {
      output.confidence = 0.5;
    }

    if (!["fa", "en"].includes(output.language)) {
      output.language = output.language?.includes("fa") ? "fa" : "en";
    }

    if (typeof output.needs_user_confirmation !== "boolean") {
      output.needs_user_confirmation = false;
    }

    if (!Array.isArray(output.missing_fields)) {
      output.missing_fields = [];
    }

    if (!Array.isArray(output.tables_to_read)) {
      output.tables_to_read = [];
    }

    if (!Array.isArray(output.actions)) {
      output.actions = [];
    }

    if (!Array.isArray(output.memory_to_save)) {
      output.memory_to_save = [];
    }

    if (typeof output.response_hint !== "string") {
      output.response_hint = "";
    }
    var allowedIntents = ["general_chat", "profile_update", "ephemeral_note", "reminder_create", "reminder_query", "event_create", "event_query", "project_create", "project_update", "project_query", "project_complete", "routine_create", "routine_update", "routine_query", "news_config", "query_memory", "delete_request", "admin_help", "followup_response", "image_request", "voice_reply_request", "web_search_request", "url_summary_request"];
    if (!allowedIntents.includes(output.intent)) {
      output.intent = "general_chat";
      output.actions = [];
      output.response_hint = "";
      output.needs_user_confirmation = false;
    }
    var allowedActionsForValidation = ["create_reminder", "create_event", "upsert_entity", "create_project", "update_project", "complete_project", "create_routine", "update_routine", "delete_short_term_memory", "save_long_term_memory"];
    output.actions = output.actions.filter((a) => allowedActionsForValidation.includes(a));
    return output;
  }
}

export async function routeIntent(message, config, env, session) {
  // Main entry point for routing intents
  const router = new Router(config, null, { info: log.info, error: log.error, warn: log.warn }, env.DB);

  // Get current Tehran time for context
  const tehranTime = new Date().toISOString();

  // Analyze the message
  const analysis = await router.analyzeMessage(
    message,
    session.summary || "",
    tehranTime
  );

  // Validate the output
  return router.validateOutput(analysis);
}

export async function initializeRouter(config, crypto, logger, db) {
  // Initialize the router with dependencies
  return new Router(config, crypto, logger, db);
}