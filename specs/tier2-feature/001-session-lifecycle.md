---
spec_id: SPEC-2026-04-24-T2-001
tier: 2
status: approved
version: 1.0
created: 2026-04-24
related_specs: [SPEC-2026-04-24-T1-001]
---

# SPEC T2-001: Session Lifecycle

# PART A — BUSINESS SPECIFICATION

## A.1 Context

A session is one invocation of Claude Code on a managed project. It processes one queue item (typically a session plan file). Its lifecycle spans: picked from queue → spawned → running → ended → result persisted.

## A.2 User Story

As a human operator, I drop a plan file into `session-plans/pending/`. I expect Orch to pick it up, run the session, handle any rate-limits or context-fulls gracefully, and leave me a record of what happened — without my involvement unless something unusual occurs.

## A.3 Happy Path

1. Plan file appears in watched folder
2. QueueService enqueues it, emits `queue.itemEnqueued`
3. SessionController (listener) checks: is project idle? if yes, spawn
4. ProjectRegistry resolves ccs profile + runtime for project
5. ClaudeCodeAdapter spawns `ccs <profile> -p "<handoff+plan>"` in project cwd
6. SessionStart hook fires from Claude Code, hits POST /hooks/session-start
7. State: STARTING → RUNNING
8. Claude Code runs the plan (Orch observes via OTEL traces)
9. SessionEnd hook fires, hits POST /hooks/session-end
10. State: RUNNING → ENDING
11. Adapter detects process exit, collects final state (tokens, git diff)
12. State: ENDING → COMPLETED
13. Queue item marked complete, next item picked

## A.4 Edge Cases (all must be handled)

- **EC-1**: Process exits with error code. → FAILED
- **EC-2**: ccs reports all accounts exhausted. → RATE_LIMITED, queue paused for project
- **EC-3**: OTEL reports tokens > threshold mid-run. → CONTEXT_FULL, graceful end + handoff
- **EC-4**: SessionEnd hook never fires (crash, SIGKILL). → Watchdog detects after 30min idle, marks FAILED
- **EC-5**: Plan file deleted after enqueue but before spawn. → Skip, mark CANCELLED
- **EC-6**: User hits `/stop` mid-run. → Terminate via SIGTERM → SIGKILL, mark CANCELLED
- **EC-7**: Two plans dropped rapidly. → Queue serialized per project, second waits
- **EC-8**: Daemon restarts with RUNNING session in DB. → Mark INTERRUPTED, do not resume automatically
- **EC-9**: Spawn succeeds but hook callback unreachable (port wrong). → Log error, terminate via watchdog

---

# PART B — AGENT CONTRACT

## B.1 Input Contract

```typescript
interface SpawnRequest {
  projectId: string;
  queueItemId: string;
  planPath: string; // absolute path in project
  sessionType: SessionType; // from plan frontmatter
  ccsProfile?: string; // override, else project default
  handoffContext?: string; // from previous session, via HandoffBuilder
  tracingContext: { traceparent: string };
}
```

## B.2 Output Contract

```typescript
interface SpawnResult {
  sessionId: string; // from ccs/claude output
  startedAt: Date;
  pid: number;
  state: 'STARTING';
}

interface SessionEndEvent {
  sessionId: string;
  endedAt: Date;
  state: 'COMPLETED' | 'FAILED' | 'RATE_LIMITED' | 'CONTEXT_FULL' | 'CANCELLED' | 'INTERRUPTED';
  reason: string; // human-readable
  exitCode: number | null;
  tokensUsed: number;
  filesChanged: string[]; // git diff --name-only
  errorDetails?: { code: string; message: string; stack?: string };
}
```

## B.3 State Machine

```
Event types:
- SPAWN_REQUESTED
- SPAWN_SUCCEEDED (with pid, sessionId)
- SPAWN_FAILED (with error)
- HOOK_SESSION_START (from Claude Code)
- HOOK_SESSION_END (from Claude Code)
- HOOK_STOP (from Claude Code)
- PROCESS_EXITED (with code)
- WATCHDOG_TIMEOUT
- USER_STOP_REQUESTED
- CONTEXT_FULL_DETECTED (from OTEL span)
- RATE_LIMIT_DETECTED (from ccs output)

Transitions: (state, event) → newState
```

Full transition table in `packages/core/src/domain/state-machine.ts`. Every transition:
- Updates SQLite in single transaction
- Emits domain event on EventBus
- Writes OTEL span event
- Logs structured line

## B.4 Process Management

Spawn via `execa`:
```typescript
const child = execa('ccs', [profile, '-p', prompt], {
  cwd: project.path,
  env: {
    ...process.env,
    TRACEPARENT: tracingContext.traceparent,
    CLAUDE_PROJECT_DIR: project.path,
    // Strip CLAUDECODE env var to avoid nested session guard
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
```

Capture stdout/stderr to rolling buffer (last 500 lines per session) for tail command.

## B.5 Watchdog

Per session, a timer. Reset on any hook event. If no event in `watchdog_timeout_seconds` (default 1800 = 30 min):
- Mark state WATCHDOG_TRIGGERED (intermediate)
- SIGTERM, wait 30s
- SIGKILL
- Mark FAILED, reason=WATCHDOG_TIMEOUT

## B.6 Hook Deduplication

Hook events keyed by `(sessionId, hookType, timestamp)`. Ignore duplicates within 60s window.

## B.7 Clean Shutdown

On SIGTERM to daemon:
- Stop accepting new queue items
- For each RUNNING session: mark INTERRUPTED in DB, send SIGTERM to child
- Wait up to 30s for children to exit
- After 30s, SIGKILL remaining
- Close DB, flush OTEL
- Exit 0

## B.8 Persistence Rules

Session row created at STARTING. Updated at each state transition. NEVER deleted. Foreign key to Project and QueueItem.

Indexed by: `(project_id, started_at DESC)`, `(state)`, `(claude_session_id)`.

## B.9 Tests Required

- Unit: every state transition in isolation
- Unit: watchdog timer
- Unit: hook dedup logic
- Integration: full lifecycle with mock adapter
- Integration: rate limit path
- Integration: context-full path
- Integration: crash recovery (restart with RUNNING session)
- Integration: concurrent sessions across projects (isolation)

## B.10 Verification Criteria

A successful implementation of SPEC T2-001 satisfies all of:
- Charter F2 (hook events update state)
- Charter F3 (rate limit failover)
- Charter F4 (context full → handoff)
- Charter N3 (no state corruption on crash)
- Invariant I-8 (idempotent hooks)
- Invariant I-11 (no silent transitions)
- Invariant I-12 (adapter errors wrapped)
