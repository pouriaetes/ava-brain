-- Ava Brain: Add route column to judge_logs to record the full capability route (not just task/memory)
-- Run: wrangler d1 execute ava_brain_db --remote --file=migrations/0009_add_judge_logs_route_column.sql

ALTER TABLE judge_logs ADD COLUMN route TEXT;
