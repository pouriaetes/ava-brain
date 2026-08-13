-- OPT-005: verbose_logging toggle. When 'false' (default), debug/info log events
-- are still written to console for live tailing but are NOT persisted to D1;
-- warn/error are always persisted regardless of this setting.
INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES
  ('verbose_logging', 'false', datetime('now'));
