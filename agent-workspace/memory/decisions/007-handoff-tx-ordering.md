# Decision 007 — HandoffContext Transaction Ordering (CRITICAL-5 Path B)

**Date**: 2026-04-26
**Author**: sandwich-dev narrow-fix cycle (Task 3.6 second pass)
**Status**: ACTIVE — overrides plan §3.6 risk note

---

## Plan §3.6 Risk Note (overridden)

> "same `prisma.$transaction` block wraps both [session-end commit + handoff persistence];
> failure rolls back to FAILED reason rather than half-state."

---

## Why Path A (same transaction) is architecturally impossible

The session-end commit is performed inside `SessionManager._handleGracefulEnd()` and
`_handleSessionError()`. Both methods emit `session.ended` **after** the Prisma transaction
for the session-end state change commits and returns. This is correct event-driven design:
the event cannot fire until the state it announces is durably committed.

By the time `HandoffOrchestratorService._handleContextFullEnd()` receives the `session.ended`
event, the `Session` row is already committed. A shared `$transaction` across the two
operations would require either:

1. Passing a transaction context via the event payload (breaks event-driven decoupling)
2. Wrapping both commits in a distributed/nested transaction (Prisma + SQLite do not support
   real distributed transactions; nested `$transaction` would operate on the outer tx scope)
3. Moving handoff persistence INTO `SessionManager` (violates module boundary)

All three options create coupling that contradicts the architecture invariants (cross-module
isolation via events, not direct service calls).

---

## Chosen approach: two atomic transactions, FK constraint as safety net

1. **Transaction 1 (already committed)**: `SessionManager` commits `Session.state = CONTEXT_FULL`.
2. **Transaction 2 (HandoffOrchestratorService)**: Creates `HandoffContext` row linked to
   the committed `Session.id` via FK `fromSessionId`.

The FK constraint on `HandoffContext.fromSessionId` guarantees that Transaction 2 cannot
succeed unless the Session row exists. Since Transaction 1 already committed before the
event fires, the FK resolves deterministically.

---

## Half-state risk and recovery path

**Risk**: Transaction 1 succeeds (session is CONTEXT_FULL) but Transaction 2 fails (DB lock,
schema issue, OOM). The session is in CONTEXT_FULL state with no HandoffContext row.

**Mitigations**:

1. `HandoffOrchestratorService._handleContextFullEnd()` logs an ERROR-level structured log
   entry with `msg: 'handoff-orchestrator:build-or-persist-failed'` and the session ID.
   The OTEL span is marked with `status: error` and `handoff.error` attribute.

2. An operator monitoring the structured log or OTEL traces will see the alert immediately.

3. **Manual recovery path**: Operator re-triggers handoff via the handoff API endpoint
   (Task 3.7+) with the session ID. The HandoffOrchestratorService can be called directly
   with the session ID to rebuild and persist the HandoffContext.

4. The `Session` row remains in CONTEXT_FULL state with no linked HandoffContext — this is
   a visible, queryable state. A future daemon-restart recovery sweep (Task 3.7+) can
   query `Session WHERE state='CONTEXT_FULL' AND NOT EXISTS (HandoffContext WHERE fromSessionId=id)`
   and trigger recovery.

**Severity**: Low. The session's work is not lost — only the handoff metadata failed to
persist. The operator can resume manually with a fresh prompt. Token cost: one successor
session prompt without handoff context (manual recovery is equivalent to a cold start).

---

## Test coverage for this decision

- `T-ORCH-7` in `handoff-orchestrator.service.spec.ts` covers `prisma.$transaction` failure:
  asserts no handoffPrepared/handoffApplied is emitted and no crash occurs.
- `MAJOR-1` test (`T-ORCH-7-ROLLBACK`) asserts span error attributes are recorded on the
  rollback span (verifying the alert path fires via OTEL).

---

## References

- Plan §3.6 lines 180-194 (original risk note)
- Session 20 (2026-04-26): prior implementer chose same design; this decision formalises it
- Invariants: I-11 (no silent state transitions), I-12 (adapter failure isolation)
