-- Ava Brain: track which custom workflow (if any) the Judge selected, for admin debugging
-- Run: wrangler d1 execute ava_brain_db --remote --file=migrations/0021_add_judge_logs_workflow_id.sql

ALTER TABLE judge_logs ADD COLUMN workflow_id INTEGER;
