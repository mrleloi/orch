# Component Telemetry Rollup — Phase 6

> Generated 2026-04-26T15:22:02.871Z by `scripts/utilities/rollup-telemetry.ts`.
> Source: agent-workspace/memory/component-telemetry.jsonl (2446 lines, 2446 valid events).
> Subagent index: agent-workspace/memory/subagent-index.md (93 rows).

## Components

| Type | Name | Count | Success Rate | p50 Dur (ms) | p99 Dur (ms) | p50 Tokens | p99 Tokens | Top Failure Modes |
|------|------|------:|-------------:|-------------:|-------------:|-----------:|-----------:|-------------------|
| hook | Bash | 978 | 1.000 | 4291 | 118540 | 0 | 11566 |  |
| hook | Read | 740 | 1.000 | 2115 | 24022 | 0 | 7108 |  |
| hook | Edit | 201 | 1.000 | 5364 | 45592 | 0 | 8077 |  |
| hook | Write | 130 | 1.000 | 11485 | 431195 | 0 | 17928 |  |
| hook | Grep | 116 | 1.000 | 2600 | 16824 | 0 | 6411 |  |
| hook | Glob | 102 | 1.000 | 955 | 7347 | 0 | 3704 |  |
| agent | unknown-agent | 70 | 1.000 | 10669 | 190702 | 0 | 5461 |  |
| hook | Agent | 61 | 1.000 | 32522 | 71533 | 0 | 45869 |  |
| hook | TaskUpdate | 29 | 1.000 | 2655 | 22271 | 0 | 3198 |  |
| hook | TaskCreate | 11 | 1.000 | 2267 | 4007 | 0 | 0 |  |
| hook | SessionStart | 4 | 1.000 | 0 | 0 | 2320 | 5225 |  |
| hook | ToolSearch | 2 | 1.000 | 5074 | 5074 | 3573 | 3573 |  |
| skill | research-first | 1 | 1.000 | 0 | 0 | 0 | 0 |  |
| hook | Skill | 1 | 1.000 | 3901318 | 3901318 | 1647 | 1647 |  |

## Subagent Index Summary

| Verdict Class | Count |
|---|---:|
| unknown | 77 |
| ok | 11 |
| ok_with_concerns | 3 |
| rejected | 1 |
| fail | 1 |
