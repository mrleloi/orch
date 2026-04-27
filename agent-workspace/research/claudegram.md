# Research Note: claudegram

**URL**: https://github.com/NachoSEO/claudegram
**Clone path**: reference-repos/claudegram/
**Tier**: A (deep study)
**Studied**: 2026-04-24
**Analyst**: research-scanner (sonnet)

---

## Metadata

| Field | Value |
|---|---|
| License | MIT |
| Language | TypeScript (ESM, strict) |
| Node version | >=20 |
| Key deps | @anthropic-ai/claude-agent-sdk ^0.2.44, grammy ^1.31.3, @grammyjs/runner ^2.0.3, @grammyjs/auto-retry ^2.0.2, zod ^4.3.6 |
| Secondary | @opencode-ai/sdk ^1.1.53, openai ^6.16.0, cheerio, turndown |
| Framework | None (plain Node.js, no NestJS) |
| Build | tsc to dist/, dev via tsx watch |

---

## What It Does

Telegram bot that bridges Telegram messages to Claude Code agent running locally. Supports session resume, streaming responses, voice transcription, TTS, Reddit/Medium/YouTube integrations, MCP tools, and forum topic isolation. Personal single-user (whitelist) tool -- not a multi-tenant service.

---

## Architecture at a Glance

```text
src/
  index.ts               # Entry: Grammy runner, SIGINT/SIGTERM, caffeinate
  config.ts              # Zod-validated env (single source of truth)
  bot/
    bot.ts               # Bot factory: autoRetry, sequentialize, /cancel bypass
    handlers/            # command/message/voice/photo handlers
  claude/
    agent.ts             # SDK query(), streaming loop, watchdog, MCP wiring
    session-manager.ts   # In-memory session state (Map), workdir, claudeSessionId
    session-history.ts   # JSON persistence (~/.claudegram/sessions.json), Zod-validated
    request-queue.ts     # Per-session FIFO queue + AbortController + Query.interrupt()
    agent-watchdog.ts    # setInterval-based liveness monitor
  utils/
    session-key.ts       # chatId or chatId:threadId for forum topics
  telegram/
    message-sender.ts    # Streaming chunks, Telegraph routing, MarkdownV2
```

Concurrency model: @grammyjs/runner processes updates in parallel. sequentialize middleware enforces per-session ordering. /cancel and /ping registered BEFORE sequentialize to bypass the per-chat queue.

---

## Focus Questions (Answered)

### 1. How do they manage Claude sessions? Agent SDK vs CLI subprocess?

**AGENT SDK -- not CLI subprocess.**

agent.ts imports directly from @anthropic-ai/claude-agent-sdk and calls query({ prompt, options }). This is NOT a CLI subprocess. Uses the bundled SDK executable by default (CLAUDE_USE_BUNDLED_EXECUTABLE=true).

Adaptation cost for Orch: HIGH. The entire agent.ts logic -- streaming loop, Query.interrupt(), session resume via session_id -- must be reimplemented using execa spawning claude --resume <sessionId> --output-format stream-json. The watchdog and queue modules are SDK-agnostic and can be ported directly.

One useful data point: CLAUDE_EXECUTABLE_PATH + pathToClaudeCodeExecutable SDK option shows they anticipated custom executable paths. The session_id from SDK result maps directly to claude --resume <id> on the CLI -- same concept, different invocation surface.

### 2. How does request-queue handle concurrent Telegram messages?

request-queue.ts implements a per-session FIFO queue using plain Maps:
- pendingQueues: Map<string, QueuedRequest[]> -- per session key
- processingFlags: Map<string, boolean> -- one active handler at a time per session
- cancelledChats: Set<string> -- soft-cancel flag (set before Query.interrupt())

queueRequest(sessionKey, message, handler) wraps handler in a Promise, pushes to queue, calls processQueue(). processQueue() is a self-recursive drain: shifts next item, awaits handler, resolves/rejects, recurses if queue has more items.

Cancel flow: /cancel calls cancelRequest() -> sets cancelledChats, calls q.interrupt() (never controller.abort() -- that crashes the SDK subprocess). clearQueue() rejects all pending with Queue cleared.

Port decision: Queue module is entirely SDK-agnostic. Replace Query type with ExecaChildProcess. Replace q.interrupt() with process.kill(SIGTERM). Everything else ports verbatim.

