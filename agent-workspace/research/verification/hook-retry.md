# Hook Retry Behavior — Verification Status

**Status**: OPEN — requires live subprocess; test harness returns 500 but no live observation possible in this session.

**SYNTHESIS §6.7 reference**: Drop a fixture test that returns 500 on the receiver during an active session and observe — document whether Claude Code buffers/drops hooks.

---

## What we know (from research)

From Claude-Code-Agent-Monitor.md §1:

> GENERAL HOOK EVENTS: No dedup. Claude Code does not retry hooks on failure.

This finding from the reference repo (Agent-Monitor) is the authoritative data point available in Phase 0 research: **Claude Code does NOT retry hook events on failure**. If the receiver returns 500 (or any non-2xx), the hook is dropped.

---

## Test written

In `packages/core/src/modules/hooks/hooks.controller.spec.ts`, we verify that:
- The controller returns 200 on success (so Claude Code considers the hook delivered)
- The controller returns 500 on domain errors
- The controller does NOT return 409 on duplicate events (returns 200 instead, which is safe for Claude Code's fire-and-forget delivery)

---

## What cannot be observed in this session

A live subprocess test would require:
1. Spawning an actual `claude` CLI process via `ccs`
2. Configuring its hooks to POST to a test server
3. Injecting a 500 response for one event
4. Observing the Claude Code process logs to confirm no retry

This requires an active Claude Code subscription and `ccs` binary present in CI, which is not available in the Phase 1 test environment.

---

## Intent for Task 1.14 E2E

When Task 1.14 E2E testing runs (Phase 1 final integration test):
1. Spin up the Orch daemon on a test port
2. Configure `ORCH_HOOK_SECRET` in the test env
3. Spawn a minimal Claude Code session via `ccs` with hooks configured to point at the test server
4. Intercept one hook event and return 500
5. Observe Claude Code logs: confirm no retry attempt in stderr/stdout
6. Confirm the session continues normally (hook dropped, not retried)

**Expected finding**: Claude Code drops the event (no retry), consistent with Agent-Monitor research. Dedup strategy in HooksService is designed for this (60s sliding window handles rare re-delivery scenarios from upstream load balancers, not from Claude Code itself).

---

## Date recorded: 2026-04-25
## Session: Task 1.10 (Phase 1 Hooks Receiver)
