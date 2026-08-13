// src/lib/judge.js — the capability classifier used by the decision system.
// The Judge's vocabulary is derived entirely from the capability registry
// (src/capabilities.js): it has no route list of its own. It emits a capability_id
// plus an optional custom workflow_id, recorded to judge_logs for the Decision
// Trace. Provider differences live in the AI layer; the Judge stays agnostic.

import { chatJson } from "./json-ai.js";
import { getBuiltinCapability, buildJudgeCapabilitySections } from "../capabilities.js";
import { sanitizeError } from "./repos.js";

const JUDGE_SCHEMA = {
  type: "object",
  required: ["capability_id"],
  properties: {
    capability_id: { type: "string" },
    confidence_score: { type: "number" },
    required_fields: { type: "array" },
    topic: { type: "string" },
    workflow_id: { type: ["integer", "null"] },
  },
};

const JUDGE_DECISION_RULES = `
DECISION RULES:
- If the user mentions a TIME (clock time, today, tonight, tomorrow, a day, a time phrase) together with an ACTION VERB for the future (send me a message, remind me, wake me, call me, tell/notify someone), the capability is "task_or_reminder" — even if it is phrased politely or conversationally.
- If the user asks about their plan for today / the day's program / the daily check-in (e.g. "برنامه امروز", "برنامه امروزم"), the capability is "daily_plan". This is distinct from a one-time reminder.
- If the message is just a statement, a greeting, a question, or small talk with no scheduled future action, the capability is "normal_chat".
- If the user refers to an EXISTING reminder/memory/project/task/event with an edit, delete, change, or query intent — including deictic words ("this", "that", "the previous one", "این", "اون") or a specific time ("the reminder at 8") — the capability is "entity_manage".
- "entity_manage" takes precedence over "task_or_reminder" when the user is modifying or deleting an existing scheduled item rather than creating a new one.
- If you are unsure between "normal_chat" and another capability, prefer "normal_chat".
- For "task_or_reminder", set required_fields to any of ["time","date","description","title"] that are missing.
- "topic" is a short 2-6 word label in the user's own words (for matching specialized workflows); empty string if no clear topic.
- confidence_score between 0.0 and 1.0.`;

// Map common model output variants onto canonical capability ids so a weaker model
// returning e.g. "task" or "reminder" still classifies correctly.
const CAPABILITY_ALIASES = {
  task: "task_or_reminder",
  reminder: "task_or_reminder",
  reminders: "task_or_reminder",
  reminder_create: "task_or_reminder",
  task_or_reminders: "task_or_reminder",
  daily_plan: "daily_plan",
  plan: "daily_plan",
  today_plan: "daily_plan",
  chat: "normal_chat",
  normal: "normal_chat",
  general_chat: "normal_chat",
  general: "normal_chat",
  search_web: "search",
  web_search: "search",
  image: "image_generation",
  image_gen: "image_generation",
  generate_image: "image_generation",
  voice: "tts",
  text_to_speech: "tts",
  speech_to_text: "stt",
  manage: "entity_manage",
  edit: "entity_manage",
  delete: "entity_manage",
  update: "entity_manage",
  query: "entity_manage",
  entity_management: "entity_manage",
};

// High-precision Persian/English reminder patterns used ONLY as a safety net when
// the Judge LLM itself fails (network error, non-JSON output). These never fire on
// a successful Judge classification.
const REMINDER_VERB_PATTERN = /(یادآوری|یادم\s*بنداز|یادم\s*باشه|یادت\s*باشه|یادت\s*نره|بیدارم\s*کن|زنگ\s*بزن|خبر\s*کن|به\s*وقت\s*خبر|پیام.{0,12}?(بده|بفرست|بدم|بدی|بدهید)|remind|reminder|alarm)/i;
const TIME_INDICATOR_PATTERN = /(ساعت|امروز|فردا|امشب|پس\s*فردا|صبح|ظهر|عصر|شب|شنبه|یکشنبه|دوشنبه|سه\s*شنبه|چهارشنبه|پنج\s*شنبه|جمعه|هر\s*روز|هر\s*هفته|هر\s*ماه|هر\s*شب|daily|weekly|tonight|today|tomorrow|\d{1,2}\s*(:\d{2}|ونیم)|at\s*\d+\s*(am|pm)?)/i;

