# Component Telemetry Rollup — Phase 9

> Generated 2026-04-27T16:36:17.910Z by `scripts/utilities/rollup-telemetry.ts`.
> Source: agent-workspace/memory/component-telemetry.jsonl (6652 lines, 6652 valid events).
> Subagent index: agent-workspace/memory/subagent-index.md (228 rows).

## Components

| Type | Name | Count | Success Rate | p50 Dur (ms) | p99 Dur (ms) | p50 Tokens | p99 Tokens | Top Failure Modes |
|------|------|------:|-------------:|-------------:|-------------:|-----------:|-----------:|-------------------|
| hook | Bash | 2720 | 1.000 | 4198 | 153035 | 0 | 5938 | A:13 |
| hook | Read | 2048 | 1.000 | 2000 | 17909 | 0 | 8842 | A:5 |
| hook | Edit | 502 | 1.000 | 5009 | 48894 | 0 | 10587 | A:8 |
| hook | Write | 314 | 1.000 | 17069 | 447617 | 0 | 14548 | A:2 |
| hook | Glob | 311 | 1.000 | 815 | 8992 | 0 | 5098 |  |
| hook | Grep | 294 | 1.000 | 1440 | 16989 | 0 | 6418 |  |
| agent | unknown-agent | 165 | 1.000 | 12639 | 193909 | 0 | 4115 | A:1 |
| hook | Agent | 151 | 1.000 | 40303 | 233701 | 1257 | 22994 |  |
| hook | TaskUpdate | 80 | 1.000 | 851 | 27943 | 0 | 11251 |  |
| hook | TaskCreate | 40 | 1.000 | 2327 | 11984 | 0 | 4996 |  |
| hook | SessionStart | 14 | 1.000 | 0 | 632 | 0 | 5225 |  |
| hook | ToolSearch | 6 | 1.000 | 5074 | 18850 | 0 | 3573 |  |
| hook | WebFetch | 3 | 1.000 | 1591 | 8423 | 0 | 0 |  |
| hook | TaskList | 2 | 1.000 | 3445 | 3445 | 1382 | 1382 |  |
| skill | research-first | 1 | 1.000 | 0 | 0 | 0 | 0 |  |
| hook | Skill | 1 | 1.000 | 3901318 | 3901318 | 1647 | 1647 |  |

## Subagent Index Summary

| Verdict Class | Count |
|---|---:|
| unknown | 212 |
| ok | 11 |
| ok_with_concerns | 3 |
| rejected | 1 |
| fail | 1 |
