-- ===========================================================================
-- Ava Brain — Consolidated Schema (FINAL STATE)
-- ===========================================================================
-- This file is a READ-ONLY reference combining all 22 migration files into a
-- single source of truth describing the complete database schema.
--
-- It reflects the FINAL state of every table after all migrations (0001-0022).
-- Do NOT apply this as a migration — the production D1 database has already
-- applied the individual migration files. Use this for:
--   - Reviewing the complete schema at a glance
--   - Planning schema changes (hand to AI / reviewers)
--   - Bootstrapping a fresh local DB:  wrangler d1 execute ava_brain_db --local --file=migrations/schema.sql
--
-- D1 binding: DB  (database: ava_brain_db)
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Table: settings
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- Table: auth_users
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS auth_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  must_change_password INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- Table: api_providers
-- Final state includes 'tavily' kind (added in 0005).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS api_providers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('workers_ai','gemini','openai_compatible','tavily')),
  base_url TEXT DEFAULT '',
  model TEXT NOT NULL,
  api_key_enc TEXT DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1,
  priority INTEGER NOT NULL DEFAULT 10,
  timeout_ms INTEGER NOT NULL DEFAULT 30000,
  max_retries INTEGER NOT NULL DEFAULT 2,
  capabilities TEXT NOT NULL DEFAULT '["chat"]',
  health_json TEXT DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- Table: profile_facts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profile_facts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  fact_key TEXT NOT NULL,
  fact_value TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.5,
  source TEXT DEFAULT '',
  is_permanent INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- Table: entities
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS entities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  aliases TEXT DEFAULT '[]',
  metadata TEXT DEFAULT '{}',
  importance INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(type, name)
);

-- ---------------------------------------------------------------------------
-- Table: sessions
-- Final state includes mode | last_message_at | state_json columns (0002, 0003).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_active_at TEXT NOT NULL DEFAULT (datetime('now')),
  summary TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','closed')),
  mode TEXT NOT NULL DEFAULT 'chat',
  last_message_at TEXT,
  state_json TEXT NOT NULL DEFAULT '{}'
);

-- ---------------------------------------------------------------------------
-- Table: memory_short_term
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS memory_short_term (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  type TEXT NOT NULL DEFAULT 'note',
  content TEXT NOT NULL,
  importance INTEGER NOT NULL DEFAULT 1,
  metadata TEXT DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- Table: memory_long_term
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS memory_long_term (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL DEFAULT 'fact',
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  tags TEXT DEFAULT '[]',
  importance INTEGER NOT NULL DEFAULT 1,
  source TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_accessed_at TEXT,
  access_count INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT
);

-- ---------------------------------------------------------------------------
-- Table: events
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_id INTEGER,
  type TEXT NOT NULL CHECK(type IN ('birthday','anniversary','meeting','deadline','other')),
  title TEXT NOT NULL,
  calendar TEXT NOT NULL CHECK(calendar IN ('jalali','gregorian')),
  year INTEGER,
  month INTEGER NOT NULL,
  day INTEGER NOT NULL,
  next_occurrence_utc TEXT,
  remind_offsets_minutes TEXT DEFAULT '[60,1440]',
  notes TEXT DEFAULT '',
  importance INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- Table: reminders
-- Final state includes failed_attempts + 'failed' status (RISK-003, migration 0014).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reminders (
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

-- ---------------------------------------------------------------------------
-- Table: projects
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  client TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','completed','cancelled')),
  deadline_utc TEXT,
  progress_percent INTEGER NOT NULL DEFAULT 0,
  next_action TEXT DEFAULT '',
  importance INTEGER NOT NULL DEFAULT 1,
  notes TEXT DEFAULT '',
  metadata TEXT DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- Table: project_updates
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS project_updates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  note TEXT NOT NULL,
  progress_percent INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- Table: routines  (obsolete — kept for migration-history preservation, not used by active code)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS routines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  action_type TEXT NOT NULL CHECK(action_type IN ('news_ai','custom_message','project_followup','checkin','summary','other')),
  schedule_type TEXT NOT NULL CHECK(schedule_type IN ('daily','interval','weekly','once','cron')),
  local_time TEXT DEFAULT '',
  interval_hours INTEGER,
  cron_expression TEXT DEFAULT '',
  payload TEXT DEFAULT '{}',
  enabled INTEGER NOT NULL DEFAULT 0,
  draft INTEGER NOT NULL DEFAULT 1,
  last_run_at TEXT,
  next_run_utc TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- Table: logs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  level TEXT NOT NULL DEFAULT 'info' CHECK(level IN ('debug','info','warn','error')),
  event TEXT NOT NULL,
  metadata TEXT DEFAULT '{}'
);

-- ---------------------------------------------------------------------------
-- Table: pending_actions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pending_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL,
  action_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','done','failed')),
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- Table: judge_logs
-- Final state includes route | workflow_id columns (0009, 0021).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS judge_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  message_text TEXT,
  category TEXT,
  confidence_score REAL,
  required_fields TEXT,
  provider_id INTEGER,
  processing_time_ms INTEGER,
  route TEXT,
  workflow_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- Table: capability_priorities
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS capability_priorities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  capability TEXT NOT NULL,
  provider_id INTEGER NOT NULL REFERENCES api_providers(id) ON DELETE CASCADE,
  priority INTEGER NOT NULL DEFAULT 10,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(capability, provider_id)
);

