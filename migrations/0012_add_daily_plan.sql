-- Ava Brain: Daily Plan system (replaces the obsolete Routines concept)
-- Run: wrangler d1 execute ava_brain_db --remote --file=migrations/0012_add_daily_plan.sql
-- The old `routines` table is left untouched (migration history preserved); it is no
-- longer referenced by any active code. Daily Plan and Reminder are separate concepts.

CREATE TABLE IF NOT EXISTS daily_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  plan_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'questionnaire_pending' CHECK(status IN ('questionnaire_pending','questionnaire_open','questionnaire_completed','plan_generated')),
  access_token TEXT NOT NULL,
  questionnaire_sent_at TEXT,
  checkin_sent_at TEXT,
  last_reminder_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, plan_date)
);

CREATE TABLE IF NOT EXISTS daily_plan_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER NOT NULL REFERENCES daily_plans(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer_type TEXT NOT NULL DEFAULT 'score' CHECK(answer_type IN ('yes_no','score','time','select','text')),
  options TEXT DEFAULT '',
  is_fixed INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'fixed' CHECK(source IN ('fixed','ai')),
  answer TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS daily_plan_activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER NOT NULL REFERENCES daily_plans(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed','skipped')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_daily_plans_date ON daily_plans(plan_date);
CREATE INDEX IF NOT EXISTS idx_daily_plan_questions_plan ON daily_plan_questions(plan_id);
CREATE INDEX IF NOT EXISTS idx_daily_plan_activities_plan ON daily_plan_activities(plan_id);

INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES
  ('daily_plan_enabled', 'false', datetime('now')),
  ('daily_plan_retention_days', '7', datetime('now')),
  ('daily_plan_morning_time', '07:00', datetime('now')),
  ('daily_plan_checkin_time', '18:00', datetime('now')),
  ('daily_plan_night_delay_hours', '7', datetime('now')),
  ('daily_plan_reminder_interval_hours', '3', datetime('now')),
  ('daily_plan_ai_question_count', '2', datetime('now')),
  ('daily_plan_app_url', '', datetime('now'));
