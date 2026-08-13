# Ava Brain — Personal Smart Assistant for Telegram

A completely personalized Telegram assistant for Pouria, running on Cloudflare Workers with AI capabilities and full local control.

## Overview

Ava Brain is a smart personal Telegram assistant designed specifically for Pouria. It runs entirely on Cloudflare Workers (no external dependencies), combining AI capabilities, local memory management, and task automation into a seamless experience.

**Key Features:**
- Runs on Cloudflare Workers (Workers, D1, KV, Cron Triggers, Workers AI)
- AI Provider Manager with automatic fallback (per-capability priority order)
- Judge classifier that routes messages, with a manual command fallback when it fails
- Custom Workflows: multi-step, per-step model + prompt, box-diagram editor, keyword-first routing
- Three-layer memory system (short-term, long-term, profile facts)
- Project management with daily follow-ups
- Dynamic routines and scheduling
- Jalali calendar support for Persian holidays
- Simple single-user admin panel (AVA_BRAIN)
- Automatic personalization over time

## Architecture

```
Telegram User (owner-only)
     ↓
Telegram Bot API (webhook + secret_token)
     ↓
Cloudflare Worker
     ↓
Custom workflow keyword match?  ── yes → run that workflow directly
     ↓ no
Judge classifier (task / chat / search / image / tts / smart_ai / entity_manage / ...)
     ↓  (if Judge fails → manual command list; user picks /web_search, /wf:name, ...)
Router (intent → concrete action) / reminder-create / workflow engine
     ↓
Workflow Engine (multi-step chain, per-step model + prompt + fallback)
     ↓
Memory Layer (short-term / long-term / profile)
     ↓
AI Provider Manager (fallback across providers per capability)
     ↓
Action Executor (validated & executed via code)
     ↓
Response Generator
     ↓
Telegram sendMessage (typing, split long messages)
```

## Project Identity & Ownership

- **Bot Name:** Ava
- **System Slug:** ava_brain
- **Admin Panel Routes:** `/admin/ava_brain/login`, `/admin/ava_brain/settings`, `/admin/ava_brain/apis`, `/admin/ava_brain/memory`, `/admin/ava_brain/reminders`, `/admin/ava_brain/daily_plan`, `/admin/ava_brain/logs`
- **Daily Plan questionnaire:** `/question/<token>` (token-authenticated, no admin login)
- **Owner:** Pouria (Telegram user ID: configurable via OWNER_TELEGRAM_ID env var)

### Authentication

**Strict single-owner model:**
- Only accepts messages from `OWNER_TELEGRAM_ID`
- No multi-user system, invites, or signup
- Exactly one user allowed in `auth_users` table
- Silent drop for unauthorized messages in groups
- Simple "This bot is private" response for direct messages from others

## Configuration & Secrets

### Environment Variables (Cloudflare wrangler secrets)

**Required secrets (set via `wrangler secret put <NAME>`):**
- `TELEGRAM_BOT_TOKEN` - From BotFather (hot path of every message, never in database)
- `TELEGRAM_WEBHOOK_SECRET` - For Telegram's secret_token header
- `OWNER_TELEGRAM_ID` - Initial fallback (runtime copy stored in D1 settings)
- `MASTER_KEY` - For encrypting api_keys in D1
- `ADMIN_SESSION_SECRET` - Signing admin session cookies

### Runtime Configuration (from admin panel)

**Database-driven settings table:**
- Bot name, owner name, persona, response style
- Timezone (Asia/Tehran for Jalali calendar)
- AI provider configurations (Workers AI, Gemini, OpenAI-compatible)
- Memory management settings
- Routine schedules

## Technology Stack

### Infrastructure
- **Platform:** Cloudflare Workers
- **Database:** D1 (SQLite)
- **Cache:** KV (for sessions, rate limiting)
- **AI:** Workers AI (initial), with fallback to Gemini/OpenAI-compatible

