// src/lib/adaptive.js
// Adaptive personality learning: Daily Check inspects recent conversations, proposes
// structured, confidence-gated observations about the user's communication
// preferences, and stores them in the existing profile_facts table (dedicated
// categories). The immutable core identity (persona / bot_name / system constraints)
// is never touched here — only adaptive, user-specific behavior is learned.

import { log } from "./logger.js";

// Categories used to store learned, user-specific behavior in profile_facts.
// These are the ONLY categories the learning pipeline may write to.
export const ADAPTIVE_CATEGORIES = [
  "behavioral_preference",
  "communication_preference",
  "interaction_habit",
];

// Safety bounds
const MAX_LEARNED_PER_RUN = 5;
const MIN_CONFIDENCE = 0.6;
const MAX_TRANSCRIPT_TURNS = 30;
const MAX_TURN_CHARS = 500;
const ADAPTIVE_CONTEXT_CHARS = 6000;

const ADAPTIVE_SYSTEM_PROMPT = `You are the behavioral analysis module of "Ava", a personal assistant.
Your ONLY job is to identify STABLE, USEFUL communication preferences about the user from their recent conversation.
You must NOT modify Ava's core identity, name, safety rules, or system configuration.
You only propose changes to how Ava should communicate with THIS user.

Analyze the recent conversation and identify recurring, stable patterns such as:
- preferred answer length or level of detail (e.g. short answers for simple questions, detailed for technical topics)
- preferred tone (formal, casual, friendly, playful)
- language behavior (frequent Persian/English switching, preferred language for certain topics)
- formatting preferences (bullet points, headings, code blocks)
- recurring conversational habits (how they phrase commands, common requests)
- things the user repeatedly likes or dislikes

RULES:
- Only propose a pattern if it appears consistently across the conversation, not from a single message.
- Prefer contextual observations (e.g. "prefers concise answers for simple questions but detailed for technical topics") over broad ones.
- Do NOT invent preferences that are not supported by the evidence.
- Do NOT propose anything about Ava's identity or system settings.
- Output EXACTLY one valid JSON array (no extra text, no markdown fences):
[{"category":"communication_preference","preference_key":"answer_length_contextual","observation":"Concise for simple questions, detailed for technical topics.","confidence":0.8,"evidence":"Asked for brief replies twice, but requested step-by-step details for a coding question.","action":"ADD"}]

category must be one of: behavioral_preference, communication_preference, interaction_habit.
action must be one of: ADD, UPDATE, NO_CHANGE.
confidence must be a number between 0 and 1 (0.6+ recommended for real changes).
For NO_CHANGE, set observation and evidence to empty strings.`;

function parseAdaptiveJson(raw) {
  if (!raw) return [];
  let t = String(raw).trim();
  try {
    const p = JSON.parse(t);
    return Array.isArray(p) ? p : [];
  } catch {}
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  try {
    const p = JSON.parse(t);
    return Array.isArray(p) ? p : [];
  } catch {}
  const start = t.indexOf("[");
  const end = t.lastIndexOf("]");
  if (start !== -1 && end > start) {
    try {
      const p = JSON.parse(t.substring(start, end + 1));
      return Array.isArray(p) ? p : [];
    } catch {}
  }
  return [];
}

async function upsertAdaptiveFact(db, category, factKey, factValue, confidence, evidence) {
  const existing = await db.prepare("SELECT id, confidence FROM profile_facts WHERE category = ? AND fact_key = ?")
    .bind(category, factKey).first();
  const now = new Date().toISOString();
  const source = evidence && String(evidence).trim() !== ""
    ? `adaptive_learned: ${String(evidence).substring(0, 120)}`
    : "adaptive_learned";
  if (existing) {
    // Incremental update: never lower confidence, refresh value/evidence/time.
    const newConf = Math.max(Number(existing.confidence) || 0, confidence);
    await db.prepare(
      "UPDATE profile_facts SET fact_value = ?, confidence = ?, source = ?, is_permanent = 1, updated_at = ? WHERE id = ?"
    ).bind(factValue, newConf, source, now, existing.id).run();
    return { action: "updated", id: existing.id };
  }
  const insert = await db.prepare(
    "INSERT INTO profile_facts (category, fact_key, fact_value, confidence, source, is_permanent, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)"
  ).bind(category, factKey, factValue, confidence, source, now, now).run();
  return { action: "added", id: insert.meta?.last_row_id || null };
}