-- ---------------------------------------------------------------------------
-- Table: workflows
-- Final state includes description column (0019).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workflows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  capability TEXT NOT NULL,
  topic_key TEXT DEFAULT '',
  trigger_keywords TEXT DEFAULT '',
  is_default INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  description TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- Table: workflow_steps
-- Final state includes fallback_step_id | depends_on columns (0020, 0022).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workflow_steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workflow_id INTEGER NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL DEFAULT 0,
  group_id INTEGER NOT NULL DEFAULT 0,
  capability TEXT NOT NULL,
  provider_id INTEGER,
  input_source TEXT NOT NULL DEFAULT 'user_message' CHECK(input_source IN ('user_message','previous_step','all_previous_steps')),
  prompt_template TEXT DEFAULT '',
  output_role TEXT NOT NULL DEFAULT 'intermediate' CHECK(output_role IN ('intermediate','final')),
  fallback_step_id INTEGER,
  depends_on TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- Table: daily_plans
-- Final state includes 'no_plan_data' status (0013).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS daily_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  plan_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'questionnaire_pending' CHECK(status IN ('questionnaire_pending','questionnaire_open','questionnaire_completed','plan_generated','no_plan_data')),
  access_token TEXT NOT NULL,
  questionnaire_sent_at TEXT,
  checkin_sent_at TEXT,
  last_reminder_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, plan_date)
);

