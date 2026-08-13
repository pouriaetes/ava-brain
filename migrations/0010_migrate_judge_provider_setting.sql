-- Ava Brain: One-time migration of the legacy single judge_provider_id setting into
-- the new capability_priorities table, so existing single-Judge configurations keep
-- working without any manual admin action.
-- Run: wrangler d1 execute ava_brain_db --remote --file=migrations/0010_migrate_judge_provider_setting.sql

INSERT OR IGNORE INTO capability_priorities (capability, provider_id, priority, enabled)
SELECT 'judge', CAST(value AS INTEGER), 1, 1
FROM settings
WHERE key = 'judge_provider_id' AND value IS NOT NULL AND TRIM(value) != '';
