import { AIProviderManager } from "./ai.js";
import { encrypt, decrypt } from "./crypto.js";

const JUDGE_SYSTEM_PROMPT = `You are the Judge module of "Ava". Your ONLY job is to decide whether the user's
current message is about a TASK (something that needs to be scheduled, remembered, or acted on later —
reminders, projects, events, routines) or about MEMORY/CHAT (a normal conversation, question, or continuation
of previous discussion).

Return ONLY a valid JSON object, no extra text, no markdown fences:
{"category": "task" | "memory", "confidence": 0.0}

Rules:
- If the message is clearly asking Ava to remember something for later, remind the user at a time, track a
  project/deadline, or set up a recurring action, category = "task".
- If the message is a question, a statement, small talk, or continuing a previous topic, category = "memory".
- If uncertain, prefer "memory".`;

export async function judgeMessage(message, sessionSummary, config, env) {
  try {
    const aiManager = new AIProviderManager(config, { encrypt, decrypt }, { info: () => {}, error: () => {}, warn: () => {} }, env.DB);
    await aiManager.initialize();
    const userPrompt = `Current user message: "${message.text || ""}"
Session summary so far: "${sessionSummary || "(none)"}"

Return ONLY the JSON object described in your instructions.`;
    const result = await aiManager.chat(
      [{ role: "user", content: userPrompt }],
      { capabilities: ["judge"], systemPrompt: JUDGE_SYSTEM_PROMPT }
    );
    const rawText = (result.content || "").trim();
    const jsonStart = rawText.indexOf("{");
    const jsonEnd = rawText.lastIndexOf("}") + 1;
    if (jsonStart === -1 || jsonEnd <= jsonStart) {
      throw new Error("Judge response did not contain valid JSON");
    }
    const parsed = JSON.parse(rawText.substring(jsonStart, jsonEnd));
    if (parsed.category !== "task" && parsed.category !== "memory") {
      parsed.category = "memory";
    }
    return parsed;
  } catch (error) {
    return { category: "memory", confidence: 0.1 };
  }
}

export function isExplicitTaskCommand(text) {
  const raw = (text || "").trim();
  return /^\/task\b/i.test(raw) || /^task\b/i.test(raw);
}