### Code Structure
```
ava-brain/
├── wrangler.toml
├── package.json
├── README.md
├── runserver.bat
├── migrations/
│   ├── 0001_init.sql ... 0020_add_workflow_step_fallback.sql   (see list below)
├── scripts/
│   └── set-webhook.sh
├── src/
│   ├── index.js                    # Main Cloudflare Worker
│   ├── config.js                   # Configuration & secrets
│   ├── matrix.js                   # (legacy brain matrix)
│   ├── routes/                     # HTTP route handlers
│   │   ├── telegram.js             # Telegram webhook — Judge, workflows, commands, fallback, response
│   │   ├── admin.js                # Admin panel route handler
│   │   └── health.js               # Health check
│   ├── lib/                        # Core libraries
│   │   ├── ai.js                   # AI Provider Manager (fallback, health, per-capability priority)
│   │   ├── ai-providers.js         # Provider adapters (Workers AI / Gemini / OpenAI / Tavily)
│   │   ├── workflow.js             # Workflow engine (steps, per-step model, {{step:N}}, step fallback)
│   │   ├── judge.js                # Judge classifier + keyword/voice fallback + debug
│   │   ├── router.js               # AI Router (intent → concrete action)
│   │   ├── validator.js            # Action validation & execution
│   │   ├── auth.js                 # Authentication & sessions
│   │   ├── crypto.js               # Encryption & hashing
│   │   ├── html.js                 # Admin panel HTML helpers + design system (CSS/nav)
│   │   ├── logger.js               # Structured logging (D1 + console)
│   │   ├── memory.js               # Memory management (short/long/profile)
│   │   ├── projects.js             # Project management
│   │   ├── reminders.js            # Reminders & events
│   │   ├── daily-plan.js           # Daily Plan system
│   │   ├── dates.js                # Jalali date helpers
│   │   ├── adaptive.js             # Adaptive personality learning
│   │   ├── actions.js              # Action registry
│   │   ├── sessions.js             # Session state (mode, timestamps, JSON state)
│   │   ├── settings.js             # Shared settings read helpers
│   │   ├── telegram.js             # Telegram Bot API helper (send/split/audio/photo)
│   │   └── websearch.js            # Web search utility (Tavily)
│   ├── admin/                      # Admin panel page handlers
│   │   ├── dashboard.js
│   │   ├── settings.js             # Core & Personality, Routing & AI, Keyword Filters, Learning
│   │   ├── apis.js                 # AI provider management
│   │   ├── capabilities.js         # Workflow editor (box diagram), Model Priorities, Models
│   │   ├── memory.js
│   │   ├── reminders.js
│   │   ├── daily-plan.js
│   │   ├── question.js
│   │   └── logs.js
│   └── cron/                       # Scheduled jobs
│       ├── index.js
│       ├── due-reminders.js
│       ├── daily-plan.js
│       ├── project-followup.js
│       ├── checkin.js
│       ├── cleanup.js
│       └── nightly-summary.js
```

## Database Schema

### Migrations
- `0001_init.sql` – Initial schema creation.
- `0002_add_session_mode.sql` – Adds `mode` column to `sessions` (default `'chat'`).
- `0002_keyword_filter_settings.sql` – Inserts default keyword trigger settings for notes, reminders, projects, voice replies, image requests, help, etc.
- `0003_add_session_columns.sql` – Adds `last_message_at` and `state_json` columns to `sessions` for improved session state handling.
- `0004_add_judge_logs.sql` – Creates `judge_logs` table to store classification of incoming messages (task vs memory) and related metadata.
- `0005_add_tavily_provider_kind.sql` – Extends `api_providers` to support a new `tavily` provider kind for web search.
- `0006_add_judge_routing_setting.sql` – Adds `judge_routing_enabled` setting.
- `0007_add_capability_priorities.sql` – Per-capability provider priority table.
- `0008_add_workflows.sql` – `workflows` + `workflow_steps` tables + default workflows.
- `0009_add_judge_logs_route_column.sql` – Adds `route` column to `judge_logs`.
- `0010_migrate_judge_provider_setting.sql` – Migrates `judge_provider_id` setting.
- `0011_add_adaptive_settings.sql` – Adaptive personality settings.
- `0012_add_daily_plan.sql` – Daily plan system.
- `0013_daily_plan_data_sources.sql` – Daily plan data sources.
- `0014_add_reminder_failed_attempts.sql` – Reminder failed-attempt tracking.
- `0015_add_memory_st_composite_index.sql` – Composite index on `memory_short_term`.
- `0016_add_verbose_logging_setting.sql` – `verbose_logging` setting.
- `0017_add_judge_debug_setting.sql` – `judge_debug_enabled` setting.
- `0018_add_judge_manual_fallback_setting.sql` – `judge_manual_fallback_enabled` setting.
- `0019_add_workflow_description.sql` – Adds `description` column to `workflows`.
- `0020_add_workflow_step_fallback.sql` – Adds `fallback_step_id` to `workflow_steps` (per-step fallback).

