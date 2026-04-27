# Task 5.2.8.11 — grammy-bot sibling self-test

## Status
DONE

## Files Changed
- .claude/skills/grammy-bot/grammy-bot.test.md (lines 1-43, new file)

## Tests Added
- N/A — this task creates a markdown test contract file, not a vitest spec

## Gates
- typecheck: PASS (no TypeScript files modified)
- lint: PASS (no TypeScript files modified)
- test: PASS — validator exits 0, no `test-missing-section` or `test-too-few-assertions` errors for grammy-bot
- invariants: PASS
  - INV-S6: no git commit invoked
  - INV-S8: only one new file written (.claude/skills/grammy-bot/grammy-bot.test.md), no agents/ edits
  - File ≤80 lines: 43 lines (PASS)
  - 5 H2 sections present: 5 (PASS)
  - ≥3 numbered assertions: 3 (PASS)
  - ≥3 named failure modes: 4 (F1-F4) (PASS)
  - No YAML frontmatter (PASS)
  - ASCII-only content (PASS)

## Deviations from Plan
none

## Assumptions Made
- The awk assertion-count command in the verification brief (`awk '/^## Assertions/,/^## /'`) returns 0 when Assertions is the last section (no trailing H2 to close the range). This is a known awk behavior for last-section ranges, not a content defect. Verified assertions exist via `grep -cE "^[0-9]+\."` which returned 3. The validator's own `validateSiblingTestMd` also confirmed 0 errors (no `test-too-few-assertions`).
- F4 (bonus) from task table included as a 4th failure mode — plan says "≥3" so 4 is compliant and adds coverage.
