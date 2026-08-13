-- RISK-003: bounded retries for reminders.
--
-- 1) Track consecutive send failures so a reminder that deterministically fails to
--    send can be capped (and surfaced) instead of retried forever.
ALTER TABLE reminders ADD COLUMN failed_attempts INTEGER NOT NULL DEFAULT 0;

-- 2) Add a terminal 'failed' status. SQLite cannot modify an existing CHECK
--    constraint in place, so recreate the table with the extended status
--    allow-list, preserving all data and the original columns/constraints.
CREATE TABLE reminders_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  entity_id INTEGER,
  event_id INTEGER,
  project_id INTEGER,
  remind_at_utc TEXT NOT NULL,
  repeat_rule TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','notified','failed','cancelled')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low','medium','high','urgent')),
  source_message_id TEXT DEFAULT '',
  notified_at TEXT,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO reminders_new (
  id, title, description, entity_id, event_id, project_id, remind_at_utc, repeat_rule,
  status, priority, source_message_id, notified_at, created_at, updated_at
)
SELECT
  id, title, description, entity_id, event_id, project_id, remind_at_utc, repeat_rule,
  status, priority, source_message_id, notified_at, created_at, updated_at
FROM reminders;

DROP TABLE reminders;
ALTER TABLE reminders_new RENAME TO reminders;

-- Recreate the original reminders indexes (dropped with the old table).
CREATE INDEX IF NOT EXISTS idx_reminders_status ON reminders(status);
CREATE INDEX IF NOT EXISTS idx_reminders_remind_at ON reminders(remind_at_utc);
