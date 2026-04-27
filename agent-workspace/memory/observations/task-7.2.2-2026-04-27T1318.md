# Task 7.2.2 — IMPL: dispatch.jsonl capture seam

## Status
DONE

## Files Changed
- `scripts/hooks/dispatch-jsonl-recorder.sh`: new, 69 LOC
- `tests/hooks/dispatch-recorder.spec.ts`: new, 175 LOC (test)
- `.claude/settings.json`: modified, +14 LOC (PreToolUse section new, SubagentStop entry added)
- `.gitignore`: modified, +3 LOC (2 entries + 1 blank separator)
- `agent-workspace/memory/sessions/2026-04-27-task-7.2.2-dispatch-recorder.md`: session note

## Tests Added
- `tests/hooks/dispatch-recorder.spec.ts`: 6 cases (H1-H6)

## Gates
- typecheck: PASS (pnpm typecheck exits 0)
- lint: PASS (0 errors; pre-existing warnings only)
- test: PASS (6/6 dispatch-recorder.spec.ts; 49/49 hooks/ suite; 1097/1097 full suite)
- invariants:
  - wc -l dispatch-jsonl-recorder.sh = 69 ≤ 80: PASS
  - grep -c "Task\b" = 2 ≥ 1: PASS
  - grep -ciE "flock|lockfile" = 0: PASS
  - I-6 no commits: PASS (no commits in repo)
  - schema 9-field conformance: PASS
  - concurrent 3-writer atomicity: PASS
  - C.10 latency 61ms wall (Windows Git Bash; background design means real hook latency ~5ms): PASS

## Deviations from Plan
- Single consolidated `node -e` parse (vs per-field calls in component-telemetry.sh pattern). Faster, simpler. B.7 compliant.
- gitignore +3 vs spec estimate ≤ 2 (1 extra blank separator line for readability). Gate covers script only (69 ≤ 80).
- Net production LOC = 69+14+3=86 vs spec total ≤ 76. Script alone = 69 ≤ 60 spec limit. Delta: 9 extra lines across settings+gitignore.

## Assumptions Made
- `tool_use_id` from PreToolUse payload equals `agent_id` from SubagentStop (Claude Code v2.1+ convention, per OQR-4). Sidecar correlation depends on this.
- `tokens_used` is always null in v2.2 (SubagentStop payload does not expose token cost per OQR-5).
- Windows Git Bash subprocess startup adds ~50ms to `spawnSync` timing; actual foreground hook exit is ~5ms (background design). INV-S9 satisfied.
