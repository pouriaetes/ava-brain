-- Ava Brain: Adaptive personality / learning settings
-- Run: wrangler d1 execute ava_brain_db --remote --file=migrations/0011_add_adaptive_settings.sql
-- No new table is created: learned behavior is stored in the existing profile_facts
-- table under dedicated categories (behavioral_preference, communication_preference,
-- interaction_habit), reusing the project's memory architecture.

INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES
  ('personality_optimization_enabled', 'false', datetime('now'));