### 3. How does agent-watchdog detect stuck sessions?

AgentWatchdog is a plain setInterval timer with two thresholds:
- Soft warning: if sinceLastActivity >= warnAfterMs -> log + onWarning() callback
- Hard timeout: if totalElapsed >= timeoutMs -> onTimeout() callback + stop()

recordActivity() is called from the for-await loop on every SDK message. Configured via env: AGENT_WATCHDOG_ENABLED, AGENT_WATCHDOG_WARN_SECONDS (default 30), AGENT_WATCHDOG_LOG_SECONDS (default 10), AGENT_QUERY_TIMEOUT_MS (default 0 = disabled).

Port decision: BORROW directly. Zero SDK dependencies. Replace controller.abort() in onTimeout with execa process kill. WatchdogOptions interface is reusable as-is.

### 4. Can session-manager adapt to our IAgentRuntime pattern?

SessionManager is a plain class over an in-memory Map<string, Session>. Session has: conversationId, claudeSessionId (SDK session ID = CLI --resume token), workingDirectory, createdAt, lastActivity. Persistence via SessionHistory (JSON file, Zod-validated, atomic writes).

Adaptation for Orch: claudeSessionId is the resume token for claude --resume. setWorkingDirectory() correctly clears claudeSessionId when cwd changes (sessions are cwd-bound -- critical invariant). For IAgentRuntime adapter: SessionManager becomes part of adapter state. spawn() = createSession() + spawn CLI. resume() = resumeSession() + spawn with --resume. terminate() = kill process + clearSession().

---

## What We Borrow

### BORROW-1: request-queue.ts (entire module)
Port verbatim with two substitutions: replace Query type with ExecaChildProcess, replace q.interrupt() with process signal. FIFO queue logic, cancelledChats soft-cancel pattern, clearQueue(), and isProcessing() are directly applicable.
- File ref: src/claude/request-queue.ts, lines 1-179

### BORROW-2: agent-watchdog.ts (entire module)
Zero SDK coupling. WatchdogOptions interface, start/stop/recordActivity/check pattern, and dual soft-warn + hard-timeout model are exactly what Orch needs for stuck subprocess detection.
- File ref: src/claude/agent-watchdog.ts, lines 1-121

### BORROW-3: session-key.ts -- forum topic session isolation
buildSessionKey(chatId, threadId?) yields chatId or chatId:threadId. getSessionKeyFromCtx(ctx) extracts from Grammy context with is_topic_message check. Correct Grammy pattern for forum topic isolation.
- File ref: src/utils/session-key.ts, lines 1-44

### BORROW-4: Grammy sequentialize + /cancel bypass pattern
Register /cancel, /softreset, /ping BEFORE sequentialize middleware. Allows interrupt commands to bypass the per-chat queue. Critical pattern for Orchs Telegram interface.
- File ref: src/bot/bot.ts, lines 149-157

### BORROW-5: config.ts -- Zod env validation pattern
Zod schema with .transform() for type coercion, safeParse, process.exit on failure. Take the pattern not the schema content (ours will differ significantly).
- File ref: src/config.ts, lines 13-232

### BORROW-6: session-history.ts -- atomic JSON persistence + Zod validation
atomicWriteFileSync for crash-safe session persistence. Zod schema on file load (corrupt file -> clean start, no crash). MAX_HISTORY_PER_CHAT = 20 cap and history.unshift() (newest first) are good defaults. Orch uses Prisma but the session data model is a direct LEARN.
- File ref: src/claude/session-history.ts, lines 1-187

### BORROW-7: autoRetry Grammy middleware config
maxRetryAttempts: 5, maxDelaySeconds: 60, rethrowInternalServerErrors: false. The note about 500s default timeout and 60s override is operationally important.
- File ref: src/bot/bot.ts, lines 98-104

---

## What We Skip

### SKIP-1: agent.ts -- entire SDK query loop
The streaming loop (for await), Query lifecycle, setActiveQuery, isCancelled checks, buildMultimodalPrompt, hook registration -- all Agent SDK-specific. Reimplement using execa + --output-format stream-json. Patterns are learnable but code does not port.

### SKIP-2: MCP tools (mcp-tools.ts), Reddit, Medium, Extract integrations
Not in Orchs charter. Domain-specific feature modules.