// Build the Judge system prompt: registry capability list + active custom workflows.
function buildJudgeSystemPrompt(availableWorkflows) {
  const { lines, workflowsSection } = buildJudgeCapabilitySections(availableWorkflows || []);
  return `You are the routing module of "Ava" (a personal assistant). Your ONLY job is to decide which capability an incoming user message maps to. You must NEVER answer the user, NEVER explain yourself, and NEVER generate the final response. You only output a classification.

OUTPUT RULE (CRITICAL): Respond with EXACTLY one valid JSON object and nothing else. No explanations. No markdown fences. No "Here is" text. Just the raw JSON:
{"capability_id": "...", "confidence_score": 0.0, "required_fields": [], "topic": "", "workflow_id": null}

AVAILABLE CAPABILITIES (choose exactly one capability_id):
${lines.join("\n")}
${workflowsSection}

${JUDGE_DECISION_RULES}`;
}

export function sanitizeJudgeDebugError(rawMessage) {
  return sanitizeError(rawMessage);
}

function normalizeJudgeResult(parsed, activeCustomWorkflows) {
  if (!parsed || typeof parsed !== "object") return null;
  if (parsed.confidence !== undefined && parsed.confidence_score === undefined) {
    parsed.confidence_score = parsed.confidence;
  }
  if (parsed.confidence_score === undefined) parsed.confidence_score = 0.5;
  if (!Array.isArray(parsed.required_fields)) parsed.required_fields = [];
  if (typeof parsed.topic !== "string") parsed.topic = "";
  const rawCap = String(parsed.capability_id || parsed.route || "").toLowerCase();
  let capabilityId = getBuiltinCapability(rawCap) ? rawCap : CAPABILITY_ALIASES[rawCap];
  if (!capabilityId || !getBuiltinCapability(capabilityId)) capabilityId = "normal_chat";
  parsed.capability_id = capabilityId;
  parsed.route = capabilityId; // backward-compat alias
  if (parsed.workflow_id !== undefined && parsed.workflow_id !== null) {
    const n = parseInt(parsed.workflow_id, 10);
    parsed.workflow_id = Number.isInteger(n) && (activeCustomWorkflows || []).some((w) => w.id === n) ? n : null;
  } else {
    parsed.workflow_id = null;
  }
  parsed.category = capabilityId === "task_or_reminder" ? "task" : "memory";
  return parsed;
}

async function recordJudgeLog(env, message, parsed, preferredProviderId, processingTime) {
  try {
    await env.DB.prepare(
      "INSERT INTO judge_logs (session_id, message_text, category, confidence_score, required_fields, provider_id, processing_time_ms, route, workflow_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(
      message.chat?.id || "",
      (message.text || "").substring(0, 500),
      parsed.category,
      parsed.confidence_score,
      JSON.stringify(parsed.required_fields),
      preferredProviderId,
      processingTime,
      parsed.capability_id,
      parsed.workflow_id || null
    ).run();
  } catch (logError) {}
}

