-- Ava Brain: Add a description column to workflows so custom workflows can carry
-- a human-readable explanation shown in the admin panel and fallback command list.
-- Run: wrangler d1 execute ava_brain_db --remote --file=migrations/0019_add_workflow_description.sql

ALTER TABLE workflows ADD COLUMN description TEXT DEFAULT '';
