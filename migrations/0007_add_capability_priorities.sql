-- Ava Brain: Per-capability model priority (multiple models per capability, e.g. multiple Judges)
-- Run: wrangler d1 execute ava_brain_db --remote --file=migrations/0007_add_capability_priorities.sql

CREATE TABLE IF NOT EXISTS capability_priorities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  capability TEXT NOT NULL,
  provider_id INTEGER NOT NULL REFERENCES api_providers(id) ON DELETE CASCADE,
  priority INTEGER NOT NULL DEFAULT 10,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(capability, provider_id)
);

CREATE INDEX IF NOT EXISTS idx_capability_priorities_capability ON capability_priorities(capability, priority);
