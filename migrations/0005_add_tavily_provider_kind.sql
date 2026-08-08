-- Ava Brain: Allow 'tavily' as a provider kind for web search
-- Run: wrangler d1 execute ava_brain_db --remote --file=migrations/0005_add_tavily_provider_kind.sql

PRAGMA foreign_keys=off;

CREATE TABLE api_providers_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('workers_ai','gemini','openai_compatible','tavily')),
  base_url TEXT DEFAULT '',
  model TEXT NOT NULL,
  api_key_enc TEXT DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1,
  priority INTEGER NOT NULL DEFAULT 10,
  timeout_ms INTEGER NOT NULL DEFAULT 30000,
  max_retries INTEGER NOT NULL DEFAULT 2,
  capabilities TEXT NOT NULL DEFAULT '["chat"]',
  health_json TEXT DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO api_providers_new (id, name, kind, base_url, model, api_key_enc, enabled, priority, timeout_ms, max_retries, capabilities, health_json, created_at, updated_at)
SELECT id, name, kind, base_url, model, api_key_enc, enabled, priority, timeout_ms, max_retries, capabilities, health_json, created_at, updated_at
FROM api_providers;

DROP TABLE api_providers;

ALTER TABLE api_providers_new RENAME TO api_providers;

PRAGMA foreign_keys=on;
