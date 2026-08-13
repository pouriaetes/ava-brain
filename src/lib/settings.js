// Shared settings access — the single source of truth for reading the `settings`
// table. Admin pages and runtime code import from here instead of each page
// re-implementing its own settings query.

// Load every settings row as a { key: value } map (covers keys that may not be
// known to any single caller). Used by admin pages that render whole sections.
export async function getAllSettings(db) {
  const res = await db.prepare("SELECT * FROM settings").all();
  const map = {};
  for (const row of res.results || []) map[row.key] = row.value;
  return map;
}

// Batch-read a specific set of keys with one query, returning a { key: value }
// map (mirrors the batched pattern originally used in the router). Missing keys
// are simply absent from the map.
export async function getSettingsBatch(db, keys) {
  const placeholders = keys.map(() => "?").join(",");
  const rows = (await db.prepare(`SELECT key, value FROM settings WHERE key IN (${placeholders})`).bind(...keys).all()).results || [];
  const map = {};
  for (const row of rows) map[row.key] = row.value;
  return map;
}
