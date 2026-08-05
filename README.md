# Ava Brain — Personal Smart Assistant for Telegram

A completely personalized Telegram assistant for Pouria, running on Cloudflare Workers with AI capabilities and full local control.

## Overview

Ava Brain is a smart personal Telegram assistant designed specifically for Pouria. It runs entirely on Cloudflare Workers (no external dependencies), combining AI capabilities, local memory management, and task automation into a seamless experience.

**Key Features:**
- Runs on Cloudflare Workers (Workers, D1, KV, Cron Triggers, Workers AI)
- AI Provider Manager with automatic fallback
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
Router / Brain Matrix (intent detection)
     ↓
Memory Layer (short-term / long-term / profile)
     ↓
AI Provider Manager (fallback/chat/extract/news/summary)
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
- **Admin Panel Routes:** `/admin/ava_brain/login`, `/admin/ava_brain/settings`, `/admin/ava_brain/apis`, `/admin/ava_brain/memory`, `/admin/ava_brain/tasks`, `/admin/ava_brain/logs`
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
├── migrations/
│   └── 0001_init.sql
├── scripts/
│   └── set-webhook.sh
├── src/
│   ├── index.js                    # Main Cloudflare Worker
│   ├── config.js                   # Configuration & secrets
│   ├── routes/                    # HTTP route handlers
│   │   ├── telegram.js
│   │   └── admin.js
│   ├── lib/                       # Core libraries
│   │   ├── ai.js                   # AI Provider Manager
│   │   ├── ai-providers.js         # Individual provider adapters
│   │   ├── auth.js                 # Authentication & sessions
│   │   ├── crypto.js               # Encryption & hashing
│   │   ├── html.js                 # Admin panel HTML helpers
│   │   ├── logger.js               # Structured logging
│   │   ├── memory.js               # Memory management
│   │   ├── projects.js             # Project management
│   │   ├── reminders.js            # Reminders & events
│   │   ├── routines.js             # Dynamic routines
│   │   ├── router.js               # Intent detection
│   │   └── validator.js            # Action validation
│   ├── admin/                      # Admin panel handlers
│   │   ├── dashboard.js
│   │   ├── settings.js
│   │   ├── apis.js
│   │   ├── memory.js
│   │   ├── tasks.js
│   │   └── logs.js
│   └── cron/                      # Scheduled jobs
│       ├── index.js
│       ├── due-reminders.js
│       ├── routines.js
│       ├── project-followup.js
│       ├── checkin.js
│       ├── cleanup.js
│       └── nightly-summary.js
```

## Database Schema

### Tables

**settings:** Key-value store for bot configuration
- `key`, `value`, `updated_at`

**auth_users:** Single admin user (enforced in code)
- `id`, `username`, `password_hash`, `salt`, `must_change_password`, `created_at`, `updated_at`

**api_providers:** AI providers with encrypted API keys
- `id`, `name`, `kind`, `base_url`, `model`, `api_key_enc`, `enabled`, `priority`, `timeout_ms`, `max_retries`, `capabilities`, `health_json`, `created_at`, `updated_at`

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
- `/admin/ava_brain/settings` - Bot configuration
- `/admin/ava_brain/apis` - AI providers management
- `/admin/ava_brain/memory` - Memory management
- `/admin/ava_brain/tasks` - Routines management
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

### Features
- **Owner-only:** Responds only to OWNER_TELEGRAM_ID
- **Typing indicator** before responding
- **Silent in groups** unless directly mentioned
- **Long message splitting** (respects Telegram limits)
- **Markdown/HTML formatting**
- **Error handling:** Always responds, even with provider failures

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
- **Router:** Intent detection and routing
- **Chat:** General conversation
- **Extract:** Information extraction from text
- **News:** RSS feed summarization
- **Summary:** Text summarization
- **Followup:** Project follow-up responses

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