-- Ava Brain: Add missing session tracking columns
-- Run: wrangler d1 execute ava_brain_db --remote --file=migrations/0003_add_session_columns.sql

ALTER TABLE sessions ADD COLUMN last_message_at TEXT;
ALTER TABLE sessions ADD COLUMN state_json TEXT NOT NULL DEFAULT '{}';
