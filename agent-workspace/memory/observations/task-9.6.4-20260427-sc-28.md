# Task 9.6.4 — SC-28 Real Event-Rate Counter

## Status
DONE

## Files Changed
- packages/core/src/telemetry/event-rate-counter.ts (new, 113 LOC)
- packages/core/src/telemetry/sync-seam.ts (edit, 205→220 LOC, +15)
- packages/core/src/telemetry/sync-seam.spec.ts (edit, +15 LOC, added SC-28 Jest integration test)
- tests/telemetry/event-rate-counter.spec.ts (new, 16 test cases)
- agent-workspace/memory/attestations/sc-28-real-counter.md (new)

## Tests Added
- tests/telemetry/event-rate-counter.spec.ts: 16 cases (Vitest, clock injection)
  - Empty window returns 0 (count, rate)
  - Single record → count() === 1
  - Sliding-window expiry (count returns 0, rate returns 0)
  - Boundary exactness (survives at windowMs-1, evicted at windowMs+1)
  - rate() math (60 events / 60_000 ms → ≈1.0)
  - reset() clears count and rate
  - Idempotency (count/rate stable across multiple calls)
  - TelemetrySyncSeam.getEventRate() integration (3 emits → count === 3)
  - Disabled-seam counting still works
  - ratePerSec non-negative
- packages/core/src/telemetry/sync-seam.spec.ts: +3 cases (Jest)
  - getEventRate().count === 3 after 3 disabled emit() calls
  - typeof result.ratePerSec === 'number'
  - ratePerSec >= 0

## Gates
- typecheck: PASS (pnpm -r run typecheck, all 5 workspace packages)
- lint: PASS (0 errors; pre-existing web-ui warnings unrelated)
- test: PASS (16/16 new Vitest tests; 11/11 Jest sync-seam tests)
- vitest_total: 196 passed / 201 total (5 pre-existing failures, unrelated to this task)
- invariants:
  - domain-pure (no @nestjs imports in event-rate-counter.ts): PASS
  - no env-var added: PASS
  - TelemetrySyncOptions unchanged: PASS (git diff confirms)
  - TelemetrySink unchanged: PASS (git diff confirms)
  - record() before disabled guard: PASS (line 192 in sync-seam.ts)
  - getEventRate() count non-zero under load: PASS (integration test)
  - I-6 zero commits: PASS

## Deviations from Plan
- §B.3.3 references "tests/telemetry/sync-seam.spec.ts (existing file, edit)" — no such file exists at root level. The only sync-seam spec is at packages/core/src/telemetry/sync-seam.spec.ts (Jest). Added the SC-28 integration test there instead. Additionally, all integration tests for TelemetrySyncSeam.getEventRate() are also present in tests/telemetry/event-rate-counter.spec.ts (Test 8), so the B.3.3 contract is fully satisfied by two paths.
- sync-seam.ts LOC ceiling was ≤220; achieved exactly 220 (was predicted ≤220 in §C.1).

## Assumptions Made
- "tests/telemetry/sync-seam.spec.ts" referenced in §B.3.3 is the packages/core Jest spec, since no root-level sync-seam spec exists.
- The "event at t=0 is evicted at windowMs+1" boundary: cutoff = (windowMs+1) - windowMs = 1; t=0 satisfies 0 <= 1 → evicted. This is the correct interpretation of "older than cutoff" (strict: `<= cutoff` is "at or before cutoff").
