// Router / Brain Matrix
// Core routing logic that analyzes Telegram messages and determines intent, required tables, and actions
// Output format: Valid JSON according to the schema defined in the system

import { log } from "./logger.js";

// Sample system prompt for the router
const ROUTER_SYSTEM_PROMPT = `
You are the routing module of "Ava". Return only a valid JSON object according to the provided schema, without any extra text.
Input: Current user message + short summary of current session + current Tehran time.
You must specify at least the necessary tables in tables_to_read, no more.
If the message was about a temporary project (near deadline, informal tone) and the user hasn't created a similar project before, intent=project_create and action=create_project with metadata.temporary=true.
If uncertainty is high, set needs_user_confirmation=true and fill missing_fields.

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

    // Simple pattern matching for common intents
    if (text.includes("remember") || text.includes("note")) {
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

    if (text.includes("remind") || text.includes("reminder")) {
      return {
        intent: "reminder_create",
        confidence: 0.7,
        language: /[؀-ۿ]/.test(text) ? "fa" : "en",
        needs_user_confirmation: false,
        missing_fields: [],
        tables_to_read: ["reminders"],
        actions: ["create_reminder"],
        memory_to_save: [],
        response_hint: "Reminder created.",
      };
    }

    if (text.includes("project")) {
      // Check if it sounds like creating a new project
      if (text.includes("create") || text.includes("new project") || text.includes("start") || !text.includes("update") && !text.includes("show") && !text.includes("list")) {
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

    if (text.includes("با صدا جواب بده") || text.includes("جواب صوتی") || text.includes("ویس بده") || text.includes("ویس جواب") || text.includes("voice reply") || text.includes("reply with voice") || text.includes("answer with voice") || text.includes("send voice")) {
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
    if (text.includes("عکس بساز") || text.includes("تصویر بساز") || text.includes("عکس بکش") || text.includes("نقاشی بکش") || text.includes("generate image") || text.includes("create an image") || text.includes("draw me") || text.includes("draw a")) {
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
    if (text.includes("help") || text.includes("/help")) {
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