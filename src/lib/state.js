// src/lib/state.js — explicit conversational state, stored in sessions.state_json.
// Replaces the heuristic memory-row mechanisms (reminder_draft / judge_fallback in
// memory_short_term) with a single, reusable pending-intent model that supports
// reminders, multi-step tasks, missing slots, confirmation states, and any future
// multi-step flow. State is generic; nothing here is reminder-specific.

const PENDING_TIMEOUT_MIN = 30;
const MANUAL_FALLBACK_TIMEOUT_MIN = 60;

export function parseState(session) {
  try {
    const s = JSON.parse(session?.state_json || "{}");
    return s && typeof s === "object" ? s : {};
  } catch {
    return {};
  }
}

export async function getState(db, sessionId) {
  try {
    const session = await db.prepare("SELECT state_json FROM sessions WHERE id = ?").bind(sessionId).first();
    return parseState(session);
  } catch (e) {
    return {};
  }
}

export async function saveState(db, sessionId, state) {
  try {
    await db
      .prepare("UPDATE sessions SET state_json = ?, last_active_at = datetime('now') WHERE id = ?")
      .bind(JSON.stringify(state), sessionId)
      .run();
  } catch (e) {}
}

// --- pending intent ----------------------------------------------------------
// { intent, collected, missing, metadata, createdAt, expiresAt }

export async function setPendingIntent(db, sessionId, { intent, collected = {}, missing = [], metadata = {} }) {
  const state = await getState(db, sessionId);
  state.pending = {
    intent,
    collected,
    missing,
    metadata,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + PENDING_TIMEOUT_MIN * 60 * 1000).toISOString(),
  };
  await saveState(db, sessionId, state);
  return state.pending;
}

export async function getPendingIntent(db, sessionId) {
  const state = await getState(db, sessionId);
  const pending = state.pending;
  if (!pending) return null;
  if (pending.expiresAt && new Date(pending.expiresAt).getTime() < Date.now()) {
    delete state.pending;
    await saveState(db, sessionId, state);
    return null;
  }
  return pending;
}

export async function clearPendingIntent(db, sessionId) {
  const state = await getState(db, sessionId);
  if (!state.pending) return;
  delete state.pending;
  await saveState(db, sessionId, state);
}

// --- manual-fallback draft ---------------------------------------------------
// When the Judge classifier is unavailable and manual fallback replies with the
// command menu, the original message is preserved here so a later /command can
// re-run it under the chosen capability without the user retyping it.

export async function setManualFallback(db, sessionId, { originalText, messageId }) {
  const state = await getState(db, sessionId);
  state.manualFallback = {
    originalText: String(originalText || "").substring(0, 1500),
    messageId: messageId || null,
    expiresAt: new Date(Date.now() + MANUAL_FALLBACK_TIMEOUT_MIN * 60 * 1000).toISOString(),
  };
  await saveState(db, sessionId, state);
}

export async function getManualFallback(db, sessionId) {
  const state = await getState(db, sessionId);
  const mf = state.manualFallback;
  if (!mf) return null;
  if (mf.expiresAt && new Date(mf.expiresAt).getTime() < Date.now()) {
    delete state.manualFallback;
    await saveState(db, sessionId, state);
    return null;
  }
  return mf;
}

export async function clearManualFallback(db, sessionId) {
  const state = await getState(db, sessionId);
  if (!state.manualFallback) return;
  delete state.manualFallback;
  await saveState(db, sessionId, state);
}
