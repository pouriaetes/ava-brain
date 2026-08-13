-- Ava Brain: per-step fallback within a workflow. If a step fails (all models for
-- its capability error, or it returns empty), the engine can run another step
-- instead — "if X doesn't answer, go to Y".
-- Run: wrangler d1 execute ava_brain_db --remote --file=migrations/0020_add_workflow_step_fallback.sql

ALTER TABLE workflow_steps ADD COLUMN fallback_step_id INTEGER;
