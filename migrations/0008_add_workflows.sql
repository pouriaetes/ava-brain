-- Ava Brain: Multi-step workflow engine (sequential + parallel AI chaining)
-- Run: wrangler d1 execute ava_brain_db --remote --file=migrations/0008_add_workflows.sql

CREATE TABLE IF NOT EXISTS workflows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  capability TEXT NOT NULL,
  topic_key TEXT DEFAULT '',
  trigger_keywords TEXT DEFAULT '',
  is_default INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

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
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_workflow_steps_workflow ON workflow_steps(workflow_id, step_order);

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
  (4, 3, 2, 2, 'chat', 'previous_step', 'final', 'You are Ava. Using ONLY the search results below, give the user a concise, well-organized answer in their own language. Cite sources as [1], [2], etc. with their URLs at the end.

Search results:\n{{previous_output}}'),
  (5, 4, 1, 1, 'image_gen', 'user_message', 'final', ''),
  (6, 5, 1, 1, 'tts', 'user_message', 'final', ''),
  (7, 6, 1, 1, 'stt', 'user_message', 'final', '');