## Database Schema

### Tables

**settings:** Key-value store for bot configuration
- `key`, `value`, `updated_at`

**auth_users:** Single admin user (enforced in code)
- `id`, `username`, `password_hash`, `salt`, `must_change_password`, `created_at`, `updated_at`

**api_providers:** AI providers with encrypted API keys
- `id`, `name`, `kind`, `base_url`, `model`, `api_key_enc`, `enabled`, `priority`, `timeout_ms`, `max_retries`, `capabilities`, `health_json`, `created_at`, `updated_at`

**capability_priorities:** Per-capability provider fallback order
- `id`, `capability`, `provider_id`, `priority`, `enabled`, `created_at`, `updated_at`

**workflows:** Named custom tasks ("commands") with trigger keywords and a step chain
- `id`, `name`, `capability`, `topic_key`, `trigger_keywords`, `description`, `is_default`, `enabled`, `created_at`, `updated_at`

**workflow_steps:** One box in a workflow's flow diagram
- `id`, `workflow_id`, `step_order`, `group_id` (same = parallel), `capability`, `provider_id`, `input_source`, `prompt_template`, `output_role`, `fallback_step_id`, `created_at`

**profile_facts:** User's personal profile information
- `id`, `category`, `fact_key`, `fact_value`, `confidence`, `source`, `is_permanent`, `created_at`, `updated_at`

**entities:** Named entities with metadata
- `id`, `type`, `name`, `aliases`, `metadata`, `importance`, `created_at`, `updated_at`

**sessions:** Telegram conversation sessions
- `id`, `chat_id`, `started_at`, `last_active_at`, `summary`, `status`

**memory_short_term:** Temporary context (7-day expiry)
- `id`, `session_id`, `type`, `content`, `importance`, `metadata`, `created_at`, `expires_at`

**memory_long_term:** Permanent knowledge
- `id`, `type`, `title`, `content`, `tags`, `importance`, `source`, `created_at`, `last_accessed_at`, `access_count`, `expires_at`

**events:** Calendar events with Jalali support
- `id`, `entity_id`, `type`, `title`, `calendar`, `year`, `month`, `day`, `next_occurrence_utc`, `remind_offsets_minutes`, `notes`, `importance`, `created_at`, `updated_at`

**reminders:** Scheduled reminders
- `id`, `title`, `description`, `entity_id`, `event_id`, `project_id`, `remind_at_utc`, `repeat_rule`, `status`, `priority`, `source_message_id`, `notified_at`, `created_at`, `updated_at`

**projects:** Project tracking with follow-ups
- `id`, `name`, `client`, `status`, `deadline_utc`, `progress_percent`, `next_action`, `importance`, `notes`, `metadata`, `created_at`, `updated_at`

**project_updates:** Project progress updates
- `id`, `project_id`, `note`, `progress_percent`, `created_at`

**routines:** Dynamic scheduled tasks
- `id`, `name`, `action_type`, `schedule_type`, `local_time`, `interval_hours`, `cron_expression`, `payload`, `enabled`, `draft`, `last_run_at`, `next_run_utc`, `created_at`, `updated_at`

