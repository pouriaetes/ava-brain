// src/lib/repos.js — thin shared data-access and formatting helpers.
// Encapsulates the small settings reads and text-normalization utilities that
// used to be duplicated across memory.js / reminders.js / projects.js /
// telegram.js / the cron jobs. No business logic here — just accessors.

// Normalize Persian/Arabic digits to ASCII so "۸" and "8" match in searches.
export function toDigits(input) {
  return String(input || "")
    .replace(/[۰-۹]/g, (c) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(c)))
    .replace(/[٠-٩]/g, (c) => String("٠١٢٣٤٥٦٧٨٩".indexOf(c)));
}

export function normalizeText(input) {
  return toDigits(input).trim().replace(/\s+/g, " ").toLowerCase();
}

// Compact Asia/Tehran wall-clock display of an ISO instant ("" if unparseable).
export function formatLocalTime(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso || "";
  try {
    return d.toLocaleString("en-GB", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
  } catch {
    return iso || "";
  }
}

// Single settings read with fallback.
export async function getSetting(db, key, fallback = "") {
  try {
    const row = await db.prepare("SELECT value FROM settings WHERE key = ?").bind(key).first();
    if (row && row.value !== null && row.value !== undefined && String(row.value).trim() !== "") {
      return row.value;
    }
  } catch (e) {}
  return fallback;
}

export async function getPersona(db, settingsMap = null) {
  if (settingsMap && settingsMap.persona) return settingsMap.persona;
  return await getSetting(db, "persona", "You are Ava, a smart and friendly personal assistant.");
}

export async function getOwnerName(db) {
  return await getSetting(db, "owner_name", "");
}

export async function getTimezone(db) {
  return await getSetting(db, "timezone", "Asia/Tehran");
}

// Redact secrets and cap length before an error string is persisted to traces or
// logs. Plain text (no HTML escaping) — admin layers escape on render.
export function sanitizeError(raw) {
  let msg = String(raw || "Unknown error");
  msg = msg.replace(/[A-Za-z0-9_-]{24,}/g, "[REDACTED]");
  msg = msg.replace(/(api[_-]?key|authorization|token|secret|password)\s*[:=]\s*\S+/gi, "$1: [REDACTED]");
  return msg.substring(0, 500);
}
