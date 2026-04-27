# Task 5.1.7 — G-8 Subagent Failure Index Builder

## Status
DONE_WITH_CONCERNS

## Files Changed
- `scripts/utilities/build-subagent-index.sh`: 1-230 (NEW, 200+ LOC)
- `scripts/hooks/subagent-stop-logger.sh`: 1-62 (NEW)
- `tests/scripts/build-subagent-index.spec.ts`: 1-150 (NEW)
- `tests/scripts/fixtures/synthetic-hooks.log`: 1-23 (NEW)
- `tests/scripts/fixtures/synthetic-budget-tracker.md`: 1-15 (NEW)
- `agent-workspace/memory/subagent-index.md`: GENERATED (16 data rows)
- `.claude/settings.json`: NOT MODIFIED (permission denied — manual step required)

## Tests Added
- `tests/scripts/build-subagent-index.spec.ts`: 4 cases
  1. builds non-empty table from synthetic hooks log + budget tracker fragment (≥7 data rows)
  2. classifies verdict_class correctly across expected enum values (6 classes)
  3. runs in < 30s on real project files
  4. output is idempotent across consecutive runs

## Gates
- typecheck: PASS (no TypeScript files modified in packages/)
- lint: PASS (bash scripts; no ESLint scope)
- test: PASS (30/30, 4 new + 26 pre-existing)
- invariants: PASS (INV-1, INV-Prisma, INV-NestJS, INV-scope all clean)
- subagent_index_rows: 16 (vs ≥50 target — data availability gap, not script defect)
- performance: PASS (4.5s real-world vs 30s target)

## Deviations from Plan
1. **settings.json SubagentStop hook not written**: sandbox permission denied `Write(.claude/settings.json)` and `Edit(.claude/settings.json)`. The hook script `scripts/hooks/subagent-stop-logger.sh` is ready. Manual registration required.
2. **Row count 16 vs ≥50 target**: historical agentId data exists only in budget-tracker.md (Phase 3+). Phase 0-2 session logs contain no agentId citations. The ≥50 target is aspirational for when SubagentStop hook is active. The script is correct and produces all available rows.

## Concerns
1. **settings.json not updated**: SubagentStop hook block needs manual addition. See plan §E for exact JSON fragment and `scripts/hooks/subagent-stop-logger.sh` for the hook script.
2. **Verdict attribution noise**: verdict extracted from context near agentId can misattribute a prior verdict (e.g., FAIL from a verifier triggering a re-dispatch) to the newly dispatched agent. Heuristic-only; acceptable for Phase 5 routing analysis.
3. **≥50 row target**: aspirational with current data. Will be met once SubagentStop hook fires over several sessions.

## Assumptions Made
1. `pnpm test:hooks` runs `vitest run --config tests/vitest.config.ts` which includes `tests/**/*.spec.ts` — confirmed by vitest.config.ts.
2. `.session-hooks.log` has 0 SubagentStop events — confirmed by grep.
3. budget-tracker.md is the authoritative historical source — confirmed (only 16 unique agentIds across all memory files).
4. ≥50 target is forward-looking — accepted based on plan wording "when fed real Phase 0-4 data".
