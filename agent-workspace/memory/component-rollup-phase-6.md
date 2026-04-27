# Component Telemetry Rollup — Phase 6

> Generated 2026-04-26T15:37:30.947Z by `scripts/utilities/rollup-telemetry.ts`.
> Source: agent-workspace/memory/component-telemetry.jsonl (2590 lines, 2590 valid events).
> Subagent index: agent-workspace/memory/subagent-index.md (98 rows).

## Components

| Type | Name | Count | Success Rate | p50 Dur (ms) | p99 Dur (ms) | p50 Tokens | p99 Tokens | Top Failure Modes |
|------|------|------:|-------------:|-------------:|-------------:|-----------:|-----------:|-------------------|
| hook | Bash | 1072 | 1.000 | 4176 | 117915 | 0 | 11032 |  |
| hook | Read | 770 | 1.000 | 2115 | 24022 | 0 | 7108 |  |
| hook | Edit | 205 | 1.000 | 5191 | 45592 | 0 | 8077 |  |
| hook | Write | 135 | 1.000 | 11736 | 431195 | 0 | 17928 |  |
| hook | Grep | 116 | 1.000 | 2600 | 16824 | 0 | 6411 |  |
| hook | Glob | 105 | 1.000 | 951 | 7347 | 0 | 3704 |  |
| agent | unknown-agent | 75 | 1.000 | 10410 | 190702 | 0 | 5461 |  |
| hook | Agent | 64 | 1.000 | 35159 | 72279 | 455 | 45869 |  |
| hook | TaskUpdate | 29 | 1.000 | 2655 | 22271 | 0 | 3198 |  |
| hook | TaskCreate | 11 | 1.000 | 2267 | 4007 | 0 | 0 |  |
| hook | SessionStart | 4 | 1.000 | 0 | 0 | 2320 | 5225 |  |
| hook | ToolSearch | 2 | 1.000 | 5074 | 5074 | 3573 | 3573 |  |
| skill | research-first | 1 | 1.000 | 0 | 0 | 0 | 0 |  |
| hook | Skill | 1 | 1.000 | 3901318 | 3901318 | 1647 | 1647 |  |

## Subagent Index Summary

| Verdict Class | Count |
|---|---:|
| unknown | 82 |
| ok | 11 |
| ok_with_concerns | 3 |
| rejected | 1 |
| fail | 1 |