// Daily-Check learning step. Reads a bounded, recent conversation window from
// short-term memory and asks the model for structured, confidence-gated updates.
export async function learnAdaptiveProfile(config, env, aiManager) {
  const db = env.DB;
  try {
    const enabledRow = await db.prepare("SELECT value FROM settings WHERE key = 'personality_optimization_enabled'").first();
    if (!enabledRow || enabledRow.value !== "true") return { skipped: true, learned: 0 };

    const ownerId = String(config.OWNER_TELEGRAM_ID || "");
    if (!ownerId) return { skipped: true, learned: 0 };

    const rows = (await db.prepare(
      "SELECT * FROM memory_short_term WHERE session_id = ? AND type IN ('user_message','assistant_reply') AND expires_at > datetime('now') ORDER BY created_at ASC"
    ).bind(ownerId).all()).results || [];
    const recent = rows.slice(-MAX_TRANSCRIPT_TURNS);
    if (recent.length < 4) return { skipped: true, learned: 0 };

    const transcript = recent.map((e) =>
      `[${e.type === "user_message" ? "user" : "assistant"}] ${(e.content || "").substring(0, MAX_TURN_CHARS)}`
    ).join("\n").substring(0, ADAPTIVE_CONTEXT_CHARS);

    const existing = (await db.prepare(
      "SELECT fact_key, fact_value, confidence FROM profile_facts WHERE category IN ('behavioral_preference','communication_preference','interaction_habit')"
    ).all()).results || [];
    const existingSummary = existing.length > 0
      ? existing.map((f) => `- ${f.fact_key}: ${f.fact_value} (confidence ${f.confidence})`).join("\n")
      : "(none)";

    const prompt = `Current learned preferences:\n${existingSummary}

Recent conversation:
${transcript}

Identify stable communication preferences about the user and return the JSON array described in your instructions.`;

    let result;
    try {
      result = await aiManager.chat([{ role: "user", content: prompt }], {
        capabilities: ["personality_optimization"],
        systemPrompt: ADAPTIVE_SYSTEM_PROMPT,
      });
    } catch (e) {
      // Fall back to the chat capability so learning works with existing providers
      // that have not been assigned the personality_optimization capability yet.
      result = await aiManager.chat([{ role: "user", content: prompt }], {
        capabilities: ["chat"],
        systemPrompt: ADAPTIVE_SYSTEM_PROMPT,
      });
    }

    const parsed = parseAdaptiveJson(result.content);
    let learned = 0;
    const applied = [];
    for (const item of parsed) {
      if (learned >= MAX_LEARNED_PER_RUN) break;
      if (!item || typeof item !== "object") continue;
      if (!ADAPTIVE_CATEGORIES.includes(item.category)) continue;
      if (item.action !== "ADD" && item.action !== "UPDATE") continue;
      const key = String(item.preference_key || "").trim();
      const obs = String(item.observation || "").trim();
      const conf = Number(item.confidence);
      if (!key || !obs || !Number.isFinite(conf) || conf < MIN_CONFIDENCE) continue;
      const outcome = await upsertAdaptiveFact(db, item.category, key, obs, conf, item.evidence);
      applied.push({ key, category: item.category, ...outcome });
      learned++;
    }

    await log(db, "info", "adaptive_profile_learned", { learned, transcriptTurns: recent.length });
    return { skipped: false, learned, applied };
  } catch (error) {
    await log(db, "warn", "adaptive_profile_learn_failed", { error: error.message });
    return { skipped: false, learned: 0, error: error.message };
  }
}

// All learned (adaptive) profile facts, newest first.
export async function getAdaptiveProfile(db) {
  const results = await db.prepare(
    "SELECT * FROM profile_facts WHERE category IN ('behavioral_preference','communication_preference','interaction_habit') ORDER BY is_permanent DESC, confidence DESC, updated_at DESC"
  ).all();
  return results.results || [];
}

export { ADAPTIVE_SYSTEM_PROMPT };
