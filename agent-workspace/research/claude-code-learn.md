# Research Note: claude-code-learn

> Repo: https://github.com/mrleloi/claude-code-learn
> Version studied: Claude Code v2.1.88 (npm @anthropic-ai/claude-code)
> Clone: C:/htdocs/_research_clones/claude-code-learn
> License: Copyright Anthropic -- educational/research only, NO commercial use, NO code copying
> Date: 2026-04-26

---

## (a) Repo Purpose and Scope

Decompiled TypeScript source from @anthropic-ai/claude-code v2.1.88, unbundled from ~12MB
cli.js using source maps. Five original analysis docs (docs/en/) cover telemetry, hidden
features, remote control, and future roadmap. This is NOT a reference implementation --
it is Anthropic own production source code extracted for research purposes only.

What is present:
- ~1,884 TypeScript source files (~512K lines), minus 108 feature-gated internal modules
- Full task/subagent/swarm infrastructure: Task.ts, AgentTool, InProcessTeammateTask, TmuxBackend
- Hook system: PreToolUse / PostToolUse / SessionStart / Setup / postSampling
- Session storage: JSONL append-only logs, --resume, --continue, --fork-session
- Context compaction: autoCompact, snipCompact, contextCollapse
- Bridge protocol: claude.ai / Remote Control / --rc flag
- Telemetry, permission engine (allow/deny/ask/modify), MCP integration

What is NOT present (dead-code eliminated from npm bundle):
- daemon/, KAIROS assistant mode, coordinator worker, context collapse, REPLTool, SnipTool,
  and ~100 other internal modules. Not recoverable from any published artifact.

LICENSE NOTE: This is Anthropic IP. Orch MUST NOT copy any code verbatim.
Patterns and architectural understanding are fair game. Direct code copying is not.

---

## (b) Key Architectural Insights About Claude Code Internals

### Core Agent Loop (query.ts)

The agent loop is a while(stop_reason === tool_use) loop.
Entry: submitMessage(prompt) -> QueryEngine -> query() -> StreamingToolExecutor -> result.
The loop is pure mechanics. Intelligence lives entirely in the LLM.
This directly confirms Orch principle: daemon is dumb, workers are smart.

### Task Types (src/Task.ts)

Seven task types with ID prefixes:
  local_bash (b)          - shell command, background
  local_agent (a)         - subagent with fresh messages[]
  remote_agent (r)        - bridge to remote Claude Code instance
  in_process_teammate (t) - same-process agent, AsyncLocalStorage isolation
  local_workflow (w)      - workflow script
  monitor_mcp (m)         - MCP monitor
  dream (d)               - background memory consolidation

Status machine: pending -> running -> completed | failed | killed.
isTerminalTaskStatus() guards all state machine transitions.

### Subagent Spawn Modes (AgentTool)

Four modes:
  1. default  - in-process, shared conversation context
  2. fork     - child process, fresh messages[], shared file cache
  3. worktree - isolated git worktree + fork process
  4. remote   - bridge to Claude Code Remote / container

Orch IAgentRuntime adapter covers fork and remote cases well.
in_process_teammate (AsyncLocalStorage isolation) is not in Orch scope
(Orch wraps whole CLI processes, not in-process runs).

### Context Budget Management (services/compact/

Three-layer compression:
  1. autoCompact     - triggers at getAutoCompactThreshold(model); summarizes older
                       messages via Claude API; inserts compact_boundary marker
  2. snipCompact     - removes zombie messages (HISTORY_SNIP flag, not in npm)
  3. contextCollapse - restructures context for efficiency (CONTEXT_COLLAPSE, not in npm)

Threshold: effectiveContextWindow = contextWindow - max(maxOutputTokens, 20_000).
The 20K is reserved for the summary output itself (p99.99 observed at 17,387 tokens).

Claude Code compacts inline inside the same process. Orch approach of writing a checkpoint
and rebooting into a new session is a valid external equivalent -- but sacrifices in-session
conversation history that autoCompact preserves. This is a known Orch trade-off accepted
given the CLI-subprocess constraint. It is not wrong, just different.

