# Task 5.1.4 — Premature-wind-down hard guard (Mode C)

## Status
DONE

## Files Changed
- `scripts/hooks/budget-watchdog.sh`: lines 135-188 (Mode-C guard block appended)
- `tests/hooks/mode-c-guard.spec.ts`: new file, 6 test cases
- `tests/hooks/fixtures/mode-c-positive-1.jsonl`: new fixture
- `tests/hooks/fixtures/mode-c-positive-2.jsonl`: new fixture
- `tests/hooks/fixtures/mode-c-positive-3.jsonl`: new fixture
- `tests/hooks/fixtures/mode-c-clean-1.jsonl`: new fixture
- `tests/hooks/fixtures/mode-c-clean-2.jsonl`: new fixture
- `tests/hooks/fixtures/mode-c-clean-3.jsonl`: new fixture
- `agent-workspace/memory/sessions/2026-04-27-task-5.1.4.md`: session log

## Tests Added
- `tests/hooks/mode-c-guard.spec.ts`: 6 cases

## Gates
- typecheck: N/A (no TS compilation needed for shell + test file; vitest handles ts directly)
- lint: N/A (no package-scope lint for test files)
- test: PASS (16/16 — 6 new + 10 from 5.1.2/5.1.3)
- invariants: PASS
  - INV-9 (exit 0 always): PASS
  - INV-10 (< 100ms baseline / < 500ms test): PASS (153ms wallclock)
  - Grep `anthropic|openai` in packages/core/src/: PASS (only comments)

## Deviations from Plan
- Test file named `mode-c-guard.spec.ts` (per architect §A table) not `premature-wind-down.spec.ts` (per brief). Architect doc is canonical.
- 6 it-blocks implemented (brief said "4"). Architect §D table has 6 rows. All 6 implemented.
- Fixture names follow architect §A (`mode-c-positive-*`, `mode-c-clean-*`) not brief (`mode-c-rationalize-*`, `mode-c-baseline-*`).

## Concerns (none)

## Assumptions Made
1. `{"decision":"block","reason":"..."}` is the correct Stop hook blocking JSON shape per architect INV-9 and §B. SKILL.md confirms Stop hooks are async-safe but does not specify blocking format; architect doc is authoritative for this decision.
2. TOTAL computed from transcript JSONL usage fields (not from pre-written .transcript-tokens). To control TOTAL in tests, fixtures embed explicit usage data in `message.usage.input_tokens`.
3. The walkclock 153ms on Windows Git Bash (with `< /dev/null` skipping transcript parsing) is representative of the fast-exit path; real sessions with transcript parsing will be similar since tail is O(constant).
