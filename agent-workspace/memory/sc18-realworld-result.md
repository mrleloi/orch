# SC-18 Real-World Verification — Phase 6 Production Telemetry Replay

> Generated 2026-04-27T08:07:55.872Z by `scripts/benchmarks/sc18-realworld.ts`.
> Method: Decision 019 (production-telemetry replay).
> Threshold: ≥35% improvement on ≥2 of 3 substages (Phase 5 retrospective §3.5 band).
> Sessions scanned: 17.

## Headline

**SC-27 verdict**: FAIL

(0 of 3 substages met ≥35% threshold.)

## Per-Substage Results

| Substage | Task Count | Wallclock Actual (ms) | Wallclock Serial Baseline (ms) | Improvement | Threshold (≥35%) |
|----------|-----------:|----------------------:|-------------------------------:|------------:|------------------|
| 6.1      |          5 |               2539803 |                        2760025 |        8.0% | FAIL             |
| 6.2      |          5 |               1671453 |                        1686860 |        0.9% | FAIL             |
| 6.3      |          7 |               4231104 |                        4247740 |        0.4% | FAIL             |

## Methodology

Per Decision 019: substage attribution is derived from session-log filenames
(`2026-04-27-task-6.<S>.<N>-*.md`); per-task `finishTs` is the file's filesystem
mtime; `wallclock_actual` = max(finishTs) − min(finishTs) within substage;
`wallclock_serial_baseline` = sum of consecutive-task-gap durations (first task's gap
defaulted to second-task gap per the architect doc §2 Q4 convention).

Single-task substages return `improvementRatio = 0` (cannot parallelize one task).
`task_id: null` in raw component-telemetry.jsonl precludes direct telemetry-grouping;
session-log mtime is the SC-27 evidence proxy.