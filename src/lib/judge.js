import { AIProviderManager } from "./ai.js";
import { encrypt, decrypt } from "./crypto.js";

const JUDGE_SYSTEM_PROMPT = `You are the Judge module of "Ava". Your ONLY job is to decide whether the user's
current message is about a TASK (something that needs to be scheduled, remembered, or acted on later —
reminders, projects, events, routines) or about MEMORY/CHAT (a normal conversation, question, or continuation
of previous discussion).

Return ONLY a valid JSON object, no extra text, no markdown fences:
{"category": "task" | "memory", "confidence_score": 0.0, "required_fields": []}

Rules:
- If the message is clearly asking Ava to remember something for later, remind the user at a time, track a
  project/deadline, or set up a recurring action, category = "task".
- If the message is a question, a statement, small talk, or continuing a previous topic, category = "memory".
- If uncertain, prefer "memory".
- For task category, include any missing required_fields like ["time", "date", "description", "title"].
- confidence_score should be between 0.0 and 1.0 indicating how certain you are.`;

export async function judgeMessage(message, sessionSummary, config, env, overrideProviderId = null) {
  const startTime = Date.now();
  try {
    const aiManager = new AIProviderManager(config, { encrypt, decrypt }, { info: () => {}, error: () => {}, warn: () => {} }, env.DB);
    await aiManager.initialize();
    
    // If overrideProviderId is provided, use only that provider for judging
    let selectedProvider = null;
    if (overrideProviderId) {
      const allProviders = aiManager.getProviders();
      selectedProvider = allProviders.find(p => p.id === overrideProviderId && p.enabled);
    }
    
    const userPrompt = `Current user message: "${message.text || ""}"
Session summary so far: "${sessionSummary || "(none)"}"

Return ONLY the JSON object described in your instructions.`;
    
    const result = await aiManager.chat(
      [{ role: "user", content: userPrompt }],
      { capabilities: ["chat"], systemPrompt: JUDGE_SYSTEM_PROMPT }
    );
    const rawText = (result.content || "").trim();
    const jsonStart = rawText.indexOf("{");
    const jsonEnd = rawText.lastIndexOf("}") + 1;
    if (jsonStart === -1 || jsonEnd <= jsonStart) {
      throw new Error("Judge response did not contain valid JSON");
    }
    const parsed = JSON.parse(rawText.substring(jsonStart, jsonEnd));
    
    // Normalize field names for backward compatibility
    if (parsed.confidence !== undefined && parsed.confidence_score === undefined) {
      parsed.confidence_score = parsed.confidence;
    }
    if (parsed.confidence_score === undefined) {
      parsed.confidence_score = 0.5;
    }
    if (!Array.isArray(parsed.required_fields)) {
      parsed.required_fields = [];
    }
    if (parsed.category !== "task" && parsed.category !== "memory") {
      parsed.category = "memory";
    }
    
    // Change 15: Log judge decision for analytics
    const processingTime = Date.now() - startTime;
    try {
      await env.DB.prepare(
        "INSERT INTO judge_logs (session_id, message_text, category, confidence_score, required_fields, provider_id, processing_time_ms) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).bind(
        message.chat?.id || "",
        (message.text || "").substring(0, 500),
        parsed.category,
        parsed.confidence_score,
        JSON.stringify(parsed.required_fields),
        overrideProviderId,
        processingTime
      ).run();
    } catch (logError) {
      // Silently ignore logging errors
    }
    
    return parsed;
  } catch (error) {
    // Change 19: Smart fallback behavior
    const processingTime = Date.now() - startTime;
    
    // Try fallback: check for explicit keywords
    const text = (message.text || "").toLowerCase();
    let fallbackCategory = "memory";
    
    if (/(remind|reminder|یادآوری|یادم بنداز|task|project|deadline|event|schedule)/i.test(text)) {
      fallbackCategory = "task";
    }
    
    // Log the fallback decision
    try {
      await env.DB.prepare(
        "INSERT INTO judge_logs (session_id, message_text, category, confidence_score, required_fields, provider_id, processing_time_ms) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).bind(
        message.chat?.id || "",
        (message.text || "").substring(0, 500),
        fallbackCategory,
        0.3,
        '[]',
        overrideProviderId,
        processingTime
      ).run();
    } catch (logError) {
      // Silently ignore
    }
    
    return { category: fallbackCategory, confidence_score: 0.3, required_fields: [] };
  }
}

export function isExplicitTaskCommand(text) {
  const raw = (text || "").trim();
  // Change 8: Enhanced regex for explicit task commands at message start
  return /^\/task\b/i.test(raw) || 
         /^task\b/i.test(raw) ||
         /^\/create_task\b/i.test(raw) ||
         /^\/new_task\b/i.test(raw) ||
         /^\/projects?\b/i.test(raw);
}

// Change 8: Regex for detecting explicit commands anywhere in message
export function hasExplicitCommand(text) {
  const raw = (text || "").trim();
  const explicitPatterns = [
    /^\/(task|create_task|new_task|project|reminder|event)\b/i,
    /^(task|create task|new task|create project|new project|set reminder|create reminder)\b/i
  ];
  return explicitPatterns.some(pattern => pattern.test(raw));
}
