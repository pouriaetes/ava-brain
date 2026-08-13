-- Ava Brain: Workflow dependency graph + observable execution records.
--
-- 1) workflow_steps gains an explicit `depends_on` column (JSON array of step ids).
--    Execution order is derived from these dependencies (a DAG), replacing the
--    fragile manual group_id/step_order graph semantics. The legacy columns are
--    kept untouched so historical data and old migration history stay valid.
--
-- 2) Data backfill: a step now depends on every step in a numerically-earlier
--    group (the exact semantics of the old group_id execution model), so existing
--    workflows run identically after the migration.
--
-- 3) New workflow_runs table: one row per workflow execution with the full
--    per-step record (provider, duration, status, error, fallback) and the
--    decision that selected it — the basis for workflow observability and the
--    admin Decision Trace.
-- Run: wrangler d1 execute ava_brain_db --local --file=migrations/0022_workflow_dependency_graph_and_runs.sql
--      wrangler d1 execute ava_brain_db --remote --file=migrations/0022_workflow_dependency_graph_and_runs.sql

ALTER TABLE workflow_steps ADD COLUMN depends_on TEXT NOT NULL DEFAULT '[]';

-- Backfill depends_on from legacy group/order semantics. A staging table snapshots
-- the dependency pairs so the UPDATE reads a stable pre-update view. (workerd's
-- SQLite rejects CREATE TEMP TABLE inside D1 migrations, hence a plain table.)
CREATE TABLE IF NOT EXISTS wf_step_deps AS
SELECT s.id AS step_id,
  json_group_array(prev.id) AS deps
FROM workflow_steps s
JOIN workflow_steps prev ON prev.workflow_id = s.workflow_id AND prev.group_id < s.group_id
GROUP BY s.id;

UPDATE workflow_steps
SET depends_on = COALESCE((SELECT deps FROM wf_step_deps WHERE step_id = workflow_steps.id), '[]');

DROP TABLE wf_step_deps;

-- Workflow execution records (observability + decision trace).
CREATE TABLE IF NOT EXISTS workflow_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT,
  source TEXT NOT NULL DEFAULT 'message' CHECK(source IN ('message','admin_test')),
  message_text TEXT,
  capability TEXT,
  workflow_id INTEGER,
  workflow_name TEXT,
  selection_source TEXT,
  judge_route TEXT,
  judge_confidence REAL,
  judge_provider_id INTEGER,
  judge_error TEXT,
  status TEXT NOT NULL DEFAULT 'success' CHECK(status IN ('success','failed')),
  final_text TEXT,
  total_duration_ms INTEGER,
  error TEXT,
  steps_json TEXT NOT NULL DEFAULT '[]',
  decision_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_created ON workflow_runs(created_at);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow ON workflow_runs(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_status ON workflow_runs(status);