**logs:** Action logs (read-only in chat context)
- `id`, `created_at`, `level`, `event`, `metadata`

**pending_actions:** Queued actions
- `id`, `chat_id`, `action_json`, `status`, `expires_at`, `created_at`

## Admin Panel

### Access
- **Single user:** `papapouria` / `12345678` (initial password, must change)
- **Force password change** on first login
- **Rate limiting** on login attempts

### Routes
- `/admin/ava_brain/settings` - Bot configuration (Core, Routing & AI, Keyword Filters, Learning)
- `/admin/ava_brain/apis` - AI providers management
- `/admin/ava_brain/capabilities` - **Workflow** (flow-diagram editor), Model Priorities, Models
- `/admin/ava_brain/memory` - Memory management
- `/admin/ava_brain/reminders` - Reminders management
- `/admin/ava_brain/daily_plan` - Daily Plan management
- `/admin/ava_brain/logs` - System logs

### Permissions
- Admin panel only accessible to single user
- Passwords stored with hash+salt (never plaintext)
- API keys encrypted with MASTER_KEY
- All database operations use prepared statements

## Telegram Bot

### Commands
- `/start` - Start the bot
- `/help` - Show available commands
- `/now` - Current status
- `/reminders` - View reminders
- `/events` - View events
- `/projects` - View projects
- `/routines` - View routines
- `/profile` - View profile
- `/status` - Bot status
- `/forget` - Clear short-term memory
- `/judge_on` / `/judge_off` - Enable / disable Judge routing for this chat
- `/web_search`, `/image`, `/tts`, `/smart_ai`, `/daily_plan`, `/remind`, `/chat` - Manual route commands (also shown when Judge fails)
- `/wf:<name>` - Run a custom workflow directly

### Features
- **Owner-only:** Responds only to OWNER_TELEGRAM_ID
- **Typing indicator** before responding
- **Silent in groups** unless directly mentioned
- **Long message splitting** (respects Telegram limits)
- **Markdown/HTML formatting**
- **Error handling:** Always responds, even with provider failures

## Workflows & Judge Routing

### Judge classifier
- Classifies each message into a route: `task_or_reminder`, `daily_plan`, `normal_chat`, `smart_ai`, `search`, `image_generation`, `tts`, `stt`, `entity_manage`.
- Uses the `judge` capability provider chain (`capability_priorities`). Default chain: Gemini → llama-3.3-70b → llama-3.1-8b-fast.
- On failure (Judge unavailable / non-JSON / all providers down), and when `judge_manual_fallback_enabled` is ON, the bot replies with a technical-problem message listing manual commands instead of guessing.
- Judge now sees the list of active custom workflows (name + description + capability) and can pick one by `workflow_id` semantically. Cheap keyword matching still runs first; the Judge's pick is the fallback. The chosen `workflow_id` is stored in `judge_logs.workflow_id` for debugging.
- JSON replies are requested via the shared `chatJson` helper (`src/lib/json-ai.js`): low temperature, JSON-mode where supported, and a retry with a stricter system prompt when the model returns prose instead of JSON. The three chat adapters honor `options.temperature` / `options.maxTokens` / `options.jsonMode`.

### Custom workflows (first-class tasks)
- A workflow = a named task Ava can do: `name`, `description`, `capability` (search / smart_ai / image_generation / tts / stt), `trigger_keywords`, and a chain of steps.
- **Keyword-first routing:** if the user's message contains a workflow's trigger keyword, that workflow runs directly (before Judge), independent of the classifier.
- **Command:** run one manually with `/wf:<name>` (or `/wf:<id>`).
- **Steps:** each step has its own model (`provider_id`), capability, input source, output role, prompt template, and optional per-step fallback (`fallback_step_id`).
- **Prompt variables:** `{{user_message}}`, `{{previous_step}}` / `{{previous_output}}`, `{{step:N}}` (output of the step with order N).
- **Per-step fallback:** if a step throws or returns empty, it hops to the configured fallback step (loop-guarded). If the chosen model fails, it falls back to the next model for that capability per `capability_priorities`.
- **Parallel steps:** steps sharing the same `group_id` run concurrently; groups run in `step_order` sequence.
- Chat / reminders are NOT workflows — they are direct system paths.
- **Deletion:** custom workflows and steps can be deleted from the admin panel (default workflows are protected). The dashboard warns if any generative capability loses its active default workflow.