### SKIP-3: TTS, voice transcription, Telegraph, Terminal UI
Out of scope. Orch is a daemon scheduler, not a content bot.

### SKIP-4: @opencode-ai/sdk provider
Experimental alternative runtime. Orch has IAgentRuntime adapter pattern for this.

### SKIP-5: Conversation history (conversationHistory BoundedMap)
Claudegram accumulates ConversationMessage[] per session in memory. Orch delegates conversation memory to the spawned Claude process (CLI manages its own context).

### SKIP-6: Loop mode (sendLoopToAgent)
Application-level DONE-polling feature. Not a daemon concern.

---

## Stack Compatibility

| Area | Claudegram | Orch target | Compatible? |
|---|---|---|---|
| Telegram | Grammy 1.31 | Grammy (same) | Yes |
| Grammy runner | @grammyjs/runner 2.x | Same | Yes |
| TypeScript | 5.x strict | 5.x strict | Yes |
| Node | >=20 | 20+ | Yes |
| Framework | None (plain) | NestJS | Partial -- patterns adapt, files do not lift |
| Agent runtime | Agent SDK | CLI subprocess (execa) | Incompatible -- adapt only |
| Config | dotenv + Zod | dotenv + Zod or NestJS config | Pattern compatible |
| Persistence | JSON file | Prisma + SQLite | Different -- session schema is LEARN |

---

## License Compatibility

MIT confirmed (package.json + README badge). Compatible with Orchs MIT license. BORROW freely, no attribution constraints beyond standard MIT.

---

## Key Insights

1. SDK vs CLI split is the single biggest divergence. Everything in the claude/ module is designed around the Agent SDK Query object and async iterator. Orch must replace Query with ExecaChildProcess, Query.interrupt() with process signals, and the for-await message loop with line-by-line --output-format stream-json parsing. The surrounding infrastructure (queue, watchdog, session manager) is SDK-agnostic and ports cleanly.

2. Session resume token is identical concept. claudeSessionId (SDK result session_id) is exactly what claude --resume <id> takes on the CLI. The setClaudeSessionId() -> resumeSession() flow is the right model for Orchs adapter resume() method.

3. Cancel-before-sequentialize is a hard pattern, not optional. If /cancel goes through sequentialize it waits behind the running query -- defeating its purpose. Registration order in bot.ts is the correct architecture.

4. Watchdog is pure and small. 121 lines, zero deps beyond agent-timer.ts. Dual-threshold design (soft warn + hard abort) is exactly right for detecting a stuck claude subprocess.

5. resolveWorkingDirectory() handles cross-OS session portability. If Orch runs on multiple machines sharing a session store, this remap logic is needed.

6. Forum topic isolation via session key is clean. chatId:threadId string key unifies DM and topic sessions without special-casing throughout the codebase.

7. No NestJS. Claudegram is plain Node.js. Orchs NestJS structure means we adapt patterns (modules, DI) rather than lifting files. The Grammy bot factory maps naturally to a NestJS provider.

---

## Code Snippets Worth Studying

- src/bot/bot.ts lines 62-71: getSequentializeKey -- Grammy context to session key for middleware
- src/bot/bot.ts lines 149-157: cancel/reset/ping bypass sequentialize -- register order matters
- src/claude/request-queue.ts lines 55-107: queueRequest + processQueue -- self-recursive drain pattern
- src/claude/request-queue.ts lines 110-136: cancelRequest -- soft interrupt, never abort() directly
- src/claude/agent-watchdog.ts lines 40-101: start + check -- dual threshold (warn/timeout) implementation
- src/claude/session-manager.ts lines 9-29: resolveWorkingDirectory -- cross-OS path portability
- src/claude/session-manager.ts lines 75-89: setWorkingDirectory clears claudeSessionId on cwd change
- src/claude/session-history.ts lines 72-78: atomicWriteFileSync + mode 0o600 -- crash-safe persistence
- src/config.ts lines 13-220: full Zod schema with transform -- reference for Orch config schema

---

## Overall Verdict

BORROW (infrastructure modules) + LEARN (agent loop patterns) + SKIP (content integrations).

Queue, watchdog, session key, session manager, Grammy bot setup, and config validation pattern are directly portable or adaptable. The agent runtime itself must be rebuilt for CLI subprocess. Content integrations (Reddit, TTS, etc.) are skip.