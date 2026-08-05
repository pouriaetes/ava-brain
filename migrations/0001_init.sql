-- Ava Brain: Initial schema
-- Run: wrangler d1 execute ava_brain_db --local --file=migrations/0001_init.sql

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS auth_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  must_change_password INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS api_providers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('workers_ai','gemini','openai_compatible')),
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

CREATE TABLE IF NOT EXISTS profile_facts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  fact_key TEXT NOT NULL,
  fact_value TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.5,
  source TEXT DEFAULT '',
  is_permanent INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS entities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  aliases TEXT DEFAULT '[]',
  metadata TEXT DEFAULT '{}',
  importance INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(type, name)
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_active_at TEXT NOT NULL DEFAULT (datetime('now')),
  summary TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','closed'))
);

CREATE TABLE IF NOT EXISTS memory_short_term (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  type TEXT NOT NULL DEFAULT 'note',
  content TEXT NOT NULL,
  importance INTEGER NOT NULL DEFAULT 1,
  metadata TEXT DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memory_long_term (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL DEFAULT 'fact',
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  tags TEXT DEFAULT '[]',
  importance INTEGER NOT NULL DEFAULT 1,
  source TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_accessed_at TEXT,
  access_count INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_id INTEGER,
  type TEXT NOT NULL CHECK(type IN ('birthday','anniversary','meeting','deadline','other')),
  title TEXT NOT NULL,
  calendar TEXT NOT NULL CHECK(calendar IN ('jalali','gregorian')),
  year INTEGER,
  month INTEGER NOT NULL,
  day INTEGER NOT NULL,
  next_occurrence_utc TEXT,
  remind_offsets_minutes TEXT DEFAULT '[60,1440]',
  notes TEXT DEFAULT '',
  importance INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  entity_id INTEGER,
  event_id INTEGER,
  project_id INTEGER,
  remind_at_utc TEXT NOT NULL,
  repeat_rule TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','notified','cancelled')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low','medium','high','urgent')),
  source_message_id TEXT DEFAULT '',
  notified_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  client TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','completed','cancelled')),
  deadline_utc TEXT,
  progress_percent INTEGER NOT NULL DEFAULT 0,
  next_action TEXT DEFAULT '',
  importance INTEGER NOT NULL DEFAULT 1,
  notes TEXT DEFAULT '',
  metadata TEXT DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS project_updates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  note TEXT NOT NULL,
  progress_percent INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS routines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  action_type TEXT NOT NULL CHECK(action_type IN ('news_ai','custom_message','project_followup','checkin','summary','other')),
  schedule_type TEXT NOT NULL CHECK(schedule_type IN ('daily','interval','weekly','once','cron')),
  local_time TEXT DEFAULT '',
  interval_hours INTEGER,
  cron_expression TEXT DEFAULT '',
  payload TEXT DEFAULT '{}',
  enabled INTEGER NOT NULL DEFAULT 0,
  draft INTEGER NOT NULL DEFAULT 1,
  last_run_at TEXT,
  next_run_utc TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  level TEXT NOT NULL DEFAULT 'info' CHECK(level IN ('debug','info','warn','error')),
  event TEXT NOT NULL,
  metadata TEXT DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS pending_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL,
  action_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','done','failed')),
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Seed: settings
INSERT OR IGNORE INTO settings (key, value) VALUES
  ('bot_name', 'Ava'),
  ('owner_name', 'Pouria'),
  ('owner_telegram_id', ''),
  ('timezone', 'Asia/Tehran'),
  ('persona', 'You are Ava, a smart, friendly, and proactive personal assistant. You are concise, warm, and speak naturally. You adapt to preferences over time and are always looking out for deadlines, reminders, and well-being.'),
  ('response_style', 'warm_conversational'),
  ('last_interaction_at', ''),
  ('last_checkin_at', ''),
  ('cleanup_last_run_at', ''),
  ('nightly_summary_last_run_at', '');

-- Seed default admin user (password: 12345678)
-- This is seeded with a placeholder hash; the first login flow will hash properly.
-- For initial seed we store a known hash+salt so login works.
-- The actual hash gets computed at first login via must_change_password flow.
INSERT OR IGNORE INTO auth_users (username, password_hash, salt, must_change_password)
  VALUES ('papapouria', 'initial_placeholder', 'initial_placeholder', 1);

-- Seed default Workers AI provider
INSERT OR IGNORE INTO api_providers (name, kind, model, enabled, priority, capabilities)
  VALUES ('Cloudflare Workers AI', 'workers_ai', '@cf/meta/llama-3.1-8b-instruct', 1, 1, '["router","chat","extract","news","summary","followup"]');

-- Indexes
CREATE INDEX IF NOT EXISTS idx_memory_st_expires ON memory_short_term(expires_at);
CREATE INDEX IF NOT EXISTS idx_memory_st_session ON memory_short_term(session_id);
CREATE INDEX IF NOT EXISTS idx_memory_lt_tags ON memory_long_term(tags);
CREATE INDEX IF NOT EXISTS idx_reminders_status ON reminders(status);
CREATE INDEX IF NOT EXISTS idx_reminders_remind_at ON reminders(remind_at_utc);
CREATE INDEX IF NOT EXISTS idx_events_next_occ ON events(next_occurrence_utc);
CREATE INDEX IF NOT EXISTS idx_routines_next_run ON routines(next_run_utc);
CREATE INDEX IF NOT EXISTS idx_logs_created ON logs(created_at);
CREATE INDEX IF NOT EXISTS idx_pending_actions_status ON pending_actions(status);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);