-- OPT-010: covering index for getShortTerm()'s hot query
-- (WHERE session_id = ? AND expires_at > ? ORDER BY importance, created_at).
-- The existing single-column indexes (idx_memory_st_session, idx_memory_st_expires)
-- do not cover the compound session_id + expires_at access pattern.
CREATE INDEX IF NOT EXISTS idx_memory_st_session_expires ON memory_short_term(session_id, expires_at);