### Manual fallback commands (when Judge fails)
```
/web_search <query>    — web search
/image <prompt>        — generate an image
/tts <text>            — voice reply
/smart_ai <question>   — deep reasoning
/daily_plan            — today's plan
/remind <text>         — create a reminder
/chat <text>           — normal chat
/wf:<name> [text]      — run a custom workflow
```
- If the user picks a bare command right after a Judge failure, the ORIGINAL failed message is recovered (stored as a `judge_fallback` draft), the technical-problem message and the user's command message are deleted, and the original request is re-run under the chosen route.

## AI Provider Management

### Initial Setup
- **Default provider:** Cloudflare Workers AI (`@cf/meta/llama-3.1-8b-instruct`)
- **Configuration:** One active provider, rest disabled
- **Fallback chain:** Provider priority determines fallback order

### Provider Management
- Add new providers (Gemini, OpenAI-compatible) from admin panel
- API keys automatically encrypted
- Health monitoring with automatic cooldown on failures
- Timeout handling and retry logic

### Capabilities
- **chat** - General conversation
- **judge** - Message classification / routing
- **smart_ai** - Deep reasoning (coding, math, analysis)
- **web_search** - Live web search (Tavily)
- **image_gen** - Image generation
- **tts** - Text-to-speech (voice reply)
- **stt** - Speech-to-text (voice transcription)
- **routing** - AI Router intent detection
- **memory_analysis** - Memory analysis
- **personality_optimization** - Adaptive personality learning
- **extract / news / summary / followup** - Extraction, RSS summaries, summarization, project follow-ups

Each provider can carry several capabilities; `capability_priorities` sets the fallback order per capability.

## Memory System

### Three Layers

**1. Short-term (7-day expiry)**
- Temporary context for current projects
- Auto-cleanup
- Used for daily project follow-ups

**2. Long-term (permanent)**
- Profile facts
- Important completed projects
- Learned preferences

**3. Profile facts**
- User's personal information
- Learning over time
- Used for personalization

### Context Management
- Sessions track conversation history
- Automatic summary for long gaps (>24h)
- Non-intrusive references to past conversations

## Project Management

### Temporary Projects
When user mentions a project (e.g., "I have a project regarding X by the end of the week"):