### Hook System (src/utils/hooks/

Hook lifecycle:
  PreToolUse    - validate input, approve/deny/modify BEFORE execution
  PostToolUse   - react to result AFTER execution
  SessionStart  - on session open (source: startup|resume|clear|compact)
  Setup         - on init/maintenance
  postSampling  - after each Claude API response

Hook types: shell (execAgentHook), HTTP (execHttpHook), prompt (execPromptHook).
Agent hooks (run a sub-agent) are internal only, not in npm.

Hook result schema (what Claude Code expects back from hook HTTP endpoint):
  decision: approve | deny | modify
  message: optional string to inject into conversation
  additionalContexts: optional list of context strings
  initialUserMessage: optional first user turn injection
  watchPaths: optional file paths to watch

Hook events emitted as push stream: started / progress / response.
ALWAYS_EMITTED_HOOK_EVENTS = [SessionStart, Setup].
Others only emitted when includeHookEvents flag is set.

Orch hooks-receiver is the consumer side. Claude Code fires HTTP POST hooks;
hooks-receiver handles them. The result schema above is what hooks-receiver must
parse and return for the approve/deny/modify gate to function correctly.

### Session Persistence (src/utils/sessionStorage.ts)

Sessions stored as JSONL at ~/.claude/projects/<hash>/sessions/<session-id>.jsonl.
Each entry is a discriminated union: user/assistant/progress/system.

Resume modes: --continue (last session in cwd), --resume <id>, --fork-session.

Write strategy:
  User messages:      blocking await write (crash safety)
  Assistant messages: fire-and-forget with ordering queue (non-blocking)
  Progress:           inline dedup on next query

This explains why Orch PostToolUse hook events may arrive slightly after tool call
completion -- assistant messages are fire-and-forget and flush lazily.

### Swarm / Parallel Multi-Agent (src/utils/swarm/

Architecture:
  Leader Agent
    |-- Teammate A (in-process or tmux pane)
    |-- Teammate B
    +-- Teammate C
  Communication: file-based mailboxes (~/.claude/teams/<team>/<agent>/mailbox.jsonl)
  Task board:    file-based (TaskCreate/Update/Get/List tools)
  Permissions:   bridged from leader UI queue; mailbox fallback for headless

Spawn backends (ITermBackend interface):
  InProcessBackend    - same JS process, AsyncLocalStorage context isolation
  TmuxBackend         - new tmux pane, runs claude CLI subprocess
  PaneBackendExecutor - abstract pane layout management

Tool-level parallelism controlled by isConcurrencySafe() on each tool:
  Concurrent-safe tools: run in parallel via StreamingToolExecutor
  Non-concurrent tools:  run serially with exclusive lock
  Results buffered and yielded in original declaration order

Critical: parallel subagents do NOT share a context window. Each agent has its own
messages[] array. Coordination is via file-based mailbox + task board. Leader context
stays clean because teammates write results to their own session.

### Coordinator Mode (internal, feature-gated, not in npm)

Enables autonomous task-claim loop inside each teammate:
  1. listTasks(taskListId)   - read shared task board
  2. findAvailableTask()     - find pending, unowned, unblocked task (respects blockedBy)
  3. claimTask()             - atomic claim with optimistic concurrency
  4. updateTask(in_progress) - mark claimed
  5. runAgent()              - do the work

Teammates idle-poll task board every 500ms. Send idle-notification via mailbox on
completion so the leader can track state.

### Bridge Layer (src/bridge/

--rc / --remote-control connects Claude Code to claude.ai via HTTP bridge.
bridgeMain.ts spawns claude CLI subprocess, relays messages, JWT authenticates,
handles exponential backoff (2s->2min connection, 500ms->30s generation).
Orch --rc usage maps to this bridge for Remote Control operator visibility.

---

## (c) Mapping to Orch -- What Is Correct, What Is Missing

### What Orch Already Implements Correctly

