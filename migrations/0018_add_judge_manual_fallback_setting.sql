-- Ava Brain: Manual fallback when the Judge classifier is unavailable
-- When ON, a failed Judge decision (decision = unavailable) replies with a list of
-- /commands (e.g. /web_search, /tts, /image) plus an apology so the user can pick
-- the action manually instead of Ava guessing in general chat.
-- Run: wrangler d1 execute ava_brain_db --remote --file=migrations/0018_add_judge_manual_fallback_setting.sql

INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES
  ('judge_manual_fallback_enabled', 'true', datetime('now'));
