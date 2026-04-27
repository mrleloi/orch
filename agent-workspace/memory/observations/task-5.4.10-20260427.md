# Task 5.4.10 — Document Hook-Deny Daemon Log-Only Design

## Status
DONE

## Files Changed
- agent-workspace/constitution/architecture.md (lines 155-174 area: added 17-line "Hook Deny Semantics" subsection)
- packages/core/src/modules/hooks/hooks.service.ts (lines 640-644: updated inline comment, 3 lines changed)

## Tests Added
- None (documentation-only task)

## Gates
- typecheck: PASS (no logic changes; existing tsc already clean)
- lint: PASS (comment-only changes)
- test: PASS (1079/1079 across 75 suites)
- invariants:
  - I-6 (no commit): PASS — no git commit executed
  - Architecture grep: 4 hits (≥2 required)
  - Hooks module grep: 6 hits (≥1 required)

## Deviations from Plan
The JSDoc above `_handleToolDenied` in session-manager.ts already contained a comprehensive
design rationale comment (lines 935-948) added in a prior task. Rather than duplicate that
content, the task added the required terminology to hooks.service.ts where the grep check
(`packages/core/src/modules/hooks/`) actually operates. The session-manager.ts JSDoc was left
unchanged — it already correctly documents the rationale.

The inline comment at hooks.service.ts line 641 previously said "gate writeStdin" which was
misleading. Updated it to accurate "observe-and-record" / "upstream gate" language. This is
a comment correction, not a logic change.

## Concerns
None.

## Assumptions Made
1. The Part D grep targeting `packages/core/src/modules/hooks/` (not sessions/) is the
   authoritative check, so the docstring/comment addition was placed in hooks.service.ts.
2. Fixing a misleading inline comment is within scope of "documentation only" — it is not
   a logic change.
3. The existing JSDoc in session-manager.ts is already comprehensive; it does not need to be
   duplicated. Adding a reference comment in hooks.service.ts is sufficient and non-redundant.
