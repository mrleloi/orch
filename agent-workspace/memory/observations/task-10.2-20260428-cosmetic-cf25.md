# Task 10.2 — Cosmetic CFs + CF-25 Citation-Linter Dedup

## Status
DONE

## Files Changed
- `scripts/utilities/citation-linter.ts`: lines 9-13 (comment + WebFetch/TaskList added to BUILTIN_HOOK_EVENTS)
- `tests/scripts/citation-linter-rollup.spec.ts`: lines 112-148 (R7, R8, R9 added)
- `agent-workspace/memory/attestations/cf-dogfood-5-7-elided.md`: NEW (full file)
- `agent-workspace/memory/observations/task-10.2-dogfood-cosmetic-disposition.md`: NEW (full file)
- `agent-workspace/memory/sessions/2026-04-28-task-10.2-cosmetic-cf25.md`: NEW (full file)

## Tests Added
- `tests/scripts/citation-linter-rollup.spec.ts`: 3 new cases (R7, R8, R9)
  - R7: hook::WebFetch → EXEMPT (CF-25 regression guard)
  - R8: hook::TaskList → EXEMPT (CF-25 regression guard)
  - R9: Phase 9 rollup smoke → exit 0 (real-world regression guard)

## Gates
- typecheck: PASS (exit 0; all 5 packages clean)
- lint: PASS (exit 0; 4 pre-existing web-ui warnings, 0 errors)
- test: PASS (1139/1139 jest core; 9/9 vitest citation-linter spec; pnpm test exit 0)
- invariants: PASS
  - citation-linter --phase 9 exits 0 (was exit 1 with 2 FAILs pre-fix)
  - citation-linter --phase 6 exits 0 (unchanged, regression clean)
  - git log --oneline | wc -l = 1 (I-6 ABSOLUTE preserved)

## Deviations from Plan
None. Fix B used allowlist augmentation path (adding WebFetch/TaskList to existing BUILTIN_HOOK_EVENTS set). Fix A used RESOLVED-BY-DOCUMENTATION attestation path (description unrecoverable — pre-authorized by phase-10-routing-brief §7 Q2 and §4 item 4).

## Concerns
None.

## Assumptions Made
1. `WebFetch` and `TaskList` are Claude Code built-in tool names of the same class as `Bash`, `Read`, `Edit`, etc. — they appear in hook event telemetry rows and have no corresponding `scripts/hooks/*.sh` file. Adding them to `BUILTIN_HOOK_EVENTS` is consistent with the existing exemption pattern.
2. CF-DOGFOOD-5 and CF-DOGFOOD-7 were genuinely "minor cosmetic" per all surviving records. No escalation to master-planner triggered. Consistent with 3-phase review (9.0 routing → phase-9-complete → phase-10-routing brief) that always classified them as cosmetic.
3. The session note + observation + attestation together constitute the "1-page disposition note" required by the routing brief acceptance gate.
