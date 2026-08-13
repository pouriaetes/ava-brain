-- Judge Debug Mode toggle. Mirrors 0006_add_judge_routing_setting.sql: the
-- settings save handler only issues UPDATE ... WHERE key = ?, so a boolean
-- setting must have a seeded row or it can never be persisted.
INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES
  ('judge_debug_enabled', 'false', datetime('now'));
