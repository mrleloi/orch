# Phase 3 — Intelligence Layer

> **Session type**: Mix of FOCUSED_IMPL, MULTI_TASK_IMPL, VERIFY
> **Goal**: Make the orchestrator *smart about sessions* — handoff context builder, context-full detection, budget enforcement, session-type-aware dispatch.
> **Estimated duration**: 2-3 autonomous days
> **Pre-requisite**: Phase 2 complete

---

## Phase Goal (Success Criteria)

- [ ] Context-full detection: when OTEL span reports tokens > `force_handoff_at_tokens` (from profile), Orch gracefully ends current session and spawns next with handoff context
- [ ] Handoff context builder produces a coherent next-session prompt based on: previous session log, diff of files changed, pending tasks in plan
- [ ] Budget enforcer: per-session cap, daily cap, per-project cap. Hit cap → pause queue, notify, do not spawn more
- [ ] Session-type enforcer: refuse to spawn a session type violating project's constitution (e.g., stockforge's "never mix PLAN + IMPL")
- [ ] Rate limit detection: beyond ccs auto-failover, detect "all accounts exhausted" condition and pause until reset
- [ ] Decisions all trace-logged for debuggability
- [ ] No LLM calls in daemon state machine (Invariant I-1 holds)

---

## Task Breakdown

### Task 3.1: Context-Full Detector (FOCUSED_IMPL)
**Budget**: 100K

- Subscribe to OTEL spans for active session (via OTLP receiver endpoint or Langfuse API polling — decide based on Phase 0 findings)
- Extract `gen_ai.usage.input_tokens` attribute from `claude_code.interaction` spans
- Accumulate per-session total
- When > `warn_at_tokens`: emit `session.contextNearLimit` event
- When > `force_handoff_at_tokens`: trigger graceful end
- Tests with mock OTEL span stream

### Task 3.2: Graceful Session End (FOCUSED_IMPL)
**Budget**: 80K

- Before killing process: if session supports it, send instruction via stdin/followup to run `/session-end` slash command (project-specific, from profile)
- Wait up to N seconds for hook confirmation
- If no hook fired: SIGTERM, wait, SIGKILL
- Update state machine with reason = CONTEXT_FULL
- Emit events

### Task 3.3: Handoff Context Builder (MULTI_TASK_IMPL)
**Budget**: 150K

The most nuanced module. Deterministic, no LLM calls.

Inputs:
- Previous session log (from `agent-workspace/memory/sessions/` of managed project, path from profile)
- Git diff stats (files changed since previous session)
- Pending tasks from plan file
- Recent decisions

Output: structured handoff prompt (plain text) to inject as initial user message of next session:

```
# Session handoff

Previous session: <log-path>
Completed last session:
- <parsed from log>

Pending (from plan <path>):
- <parsed from plan>

Files changed (staged):
- <from git diff --stat>

Continue from: <extracted "Next Session Pickup" section>
Apply /session-start protocol on arrival.
```

Parser: robust to log format drift (project logs are human-authored markdown).

Tests: golden file tests with real stockforge session logs as fixtures.

### Task 3.4: Budget Enforcer (FOCUSED_IMPL)
**Budget**: 80K

- Read `budget` block from each profile
- Track tokens per project per day in SQLite (aggregate from session traces)
- On `session.tokensUpdated` event, check if daily cap breached
- On breach:
  - Pause project's queue
  - Emit `budget.exceeded` event (Telegram notification)
  - Disallow new session spawns until reset time
- Reset: daily at midnight (project's timezone or UTC default)
- Tests: cap enforcement, reset, multi-project isolation

### Task 3.5: Session-Type Enforcer (FOCUSED_IMPL)
**Budget**: 60K

- Each queue item has a `session_type` frontmatter field (e.g., `PLAN`, `FOCUSED_IMPL`)
- Each project's profile declares `session_types` with rules like `no_mix: [[PLAN, FOCUSED_IMPL]]`
- Before spawning: check that current state doesn't violate rules
- Refuse spawn + mark queue item `blocked` with reason
- Tests

### Task 3.6: Cross-Account Rate Limit Handling (FOCUSED_IMPL)
**Budget**: 80K

- Detect rate limit from `ccs` output (exit code + stderr patterns — documented from Phase 0)
- Discover: ccs has auto-failover — detect when it's switched (stderr parsing or ccs CLI status command)
- Track which accounts are currently exhausted
- When all exhausted: set project state `RATE_LIMITED_GLOBAL`, pause queue, notify
- Poll for reset via ccs quota API (if available) or time-based heuristic (weekly reset schedule)
- Resume queue when any account recovers

### Task 3.7: Decision Audit Trail (FOCUSED_IMPL)
**Budget**: 50K

Every automated decision in Phase 3 writes to `Decision` table:
- "Forced handoff because tokens=231842 > 230000"
- "Refused spawn: session_type PLAN + current_session_type FOCUSED_IMPL violates no_mix rule"
- "Paused project: daily budget 5000000 reached"

API endpoint + Web UI view for browsing decisions.

### Task 3.8: Project-Specific Slash Commands Awareness (FOCUSED_IMPL)
**Budget**: 60K

- Profile can declare command names for graceful actions:
  ```yaml
  commands:
    session_end: "/session-end"
    session_start: "/session-start"
  ```
- Handoff builder uses these when composing injections

### Task 3.9: Phase 3 Integration Test (VERIFY)
**Budget**: 80K

End-to-end test:
1. Start daemon with low token threshold (e.g., 1000)
2. Spawn mock session that quickly reports 1500 tokens via mock span
3. Assert: graceful handoff triggered
4. Handoff session spawns with correctly composed prompt
5. Daily budget test: set cap 2000, trigger 3 sessions of 1000 each → third blocked
6. Session-type enforcement test

### Task 3.10: Verification Gate (VERIFY)
**Budget**: 60K

Fresh verifier subagent. Focus on Invariant I-1 (no LLM in daemon), I-11 (no silent transitions), I-15 (token instrumentation).

### Task 3.11: Phase 3 Complete (housekeeping)
**Budget**: 10K

---

## Risks

- **Risk**: OTEL span stream timing — attributes may arrive after session ended. Mitigation: buffer + reconcile; use Langfuse API as fallback.
- **Risk**: Handoff prompt bloats over iterations (log of log of log). Mitigation: hard cap on handoff size (~5000 tokens), aggressive truncation of ancient history.
- **Risk**: Project's session-end command varies. Mitigation: profile-declared, defaulted to null (no injection, just SIGTERM).

---

## Out of Scope for Phase 3

- LLM-based summary in handoff (v2 — for now, deterministic parsing only per Invariant I-1)
- Cross-project dependency management (future)
- Learned priority / RL-based scheduling (out of scope forever per Charter Principle 10)

---

## Charter Alignment Check

Phase 3 is where the temptation to "add intelligence via LLM" is highest. Charter principles 1 (daemon-dumb), 3 (project-agnostic), 10 (no feature creep into agent intelligence) all apply. If you catch yourself wanting to "just ask Claude to summarize the log", STOP. That goes in the project's own subagents, not in Orch.