1. Creates project in database with `temporary=true`
2. Adds context to short-term memory
3. Daily follow-up messages (if user hasn't responded that day)
4. Completion handling with summary to long-term memory
5. Deadline reminders

### Features
- Project status tracking
- Progress percentage
- Follow-up frequency configuration
- Completion archiving
- Deadline-based reminders

## Routines

### Zero Hardcoding
- No default routines enabled
- Created only on explicit user request
- Draft mode initially, requires confirmation

### Dynamic Scheduling
- Daily, interval, weekly, once, or cron schedules
- Action types: news, custom message, project follow-up, check-in, summary, other
- News routines configurable from admin panel
- RSS source management with AI summarization

### Infrastructure Jobs (hardcoded)
```
*/5 * * * *   → check due reminders + routines + project follow-ups + optional checkin
0 4 * * *     → weekly/daily cleanup (expired short-term, old logs, expired pending_actions)
```

## Personalization

### Gradual Learning
- Profile facts accumulate over time
- Response style adapts to user preferences
- Session summaries track conversation patterns
- Optional nightly summaries

### Proactive Features
- Check-in routines (configurable from admin)
- Project follow-ups (daily, light tone)
- Deadlines and reminders
- Proactive suggestions based on learned patterns

## Security

### Secret Management
- **Telegram secrets never stored in database:** `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`
- **API keys encrypted:** `MASTER_KEY` used for all provider api_key_enc
- **Passwords hashed:** PBKDF2 with salt, never plaintext
- **No secrets in logs:** All sensitive fields filtered from logging

### Access Control
- **Bot:** Only responds to OWNER_TELEGRAM_ID
- **Admin panel:** Single user only
- **Database:** Prepared statements only
- **Webhooks:** Secret token verification

### Data Protection
- **Jalali calendar:** Accurate Persian date handling
- **Encryption:** AES-GCM for sensitive data
- **Session management:** Secure cookies with expiration
- **Input validation:** All user inputs sanitized

## Development & Deployment

### Local Development
```bash
# Install dependencies
npm install

# Run worker locally
npm run dev

# Run migrations locally
npm run db:migrate:local

# Set webhook
npm run set-webhook
```

### Production Deployment
```bash
# Deploy to Cloudflare
wrangler deploy

# Run migrations remotely
npm run db:migrate:remote
```

### Scripts

**set-webhook.sh:** Sets Telegram webhook URL and configures secret token

## Testing

The project includes comprehensive testing for:
- Database migrations
- Authentication flows
- AI provider fallback
- Memory management
- Schedule and reminder functionality
- Admin panel functionality

## Acceptance Criteria

The project is complete when:
- ✅ Worker boots up and responds to Telegram webhook
- ✅ Only OWNER_TELEGRAM_ID can interact with bot
- ✅ Admin panel has single user with password change requirement
- ✅ Works solely with Workers AI initially
- ✅ Providers/models can be added/edited/deleted from panel
- ✅ Fallback between providers works correctly
- ✅ Router only reads necessary tables (anti-overload design)
- ✅ Short-term memory expires, long-term persists
- ✅ Jalali birthdays and reminders work correctly
- ✅ Temporary projects work with daily follow-ups
- ✅ Projects properly archive/complete and clean up
- ✅ Routines only created on user request
- ✅ No secrets leak in logs or responses
- ✅ Initial panel password changes after first login
- ✅ Tehran time/date and Jalali correctly managed
- ✅ During total AI provider outages, user still receives response

## Implementation Phases

1. **Phase 0:** Setup (worker, D1, KV, secrets, config)
2. **Phase 1:** Database (all tables, seeds)
3. **Phase 2:** Admin Auth (login, session, force password change)
4. **Phase 3:** Telegram (webhook, owner check, typing)
5. **Phase 4:** AI Provider Manager (Workers AI, fallbacks)
6. **Phase 5:** Router/Matrix (intent detection)
7. **Phase 6:** Memory (short-term/long-term/profile)
8. **Phase 7:** Reminders/Events (Jalali, cron jobs)
9. **Phase 8:** Projects (create/update/complete, temp projects)
10. **Phase 9:** Routines (dynamic scheduling)
11. **Phase 10:** Admin Panel (full settings/apis/memory/tasks/logs)
12. **Phase 11:** Personalization (profile, summaries, check-in)
13. **Phase 12:** Hardening (error handling, retries, cleanup)

## Notes

### Project Philosophy
- **Boring over clever:** Reliable, maintainable code over clever hacks
- **Stdlib first:** Use native implementations over reinventing
- **Zero configuration:** Default behavior should work out of the box
- **Explicit secrets:** Never expose secrets in code or configuration files

### Design Decisions
- **Database anti-overload:** Router only reads tables needed for each intent
- **Progressive disclosure:** Simple interface with advanced options
- **Fail-safe defaults:** Always respond to user, even with provider failures
- **Continuous improvement:** Memory and personalization build over time

This project is currently under active development. The implementation follows a phased approach with comprehensive testing and validation at each stage.

## Getting Started

1. Clone this repository
2. Run `npm install` to install dependencies
3. Configure secrets in wrangler.toml
4. Run migrations with `npm run db:migrate:local`
5. Deploy with `wrangler deploy`
6. Configure Telegram webhook using `npm run set-webhook`
7. Set OWNER_TELEGRAM_ID environment variable

The system is designed to work out-of-the-box with minimal configuration required.