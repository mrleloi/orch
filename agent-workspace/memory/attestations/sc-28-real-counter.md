# SC-28 Real Event-Rate Counter Attestation

**Date**: 2026-04-27
**Runner platform**: win32 (Windows 11 Pro 10.0.26100)
**Task**: 9.6.4
**Status**: PASS

---

## Phase 7 Baseline (superseded)

Phase 7 used an mtime-proxy approach: `file.mtime_delta / event_count`. This was a synthetic measurement — it depended on filesystem timestamps and was not tied to actual in-process event flow. The proxy was noted as insufficient in `phase-7-complete.md §B` (SC-28 gate: "real in-process counter required").

---

## v2.4 Implementation

### New module
`packages/core/src/telemetry/event-rate-counter.ts` — 113 LOC

Exports `EventRateCounter` class with:
- `record()` — O(1) push of `now()` timestamp
- `count()` — lazy eviction of stale entries older than `now() - windowMs`, returns remaining length
- `rate()` — `count() / (windowMs / 1000)` in events-per-second
- `reset()` — clears all state
- Clock injection via `opts.now` for deterministic tests (no `vi.useFakeTimers()` globals)

### Integration in sync-seam.ts
`packages/core/src/telemetry/sync-seam.ts` — edited (+15 LOC, 205 → 220)

Key integration points:
1. `import { EventRateCounter } from './event-rate-counter.js'` at file top
2. `private readonly eventRate: EventRateCounter` field added to `TelemetrySyncSeam`
3. `this.eventRate = new EventRateCounter()` initialized in constructor (after sink resolution)
4. `this.eventRate.record()` called at the TOP of `emit()`, BEFORE the `if (!this.enabled) return` guard
5. `getEventRate(): { count: number; ratePerSec: number }` public accessor added

**Design rationale**: counting BEFORE the disabled guard means SC-28 measures all observed event volume regardless of whether upstream forwarding is active. This matches Decision 031 §"Default OFF / failures non-blocking" — observation is local and free.

---

## Load Fixture Evidence

Command run:
```
pnpm vitest run --config tests/vitest.config.ts tests/telemetry/event-rate-counter.spec.ts --reporter=verbose
```

Integration test output (from `TelemetrySyncSeam — getEventRate() integration (SC-28)` suite):

```
✓ getEventRate().count === 3 after 3 emit() calls
✓ getEventRate().count counts events emitted even when sync is disabled
✓ getEventRate().ratePerSec is non-negative

Test Files  1 passed (1)
      Tests  16 passed (16)
   Duration  330ms
```

The test "getEventRate().count === 3 after 3 emit() calls" directly verifies that after 3 `emit()` calls on a disabled seam, `getEventRate().count === 3` (non-zero). The test "getEventRate().count counts events emitted even when sync is disabled" further confirms the counter accumulates events independent of the enabled state.

For N=3 emits, `getEventRate().ratePerSec = 3 / 60 ≈ 0.05` (non-zero).

---

## Gate Verification

```bash
# grep gate (≥1 match)
grep -c "getEventRate" packages/core/src/telemetry/sync-seam.ts  → 1

# grep gate (≥1 match for EventRateCounter|event-rate-counter)
grep -cE "EventRateCounter|event-rate-counter" packages/core/src/telemetry/sync-seam.ts → 3

# file exists
test -f packages/core/src/telemetry/event-rate-counter.ts  → 0 (exits 0)

# typecheck
pnpm typecheck  → exit 0 (all 5 workspace packages pass)

# lint
pnpm lint  → exit 0 (0 errors; pre-existing web-ui warnings only)

# full vitest suite
pnpm vitest run --config tests/vitest.config.ts
→ 5 failed (pre-existing, unrelated) | 196 passed (was 180, +16 new)
```

---

## SC-28 Verdict

**PASS** — The mtime-proxy measurement is replaced by a deterministic in-process sliding-window counter. The counter:
1. Is wired into `TelemetrySyncSeam.emit()` BEFORE the disabled guard (measures all observed events)
2. Is exposed via `getEventRate()` which returns `{ count: number, ratePerSec: number }`
3. Returns non-zero under synthetic load (confirmed by integration test)
4. Has no impact on `TelemetrySyncOptions`, `TelemetrySink`, or OTEL wire format
5. Has no new env-var control (observational only)
6. 16 unit + integration tests pass; all architect-binding test cases from §B.3.3 are covered
