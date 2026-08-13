-- Ava Brain: Daily Plan data-driven planner support
-- Run: wrangler d1 execute ava_brain_db --remote --file=migrations/0013_daily_plan_data_sources.sql
-- 1) Adds a 'no_plan_data' status so a plan is never marked generated with zero
--    activities when no actionable source data exists.
-- 2) Adds activity source/scheduling fields so the planner can link activities back
--    to real Reminders (avoiding duplication) and carry history forward.

-- Rebuild daily_plans to extend the status CHECK (SQLite cannot ALTER a CHECK).
-- Foreign keys are disabled for the rebuild; children reference the table by name so
-- they re-attach to the new table. Data is preserved.
PRAGMA foreign_keys=OFF;

CREATE TABLE IF NOT EXISTS daily_plans_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  plan_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'questionnaire_pending' CHECK(status IN ('questionnaire_pending','questionnaire_open','questionnaire_completed','plan_generated','no_plan_data')),
  access_token TEXT NOT NULL,
  questionnaire_sent_at TEXT,
  checkin_sent_at TEXT,
  last_reminder_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, plan_date)
);

INSERT INTO daily_plans_new (id, user_id, plan_date, status, access_token, questionnaire_sent_at, checkin_sent_at, last_reminder_at, created_at, updated_at)
  SELECT id, user_id, plan_date, status, access_token, questionnaire_sent_at, checkin_sent_at, last_reminder_at, created_at, updated_at FROM daily_plans;

DROP TABLE daily_plans;
ALTER TABLE daily_plans_new RENAME TO daily_plans;

CREATE INDEX IF NOT EXISTS idx_daily_plans_date ON daily_plans(plan_date);

-- Activity source fields (idempotent ADD COLUMN).
ALTER TABLE daily_plan_activities ADD COLUMN source TEXT DEFAULT 'ai';
ALTER TABLE daily_plan_activities ADD COLUMN scheduled_time TEXT DEFAULT '';
ALTER TABLE daily_plan_activities ADD COLUMN priority TEXT DEFAULT 'medium';
ALTER TABLE daily_plan_activities ADD COLUMN reminder_id INTEGER;

PRAGMA foreign_keys=ON;