IAgentRuntime adapter pattern: CC adapters (bridge/fork/tmux) confirm the conceptual interface.
CLI subprocess via execa: CC swarm spawns via getTeammateCommand() -- same pattern.
Hook receiver via HTTP: CC fires HTTP hooks; Orch hooks-receiver is the correct consumer.
EventEmitter2 for cross-module: CC uses internal event bus; Orch events module is aligned.
Context window reboot strategy: CC compaction and Orch reboot are both valid trade-offs.
OTEL tracing via TRACEPARENT env: CC propagates session IDs via env; Orch approach idiomatic.
Project-agnostic core: CC is project-agnostic; Orch profile.yaml mirrors CC settings.json.

### What Is Missing or Potentially Wrong in Orch

1. NO TASK-CLAIM PROTOCOL. Orch queue is daemon-managed FIFO. CC task board supports multiple
   workers atomically claiming tasks. For v2.0, Orch needs claimed_by + claim_expires_at
   columns + a claim-verify SQL transaction, not serial consumption.

2. NO INTER-WORKER COMMUNICATION. Orch has no mailbox or inter-session message channel.
   Workers are fire-and-forget subprocess spawns. In v2.0, parallel workers need IPC.
   SQLite mailbox table is the right fit given existing infrastructure.

3. HOOK RESULT DECISION FIELD POSSIBLY UNHANDLED. The decision: approve|deny|modify field
   is what Claude Code uses to gate or modify tool calls. If Orch ignores this field,
   the PreToolUse contract is silently broken. Needs verification in hooks-receiver module.

4. NO SESSION RESUME VIA --resume FLAG. Orch rebuilds context via HandoffContext files.
   claude_session_id is already in Orch QueueItem schema; passing claude --resume <id>
   preserves full conversation history including tool results.

5. ENV VAR PROPAGATION GAP. CC buildInheritedEnvVars() propagates provider selection,
   proxy config, and config dir env vars to each spawned worker. Orch ClaudeCodeAdapter
   likely misses: CLAUDE_CODE_USE_BEDROCK, CLAUDE_CODE_USE_VERTEX, HTTPS_PROXY, HTTP_PROXY,
   NO_PROXY, CLAUDE_CODE_REMOTE. Correctness issue for multi-provider setups.

6. NO WORKTREE ISOLATION. CC worktree mode gives each parallel worker an isolated git checkout.
   Acceptable for v1 (sequential). Race condition risk in v2.0 same-project parallel mode.

---

## (d) Parallelization Patterns -- Critical for v2.0

### Three Levels of Parallelism in Claude Code

Level 1 -- Within a single API turn (StreamingToolExecutor):
  Concurrent-safe tools run in parallel. Non-concurrent tools run serially.
  Results buffered and yielded in original declaration order.
  Orch relevance: happens inside Claude process; Orch cannot directly control it.

Level 2 -- Across turns via subagents (AgentTool):
  Multiple AgentTool calls in same turn = truly parallel subagents (different processes).
  CC uses TaskCreate to split work, then emits multiple AgentTool calls in one turn.
  Orch relevance: Orch queue is sequential. v2.0 needs concurrent sessions across projects
  AND potentially concurrent sessions on the same project for parallel task segments.

Level 3 -- Persistent teammates (InProcessTeammateTask / TmuxBackend):
  Leader spawns N teammates; they stay alive between tasks.
  Teammates idle-poll mailbox and task board at 500ms; claim and work autonomously.
  No shared memory even for in-process teammates -- AsyncLocalStorage per agent.
  Orch relevance: This is the architecture for Orch v2.0 parallel worker pools.
  Orch could spawn N worker sessions, each polling a SQLite task board with claim semantics.

### File-Based Mailbox Pattern (Core of CC Swarm)

Each message: {from, text, timestamp, color, read: boolean}
Priority: shutdown > team-lead messages > peer messages (FIFO within peer)

Orch SQLite equivalent:
  CREATE TABLE worker_mailbox (id INTEGER PRIMARY KEY, to_worker TEXT, from_worker TEXT,
  message TEXT, read BOOLEAN DEFAULT FALSE, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)

### Task Claim Race Condition (Optimistic Concurrency)

