# Research Note: claude-code-telegram

**Repo**: https://github.com/RichardAtCT/claude-code-telegram
**Tier**: B (feature scope reference)
**Language**: Python 3.11+
**License**: MIT
**Last checked**: 2026-04-24
**Tokens spent**: ~14K

---

## 1. What It Does

Feature-complete Telegram bot bridging Claude Code to Telegram chat. Two modes: agentic (conversational, default) and classic (13-command terminal-like). Provides multi-project routing via Telegram topics/threads, webhook ingestion, APScheduler cron jobs, voice transcription, file/image uploads, audit logging, and cost tracking - all backed by SQLite.

---

## 2. Architecture at a Glance

Telegram message flow:
  update -> middleware [Security(-3), Auth(-2), RateLimit(-1)]
  -> MessageOrchestrator (group 10)
      -> agentic_text() OR classic command handlers
  -> ClaudeIntegration facade -> ClaudeSDKManager / CLI fallback
  -> SQLite (sessions, audit, cost, project_threads)
  -> Response -> Telegram

External triggers:
  Webhook POST -> FastAPI -> HMAC verify -> dedup -> EventBus -> AgentHandler
  APScheduler cron -> ScheduledEvent -> EventBus -> AgentHandler
  AgentHandler -> ClaudeIntegration -> NotificationService -> Telegram

Key modules:
- src/bot/orchestrator.py - MessageOrchestrator: single entry, mode router, project-thread enforcer
- src/bot/middleware/ - auth, rate_limit, security validators
- src/claude/ - facade + SDK manager + session manager + tool monitor
- src/projects/registry.py - YAML-backed ProjectRegistry
- src/projects/thread_manager.py - maps Telegram topic IDs to project slugs
- src/scheduler/scheduler.py - APScheduler wrapper; fires ScheduledEvents to EventBus
- src/security/ - AuthManager (whitelist + token), RateLimiter (token bucket), audit, validators
- src/events/ - EventBus (async pub/sub), event types, AgentHandler
- src/api/ - FastAPI webhook server
- src/notifications/ - NotificationService with per-chat rate limit
---

## 3. Telegram Command Inventory

### Agentic Mode (default)

| Command | Purpose |
|---|---|
| /start | Welcome + auth handshake |
| /new | Start new Claude session (clear context) |
| /status | Show active session info, working dir, cost |
| /verbose 0-2 | Adjust tool-use output verbosity per session |
| /repo [name] | List repos in workspace or switch project directory |
| /sync_threads | Sync Telegram topics to project YAML (if ENABLE_PROJECT_THREADS=true) |

### Classic Mode (AGENTIC_MODE=false)

| Command | Purpose |
|---|---|
| /start | Welcome |
| /help | List commands |
| /new | New Claude session |
| /continue | Resume last session |
| /end | End current session |
| /status | Session + working dir status |
| /cd dir | Change working directory |
| /ls | List directory contents |
| /pwd | Print working directory |
| /projects | List registered projects |
| /export [md/html/json] | Export session transcript |
| /actions | Inline keyboard of quick actions (run tests, format, lint, install) |
| /git | Git operations UI |
| /sync_threads | Topic sync (if enabled) |

Total: 14 distinct commands across both modes.

---

## 4. Focus Question Answers

### Q1: What does MessageOrchestrator route?

MessageOrchestrator (orchestrator.py) is the single entry point for all Telegram updates. It:
1. Injects deps into context.bot_data (auth_manager, claude_integration, storage, security_validator, settings)
2. If ENABLE_PROJECT_THREADS=true: enforces messages arrive in correct topic thread; resolves project_root and claude_session_id from thread state keyed by chat_id:thread_id
3. Routes to agentic_text() (conversational) or _register_classic_handlers() (full command set)
4. Tracks ActiveRequest per user to support interrupt on new message

### Q2: APScheduler cron integration

JobScheduler (scheduler.py) wraps AsyncIOScheduler. Pattern:
- add_job(job_name, cron_expression, prompt, target_chat_ids, working_directory) registers CronTrigger.from_crontab(expr), persists to scheduled_jobs SQLite table
- On fire: _fire_event() publishes ScheduledEvent to EventBus
- AgentHandler subscribes, calls ClaudeIntegration.run_command(), NotificationService delivers to target_chat_ids
- On startup: _load_jobs_from_db() reloads all is_active=1 jobs (crash-safe)
- No Telegram commands to manage jobs at runtime; jobs added programmatically

### Q3: Security layers

5-layer defense model:
1. Authentication - whitelist of ALLOWED_USERS Telegram IDs (primary). Optional token-based auth. AuthenticationManager tries providers in order; first success wins. Sessions in-memory 24h TTL.
2. Directory isolation - APPROVED_DIRECTORY is root. SecurityValidator blocks path traversal.
3. Input validation - blocks semicolons, shell &&, injection patterns. Blocks .env/.ssh/id_rsa/.pem. Toggle with DISABLE_SECURITY_PATTERNS=true.
4. Rate limiting - token bucket per user. RATE_LIMIT_REQUESTS / RATE_LIMIT_WINDOW. Cost-based: CLAUDE_MAX_COST_PER_USER USD.
5. Audit logging - all security events persisted to SQLite audit_log table.