// Classify a message into a capability. Returns a normalized judge result or null
// if classification genuinely failed (callers decide how to react).
export async function classifyMessage(message, sessionSummary, config, env, aiManager, preferredProviderId = null, activeCustomWorkflows = []) {
  const startTime = Date.now();
  try {
    const userPrompt = `Current user message: "${message.text || ""}"
Session summary so far: "${sessionSummary || "(none)"}"

Decide the capability. Reply with ONLY the JSON object described in your instructions and nothing else — no extra text, no markdown fences.`;
    const { parsed: parsedRaw } = await chatJson(
      aiManager,
      [{ role: "user", content: userPrompt }],
      { schema: JUDGE_SCHEMA, capabilities: ["judge"], systemPrompt: buildJudgeSystemPrompt(activeCustomWorkflows), preferredProviderId, maxTokens: 300 }
    );
    const parsed = normalizeJudgeResult(parsedRaw, activeCustomWorkflows);
    if (!parsed) {
      throw new Error("Judge response did not contain valid JSON after retry");
    }
    // Safety net: if the Judge is unsure (low confidence) and classified normal_chat
    // but the message has a high-precision reminder verb + time, treat it as a
    // reminder. Only fires when the model is NOT confident.
    if (parsed.capability_id === "normal_chat" && parsed.confidence_score < 0.6) {
      const lowerText = (message.text || "").toLowerCase();
      if (REMINDER_VERB_PATTERN.test(lowerText) && TIME_INDICATOR_PATTERN.test(lowerText)) {
        parsed.capability_id = "task_or_reminder";
        parsed.route = "task_or_reminder";
        parsed.category = "task";
        parsed.confidence_score = 0.6;
      }
    }
    const processingTime = Date.now() - startTime;
    await recordJudgeLog(env, message, parsed, preferredProviderId, processingTime);
    parsed._debugError = null;
    parsed.provider_id = preferredProviderId;
    return parsed;
  } catch (error) {
    const processingTime = Date.now() - startTime;
    const text = (message.text || "").toLowerCase();
    let fallbackCapability = "normal_chat";
    let judgeFallbackTriggers = ["remind", "reminder", "یادآوری", "یادم بنداز", "یادت باشه", "یادت نره", "task", "project", "deadline", "event", "schedule", "پیام بده", "پیام بدی", "پیام بدم", "پیام بفرست", "بیدارم کن", "زنگ بزن", "خبر کن", "یادآوری کن", "alarm"];
    try {
      const judgeFallbackSetting = await env.DB.prepare("SELECT value FROM settings WHERE key = 'keyword_judge_fallback_triggers'").first();
      if (judgeFallbackSetting && judgeFallbackSetting.value && judgeFallbackSetting.value.trim() !== "") {
        judgeFallbackTriggers = judgeFallbackSetting.value.split(",").map((s) => s.trim().toLowerCase()).filter((s) => s.length > 0);
      }
    } catch (settingsError) {}
    const keywordHit = judgeFallbackTriggers.some((kw) => text.includes(kw));
    const semanticHit = REMINDER_VERB_PATTERN.test(text) && TIME_INDICATOR_PATTERN.test(text);
    const voiceHit = /(?:یه|یک)\s*ویس|ویس\s*(?:بده|بفرست|بگو|بگید)|بفرست\s*ویس|بده\s*ویس|صوتی|voice|speak\b/i.test(text);
    if (voiceHit) {
      fallbackCapability = "tts";
    } else if (keywordHit || semanticHit) {
      fallbackCapability = "task_or_reminder";
    }
    const fallback = {
      capability_id: fallbackCapability,
      route: fallbackCapability,
      category: fallbackCapability === "task_or_reminder" ? "task" : "memory",
      confidence_score: 0.3,
      required_fields: [],
      topic: "",
      workflow_id: null,
      _debugError: sanitizeError(error.message),
      provider_id: preferredProviderId,
    };
    await recordJudgeLog(env, message, fallback, preferredProviderId, processingTime);
    return fallback;
  }
}

// Detect explicit reminder/project/event command phrases that should route to their
// capability even when the Judge classifier is disabled. Mirrors the legacy
// hasExplicitCommand behavior (reminder creation works without Judge).
export function hasExplicitReminderCommand(text) {
  const raw = (text || "").trim();
  return /^\/(remind|reminder|task)\b/i.test(raw) || /^(set reminder|create reminder|new reminder)\b/i.test(raw);
}
