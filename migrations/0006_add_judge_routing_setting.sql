-- Ava Brain: Add global Judge Routing enable/disable setting
-- Run: wrangler d1 execute ava_brain_db --remote --file=migrations/0006_add_judge_routing_setting.sql

INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES
  ('judge_routing_enabled', 'false', datetime('now'));