Webhook auth: GitHub HMAC-SHA256 signature verification; Bearer token for other providers. Atomic dedup via webhook_events table.
ToolMonitor: validates Claude tool calls against allowlist/disallowlist and file path boundaries.

### Q4: Multi-project pattern

Similar to profile.yaml approach, but Telegram-native.

- YAML config at PROJECTS_CONFIG_PATH (default: config/projects.yaml)
- Schema: list of {slug, name, path, enabled} where path is relative to APPROVED_DIRECTORY
- load_project_registry() validates at startup: slug uniqueness, path traversal prevention, enabled flag
- ProjectDefinition is a frozen dataclass (slug, name, relative_path, absolute_path, enabled)
- Thread manager maps (chat_id, thread_id) -> ProjectDefinition in SQLite project_threads table
- /sync_threads creates Telegram topic threads per enabled project (requires supergroup)

Differences from our profile.yaml:
- No runtime metadata per project (model, hook profile, tool config) - just path + slug
- Thread routing is Telegram-specific; we route by session/task context
- No project-agnostic core concern - hardcodes Telegram model throughout

### Q5: Complete Telegram command list

See section 3. 14 commands total.
---

## 5. Findings by Category

### BORROW

B1. Command inventory as feature checklist.
Their 14-command set is the definitive reference for what users want from a Claude Code Telegram bot. Use as Orch Telegram command spec. Key additions vs current thinking: /verbose, /repo, /export, /actions (quick actions inline keyboard).

B2. Verbosity level pattern (0/1/2).
/verbose 0|1|2 per-session override of tool-use streaming. Level 0 = final response only (typing indicator stays active). Level 1 = tool names + reasoning snippets. Level 2 = tool inputs + longer reasoning. Implement in Grammy handlers.

B3. Secret redaction in streamed output.
_redact_secrets() regex patterns (orchestrator.py lines 52-80) cover API keys, AWS keys, Bearer tokens, connection strings with credentials. Port 1:1 to TypeScript streaming output pipeline.

B4. Token bucket rate limiter design.
RateLimitBucket (rate_limiter.py): per-user token bucket with consume(), get_wait_time(), get_status(). Dual-limit: request count + cost-based (USD). Directly translatable to TypeScript.

B5. Scheduler -> EventBus decoupling.
JobScheduler never calls Claude directly. Fires ScheduledEvent to EventBus; AgentHandler subscribes. Adopt this indirection for Orch scheduled session firing.

B6. Tool icon emoji map.
_TOOL_ICONS dict (orchestrator.py lines 96-112) maps Claude tool names to emojis for streaming display. Borrow directly for Grammy message formatting.

### SKIP

S1. Classic mode (13 commands). Building agentic-only in Phase 1. Out of scope for Orch v1.
S2. Python implementation internals. We use TypeScript + Grammy. Patterns borrowable; code is not.
S3. Voice transcription. Not in charter scope. Flag for future.
S4. File/image upload handling. Not Phase 1.
S5. Token-based auth provider. Whitelist-only sufficient for personal-use daemon.
S6. Webhook FastAPI server. Not Phase 1; internal scheduler drives our events.

### LEARN

L1. Project-thread (Telegram topic) routing. They map supergroup topic threads 1:1 to projects. Thread-per-project UX is a useful pattern for multi-project Telegram workflow.
L2. Interrupt on new message. ActiveRequest tracks in-flight requests. On new message, cancel in-flight task. Design needed around subprocess model (SIGTERM to claude CLI).
L3. Persistent typing indicator. Refreshed every ~2 seconds at all verbosity levels. Implement in Grammy via sendChatAction polling loop.

### CONCERN

C1. No runtime job management commands. Orch should add /schedule commands if we expose cron features.
C2. Project YAML vs our profile.yaml. Their YAML is minimal (slug/name/path/enabled). Ours carries model routing + hook profile + tool config. Confirm they do not accidentally merge.

---

## 6. Stack Compatibility

| Aspect | Them | Us | Compat |
|---|---|---|---|
| Language | Python 3.11+ | TypeScript / Node 20+ | No direct port |
| Telegram lib | python-telegram-bot | Grammy | Same concept, different API |
| Claude integration | claude-agent-sdk + CLI fallback | CLI subprocess ONLY (ToS) | Their SDK path is our forbidden path |
| Auth | Telegram ID whitelist + optional token | Telegram ID whitelist | We take the subset |
| Storage | SQLite (aiosqlite) | SQLite (Prisma) | Compatible concept |
| Scheduler | APScheduler AsyncIOScheduler | node-cron / bull-mq TBD | Concept translatable |
| Event bus | custom async pub/sub | NestJS EventEmitter | Same pattern |

---

## 7. Key Insights

1. Agentic mode needs only 6 commands. /start, /new, /status, /verbose, /repo, /sync_threads covers the core. Everything else is classic-mode complexity. Phase 1 scope is confirmed lean.

2. Verbosity level is a first-class feature. Users want fine-grained control over tool-use noise during long Claude runs. Persistent typing indicator at level 0 is the safety net. Not cosmetic.

3. Secret regex in streamed output is non-negotiable. Claude Bash tool output and reasoning text can contain API keys. Port _redact_secrets() patterns to TypeScript streaming pipeline before shipping output to Telegram.

---

## 8. License

MIT. Compatible with all usage. No restrictions on borrowing patterns.