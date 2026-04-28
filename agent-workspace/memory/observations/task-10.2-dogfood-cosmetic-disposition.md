# Task 10.2 — Cosmetic Dogfood Findings + CF-25 Citation-Linter Dedup

## Status
DONE

## Files Changed
- `scripts/utilities/citation-linter.ts`: +3 lines (WebFetch and TaskList added to BUILTIN_HOOK_EVENTS; comment updated)
- `tests/scripts/citation-linter-rollup.spec.ts`: +33 lines (R7, R8, R9 test cases added)
- `agent-workspace/memory/attestations/cf-dogfood-5-7-elided.md`: NEW — disposition attestation

## Tests Added
- `tests/scripts/citation-linter-rollup.spec.ts`: 3 new cases
  - R7: hook::WebFetch → EXEMPT (not FAIL)
  - R8: hook::TaskList → EXEMPT (not FAIL)
  - R9: Phase 9 rollup smoke (WebFetch + TaskList present) → exit 0

## Gates
- typecheck: PASS
- lint: PASS
- test: PASS (9/9 citation-linter spec; all 6 original + 3 new pass)
- invariants: PASS — citation-linter --phase 9 exits 0 (no FAIL rows for WebFetch or TaskList)

## CF-DOGFOOD-5 and CF-DOGFOOD-7 Disposition

**Verdict: RESOLVED-BY-DOCUMENTATION (DEFER-V2.6)**

Search for concrete descriptions in `sessions/2026-04-27-task-8.5.4-*.md` returned zero results
(files do not exist). All surviving records across phase-8-complete.md, phase-9-complete.md,
phase-9-routing-brief.md, and phase-10-routing-brief.md consistently characterize both CFs as
"minor cosmetic findings". No charter clause violation identified. No escalation triggered.

Full attestation: `agent-workspace/memory/attestations/cf-dogfood-5-7-elided.md`

Pre-authorization chain:
- phase-9-routing-brief.md §7 Q2 (concrete description not found → deferral is correct)
- phase-10-routing-brief.md §7 Q2 (same; defaults to DEFER-V2.6)
- phase-10-routing-brief.md §4 item 4 (pre-authorized DEFER-V2.6 for cosmetic findings)

## CF-25 Citation-Linter Dedup

**Verdict: CLOSED-INLINE**

Root cause: `WebFetch` and `TaskList` are Claude Code built-in tool names that appear in
component-rollup telemetry as `hook` type rows (same as `Bash`, `Read`, `Edit`, etc.). They
were absent from `BUILTIN_HOOK_EVENTS`, causing the rollup-mode linter to emit FAIL when it
could not find `scripts/hooks/WebFetch.sh` or `scripts/hooks/TaskList.sh`.

Fix applied: Added `'WebFetch','TaskList'` to the `BUILTIN_HOOK_EVENTS` set in
`scripts/utilities/citation-linter.ts` with an explanatory comment (CF-25 dedup attribution).
This is consistent with the existing set which already contains `Bash`, `Read`, `Edit`, etc.

Evidence:
- `citation-linter.ts --phase 9` now exits 0 (previously exited 1 with 2 FAIL rows)
- `component-rollup-phase-9.md` rows for WebFetch and TaskList now resolve to EXEMPT
- Tests R7, R8, R9 pin the fix as a regression guard

## Deviations from Plan
- None. Fix B applied as described in the task spec (allowlist augmentation path).
- Fix A followed the pre-authorized RESOLVED-BY-DOCUMENTATION path (description unrecoverable).

## Assumptions Made
1. The category of `hook` type rows in the rollup for `WebFetch` and `TaskList` is correct —
   these are genuine Claude Code tool names appearing in hook events, same class as `Bash`, `Read`.
   The fix is additive (allowlist augmentation), not a category restructure.
2. CF-DOGFOOD-5 and CF-DOGFOOD-7 were truly "minor cosmetic" per all surviving records.
   No escalation to master-planner required given the consistent characterization.
3. The three new test cases (R7, R8, R9) are sufficient regression coverage for CF-25.
   The Phase 9 smoke (R9) is the most valuable since it pins the real-world rollup data.
