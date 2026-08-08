-- Ava Brain: Add judge_logs table (fixes silent insert failures in judgeMessage())
-- Run: wrangler d1 execute ava_brain_db --remote --file=migrations/0004_add_judge_logs.sql

CREATE TABLE IF NOT EXISTS judge_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  message_text TEXT,
  category TEXT,
  confidence_score REAL,
  required_fields TEXT,
  provider_id INTEGER,
  processing_time_ms INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_judge_logs_created ON judge_logs(created_at);