-- ---------------------------------------------------------------------------
-- Table: daily_plan_questions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS daily_plan_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER NOT NULL REFERENCES daily_plans(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer_type TEXT NOT NULL DEFAULT 'score' CHECK(answer_type IN ('yes_no','score','time','select','text')),
  options TEXT DEFAULT '',
  is_fixed INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'fixed' CHECK(source IN ('fixed','ai')),
  answer TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- Table: daily_plan_activities
-- Final state includes source | scheduled_time | priority | reminder_id (0013).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS daily_plan_activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER NOT NULL REFERENCES daily_plans(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed','skipped')),
  source TEXT DEFAULT 'ai',
  scheduled_time TEXT DEFAULT '',
  priority TEXT DEFAULT 'medium',
  reminder_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- Table: workflow_runs  (workflow observability / decision trace, 0022)
-- ---------------------------------------------------------------------------
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

-- ===========================================================================
-- Indexes
-- ===========================================================================
-- Initial indexes (0001)
CREATE INDEX IF NOT EXISTS idx_memory_st_expires ON memory_short_term(expires_at);
CREATE INDEX IF NOT EXISTS idx_memory_st_session ON memory_short_term(session_id);
CREATE INDEX IF NOT EXISTS idx_memory_lt_tags ON memory_long_term(tags);
CREATE INDEX IF NOT EXISTS idx_reminders_status ON reminders(status);
CREATE INDEX IF NOT EXISTS idx_reminders_remind_at ON reminders(remind_at_utc);
CREATE INDEX IF NOT EXISTS idx_events_next_occ ON events(next_occurrence_utc);
CREATE INDEX IF NOT EXISTS idx_routines_next_run ON routines(next_run_utc);
CREATE INDEX IF NOT EXISTS idx_logs_created ON logs(created_at);
CREATE INDEX IF NOT EXISTS idx_pending_actions_status ON pending_actions(status);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);

-- judge_logs (0004)
CREATE INDEX IF NOT EXISTS idx_judge_logs_created ON judge_logs(created_at);

-- capability_priorities (0007)
CREATE INDEX IF NOT EXISTS idx_capability_priorities_capability ON capability_priorities(capability, priority);

-- workflows (0008)
CREATE INDEX IF NOT EXISTS idx_workflow_steps_workflow ON workflow_steps(workflow_id, step_order);

-- OPT-010 (0015): covering index for getShortTerm() hot query
CREATE INDEX IF NOT EXISTS idx_memory_st_session_expires ON memory_short_term(session_id, expires_at);

-- daily_plans (0012)
CREATE INDEX IF NOT EXISTS idx_daily_plans_date ON daily_plans(plan_date);
CREATE INDEX IF NOT EXISTS idx_daily_plan_questions_plan ON daily_plan_questions(plan_id);
CREATE INDEX IF NOT EXISTS idx_daily_plan_activities_plan ON daily_plan_activities(plan_id);

-- workflow_runs (0022)
CREATE INDEX IF NOT EXISTS idx_workflow_runs_created ON workflow_runs(created_at);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow ON workflow_runs(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_status ON workflow_runs(status);

-- ===========================================================================
-- Seed Data
-- ===========================================================================

-- --- 0001: Base settings --------------------------------------------------
INSERT OR IGNORE INTO settings (key, value) VALUES
  ('bot_name', 'Ava'),
  ('owner_name', 'Pouria'),
  ('owner_telegram_id', ''),
  ('timezone', 'Asia/Tehran'),
  ('persona', 'You are Ava, a smart, friendly, and proactive personal assistant. You are concise, warm, and speak naturally. You adapt to preferences over time and are always looking out for deadlines, reminders, and well-being.'),
  ('response_style', 'warm_conversational'),
  ('judge_provider_id', ''),
  ('last_interaction_at', ''),
  ('last_checkin_at', ''),
  ('cleanup_last_run_at', ''),
  ('nightly_summary_last_run_at', '');

-- --- 0001: Default admin user (password: 12345678, must_change_password=1) ---
INSERT OR IGNORE INTO auth_users (username, password_hash, salt, must_change_password)
  VALUES ('papapouria', 'initial_placeholder', 'initial_placeholder', 1);

-- --- 0001: Default Workers AI provider ---
INSERT OR IGNORE INTO api_providers (name, kind, model, enabled, priority, capabilities)
  VALUES ('Cloudflare Workers AI', 'workers_ai', '@cf/meta/llama-3.1-8b-instruct', 1, 1, '["router","chat","extract","news","summary","followup"]');

-- --- 0002_keyword_filter_settings: Trigger keywords -------------------------
INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES
  ('keyword_note_triggers', 'remember,note', datetime('now')),
  ('keyword_reminder_triggers', 'remind,reminder,یادآوری,یادم بنداز,یادام بنداز,یادت باشه,یادت نره', datetime('now')),
  ('keyword_project_trigger', 'project', datetime('now')),
  ('keyword_project_create_triggers', 'create,new project,start', datetime('now')),
  ('keyword_project_exclude_triggers', 'update,show,list', datetime('now')),
  ('keyword_voice_reply_triggers', 'با صدا جواب بده,جواب صوتی,ویس بده,ویس جواب,voice reply,reply with voice,answer with voice,send voice', datetime('now')),
  ('keyword_image_request_triggers', 'عکس بساز,تصویر بساز,عکس بکش,نقاشی بکش,generate image,create an image,draw me,draw a', datetime('now')),
  ('keyword_help_triggers', 'help,/help', datetime('now')),
  ('keyword_memory_exclude_triggers', 'remind,reminder,یادآور,یاداور', datetime('now')),
  ('keyword_judge_fallback_triggers', 'remind,reminder,یادآوری,یادم بنداز,task,project,deadline,event,schedule', datetime('now'));

-- --- 0006: Judge routing toggle -------------------------------------------
INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES
  ('judge_routing_enabled', 'false', datetime('now'));

-- --- 0008: Default workflows (explicit IDs) --------------------------------
INSERT OR IGNORE INTO workflows (id, name, capability, topic_key, trigger_keywords, is_default, enabled) VALUES
  (1, 'Default Normal Chat', 'normal_chat', '', '', 1, 1),
  (2, 'Default Smart AI', 'smart_ai', '', '', 1, 1),
  (3, 'Default Search', 'search', '', '', 1, 1),
  (4, 'Default Image Generation', 'image_generation', '', '', 1, 1),
  (5, 'Default TTS', 'tts', '', '', 1, 1),
  (6, 'Default STT', 'stt', '', '', 1, 1);

INSERT OR IGNORE INTO workflow_steps (id, workflow_id, step_order, group_id, capability, input_source, output_role, prompt_template) VALUES
  (1, 1, 1, 1, 'chat', 'user_message', 'final', ''),
  (2, 2, 1, 1, 'smart_ai', 'user_message', 'final', ''),
  (3, 3, 1, 1, 'web_search', 'user_message', 'intermediate', ''),
  (4, 3, 2, 2, 'chat', 'previous_step', 'final', 'You are Ava. Using ONLY the search results below, give the user a concise, well-organized answer in their own language. Cite sources as [1], [2], etc. with their URLs at the end.\n\nSearch results:\n{{previous_output}}'),
  (5, 4, 1, 1, 'image_gen', 'user_message', 'final', ''),
  (6, 5, 1, 1, 'tts', 'user_message', 'final', ''),
  (7, 6, 1, 1, 'stt', 'user_message', 'final', '');

-- --- 0010: Legacy judge_provider_id → capability_priorities backfill --------
-- One-time migration: copies the legacy single judge_provider_id setting into
-- capability_priorities so existing single-Judge configs keep working.
INSERT OR IGNORE INTO capability_priorities (capability, provider_id, priority, enabled)
SELECT 'judge', CAST(value AS INTEGER), 1, 1
FROM settings
WHERE key = 'judge_provider_id' AND value IS NOT NULL AND TRIM(value) != '';

-- --- 0011: Personality optimization toggle ---------------------------------
INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES
  ('personality_optimization_enabled', 'false', datetime('now'));

-- --- 0012: Daily Plan settings --------------------------------------------
INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES
  ('daily_plan_enabled', 'false', datetime('now')),
  ('daily_plan_retention_days', '7', datetime('now')),
  ('daily_plan_morning_time', '07:00', datetime('now')),
  ('daily_plan_checkin_time', '18:00', datetime('now')),
  ('daily_plan_night_delay_hours', '7', datetime('now')),
  ('daily_plan_reminder_interval_hours', '3', datetime('now')),
  ('daily_plan_ai_question_count', '2', datetime('now')),
  ('daily_plan_app_url', '', datetime('now'));

-- --- 0016: Verbose logging toggle -----------------------------------------
INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES
  ('verbose_logging', 'false', datetime('now'));

-- --- 0017: Judge debug toggle ---------------------------------------------
INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES
  ('judge_debug_enabled', 'false', datetime('now'));

-- --- 0018: Judge manual fallback toggle (default true) --------------------
INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES
  ('judge_manual_fallback_enabled', 'true', datetime('now'));

-- --- 0022: Workflow step dependency backfill ------------------------------
-- Populates depends_on on existing workflow_steps from legacy group_id semantics.
-- A step depends on every step in a numerically-earlier group.
-- (Only has effect when workflow_steps already has rows — no-op on fresh DBs.)
INSERT OR IGNORE INTO workflow_steps (id, workflow_id, step_order, group_id, capability, input_source, output_role, depends_on)
SELECT
  s.id, s.workflow_id, s.step_order, s.group_id, s.capability,
  s.input_source, s.output_role,
  COALESCE((
    SELECT json_group_array(prev.id)
    FROM workflow_steps prev
    WHERE prev.workflow_id = s.workflow_id
      AND prev.group_id < s.group_id
  ), '[]')
FROM workflow_steps s
WHERE s.depends_on = '[]'
  AND EXISTS (
    SELECT 1 FROM workflow_steps prev
    WHERE prev.workflow_id = s.workflow_id
      AND prev.group_id < s.group_id
  )
ON CONFLICT(id) DO UPDATE SET depends_on = excluded.depends_on;
