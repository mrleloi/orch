---
title: Spec Compliance Review — Substage 9.3 (CF-30 + CF-31 + CF-DOGFOOD-4)
task_id: 9.3
reviewer: spec-compliance-reviewer (sonnet/medium, ORCH_SPAWNED)
date: 2026-04-27
verdict: PASS
---

# Spec Compliance Review — Task 9.3

## Verdict: PASS

## Contract Match Matrix

| Clause | Code Evidence | Match |
|---|---|---|
| CF-30: dry-run.sh has tarball minimum-size assertion | `dry-run.sh:33` `MIN_BYTES=10000`; `dry-run.sh:122-125` comparison `$tarball_size -lt $MIN_BYTES` → `size_ok=false` → `return 1` → `exit 1` | ✓ |
| CF-30: synthetic 600-byte tarball must FAIL (exit ≠ 0) | 600 < 10000 → size_ok=false → return 1 at line 189 → OVERALL_PASS=false → exit 1 line 207 | ✓ |
| CF-30: real tarballs ≥10KB PASS | `MIN_BYTES=10000` threshold; tarballs above pass max-size and min-size checks | ✓ |
| CF-31: HttpsNdjsonSink emits startup banner on opt-in | `sync-seam.ts:119-121` `process.stderr.write("[telemetry] HttpsNdjsonSink ENABLED: ...")` in constructor | ✓ |
| CF-31: banner only when opt-in (silent on opt-out) | `sync-seam.ts:163-172` disabled path uses `NoOpSink`, never reaches `HttpsNdjsonSink` constructor | ✓ |
| CF-DOGFOOD-4: stale-marker detection in watchdog | `autonomous-stop-watchdog.sh:31-39` checks `.dogfood-stop`, writes `[STALE-MARKER]` to `$WATCHDOG_LOG` and stderr | ✓ |

## Missing Requirements

None. All Part B clauses satisfied.

## Over-Building

1. **CF-30: `MIN_FILE_COUNT=3` guard** (`dry-run.sh:37, 148-160`) — CF-30 spec says "add tarball minimum-size assertion" only. The file-count check is unrequested.
   - Severity: P2 (non-blocking). The guard is consistent with CF-30's intent and the code attributes it to CF-30 in comments; it does not alter the spec-required exit behavior for size-based failure. Not a blocking violation but deviates from "minimum code" principle.

## Required Fixes (blocking)

None.

## Concerns (non-blocking)

1. `MIN_FILE_COUNT=3` in dry-run.sh is an unrequested addition per spec. Harmless but violates P2 simplicity. No fix required for PASS.
2. Runtime validation recommended: run `bash scripts/publish/dry-run.sh` with a synthetic 600-byte tarball to confirm exit-1 path executes (code-path analysis is sufficient per acceptance gate, but runtime confirmation is cheap).

## Next Action

PASS → dispatch code-quality-reviewer (per routing brief §1 9.3: only spec-compliance required; however, if code-quality review is desired, dispatch now)