CC: write claim to file, read back to verify ownership; retry if another agent claimed it.
Orch SQLite equivalent (atomic in WAL mode):
  UPDATE queue_item SET status=claimed, claimed_by=worker_id
  WHERE id=target AND status=pending AND claimed_by IS NULL
If 0 rows updated, another worker claimed it first. Move to next task.

### Worktree Isolation for Same-Project Parallel Tasks

CC --git-worktree: each worker gets /project/.git/worktrees/task-N/ as isolated checkout.
Workers merge back via PR or git merge. Eliminates file-edit conflicts.
Orch v2.0 options:
  A: restrict parallel workers to read-only tasks -- simplest path
  B: provision worktrees in ClaudeCodeAdapter.spawn() + pass --allowedDirectories

---

## (e) Top 10 Actionable v2.0 Candidates

P0 = v2.0 MVP, P1 = before GA, P2 = post-GA, P3 = future

1. [P0] Task-claim protocol: add claimed_by + claim_expires_at to QueueItem; atomic SQL
   UPDATE WHERE claimed_by IS NULL; daemon becomes publisher not serial executor.
   Impact: High. Effort: Low. Enables all v2.0 parallel patterns.

2. [P0] Multi-session concurrency: allow N concurrent sessions across different projects;
   add max_concurrent_sessions to profile.yaml; daemon dispatches up to N simultaneously.
   Impact: High. Effort: Low. Immediate multi-project parallelism.

3. [P1] Session resume via --resume flag: claude_session_id is already in QueueItem schema;
   pass claude --resume <id> on retry instead of rebuilding HandoffContext file.
   Impact: High. Effort: Low. Much better context continuity on restart.

4. [P1] Env var propagation audit: compare ClaudeCodeAdapter spawn env against CC
   buildInheritedEnvVars(); add missing BEDROCK/VERTEX/proxy/REMOTE vars.
   Impact: Medium. Effort: Low. Correctness for multi-provider users.

5. [P1] Hook result decision field: verify hooks-receiver parses decision=approve/deny/modify
   and surfaces it to session module for gate enforcement before tool execution.
   Impact: High. Effort: Medium. Silently broken if this field is ignored.

6. [P2] Worker mailbox via SQLite: add worker_mailbox table; workers send completion
   summaries and blockers; daemon injects context mid-session.
   Impact: High. Effort: Medium. Enables coordinator-mode patterns.

7. [P2] Parallel project dispatch dashboard: Web UI N concurrent sessions cards
   with SSE stream from /api/v1/stream. Impact: High. Effort: Medium.

8. [P2] Context budget reporting from worker hooks: PostToolUse hook writes message.usage.*
   to a file Orch reads; tracks real per-worker token consumption.
   Impact: Medium. Effort: Low. Better budget enforcement.

9. [P3] Worktree provisioning in ClaudeCodeAdapter: git worktree add before spawn,
   pass --allowedDirectories to worker, git worktree remove on completion.
   Impact: Medium. Effort: High. Only needed for same-project parallel file-editing tasks.

10. [P3] KAIROS-style heartbeat: if worker idle > N minutes, inject continuation prompt.
    Prevents stall on rate-limit pauses. Impact: Medium. Effort: Medium.

---

## License Compatibility

NOT compatible for code copying. All source is Anthropic IP, copyright Anthropic.
Repo author explicitly prohibits commercial use. Orch is potentially commercial,
so zero code may be copied verbatim.
Acceptable: architectural understanding, pattern inspiration, design decisions.
Not acceptable: copying TypeScript classes, function signatures, or prompt templates.

---

## Summary

Overall verdict: LEARN (no borrowing, study only)
Top borrow pattern: Task-claim optimistic concurrency via SQL UPDATE WHERE claimed_by IS NULL
Top learn pattern: File-based mailbox for inter-agent IPC (adapt to SQLite worker_mailbox)
Top skip: 108 internal modules (not recoverable, not needed by Orch)
Parallelism readiness: Orch is approximately 60 pct ready for v2.0; missing task-claim + multi-session + IPC
Biggest gap vs CC: No inter-worker communication; sequential queue only
Tokens spent: approx 22K estimated

RESEARCH-SCANNER-DONE: claude-code-learn