# Spec Compliance Review — Substage 9.1 (CF-29 + MAJ-2 + T11)

## Verdict: FAIL

## Evidence Summary

### CF-29: layered-resolver.ts split

- `packages/core/src/config/layered-resolver.ts`: 569 LOC (unmodified — zero diff vs HEAD).
  Git status shows `layer-builder.ts` as untracked (`??`); `layered-resolver.ts` has NO staged or
  unstaged changes. The implementer created `layer-builder.ts` as a new disk file but never edited
  the source file at all.

- `packages/core/src/config/layer-builder.ts`: 102 LOC (in 80-110 range). Exports
  `resolveUserHome` (line 21), `resolveUserConfigPath` (line 43), `buildDefaultLayers` (line 69).
  Imports schemas FROM `layered-resolver.js` (circular dependency direction: builder imports from
  resolver, not the other way around).

- `layered-resolver.ts` still exports its own copies of all three functions:
    - `resolveUserHome` at line 488
    - `resolveUserConfigPath` at line 510
    - `buildDefaultLayers` at line 536

- No `export ... from './layer-builder.js'` re-export block exists in `layered-resolver.ts`.
  The resolver does not import from layer-builder at all.

Result: three functions are duplicated verbatim across both files; resolver was never reduced;
LOC gate (≤500) fails; re-export backward-compat gate fails.

### MAJ-2: INV-10 → INV-S9 cross-reference fix

- `tests/hooks/dispatch-recorder.spec.ts`: all four occurrences of "INV-10 reporter" replaced with
  "INV-S9 reporter" (lines 8, 26, 362-363, 372 in final file). Plus new explanatory comment at
  line 364 clarifying INV-10 is "Typed External Input — unrelated to latency; cross-ref corrected
  (MAJ-2)".
- `grep "INV-10 reporter"` returns 0 matches. PASS.
- `grep "INV-S9"` returns 5 matches. PASS.
- `agent-workspace/constitution/invariants.md`: INV-S9 stanza at line 281 contains no "INV-10"
  cross-reference. The MAJ-2 fix to invariants.md was a different change (I-6 stanza text) not
  related to INV-S9 naming — no issue found here.

### T11: dogfood harness brittleness mitigation

- `tests/dogfood/run-self-task.spec.ts` lines 557-596: full mitigation comment block added inside
  the T11 describe block explaining the ESM mocking limitation and why import-string assertion is
  the accepted approach. The test itself still pins the behavior (not deleted). PASS.

## Contract Match Matrix

| Clause | Code Evidence | Match |
|---|---|---|
| layered-resolver.ts LOC ≤500 | layered-resolver.ts: 569 LOC, zero diff from base | FAIL |
| buildDefaultLayers extracted to layer-builder.ts | layer-builder.ts:69 — present | PASS |
| buildDefaultLayers removed from layered-resolver.ts | layered-resolver.ts:536 — still present | FAIL |
| resolveUserHome/resolveUserConfigPath extracted | layer-builder.ts:21,43 — present | PASS |
| resolveUserHome/resolveUserConfigPath removed from resolver | layered-resolver.ts:488,510 — still present | FAIL |
| re-export of buildDefaultLayers in layered-resolver.ts | no import from layer-builder in resolver | FAIL |
| layer-builder.ts LOC 80-110 | 102 LOC | PASS |
| grep "INV-10 reporter" in dispatch-recorder.spec.ts == 0 | 0 matches | PASS |
| grep "INV-S9" in dispatch-recorder.spec.ts ≥ 1 | 5 matches | PASS |
| T11 mitigation comment present in run-self-task.spec.ts | lines 557-578 | PASS |
| T11 test still pins behavior (not deleted) | lines 579-596 | PASS |

## Missing Requirements (blocking)

1. CF-29-A: `layered-resolver.ts` was never edited. The three helper functions
   (`resolveUserHome`, `resolveUserConfigPath`, `buildDefaultLayers`) must be REMOVED from
   `layered-resolver.ts` and replaced with re-exports from `./layer-builder.js`.
   Evidence: `layered-resolver.ts` has no diff; still 569 LOC.
   Spec ref: CF-29 "Resolver target ≤500 LOC after split. Re-exports from resolver allowed."

2. CF-29-B: No re-export block in `layered-resolver.ts` for backward compat.
   Required: `export { resolveUserHome, resolveUserConfigPath, buildDefaultLayers } from './layer-builder.js';`
   Evidence: `grep "layer-builder" layered-resolver.ts` returns no matches.
   Spec ref: CF-29 "Re-exports from resolver allowed for backward compat."

## Over-Building

None detected. No new public exports beyond spec. No new config flags. No unrequested abstractions.
The extra tests added (T12-T14 in run-self-task.spec.ts) are carry-forward items explicitly in the
routing brief output_files, not unsolicited additions.

## Required Fixes (blocking)

1. Edit `packages/core/src/config/layered-resolver.ts`:
   - Remove lines 488-523 (resolveUserHome + resolveUserConfigPath definitions)
   - Remove lines 525-569 (buildDefaultLayers definition including its JSDoc)
   - Add import/re-export: `export { resolveUserHome, resolveUserConfigPath, buildDefaultLayers } from './layer-builder.js';`
   - Verify final LOC ≤500

---

```yaml
---
status: FAIL
substage: 9.1
verified_files: [layered-resolver.ts, layer-builder.ts, invariants.md, dispatch-recorder.spec.ts, run-self-task.spec.ts, run-self-task.ts]
acceptance_gates:
  - gate: layered-resolver.ts LOC ≤500
    actual: 569
    pass: false
  - gate: layer-builder.ts LOC 80-110
    actual: 102
    pass: true
  - gate: grep INV-10 reporter in dispatch-recorder.spec.ts == 0
    actual: 0
    pass: true
  - gate: grep INV-S9 in dispatch-recorder.spec.ts ≥ 1
    actual: 5
    pass: true
  - gate: re-export of buildDefaultLayers preserved in layered-resolver.ts
    pass: false
  - gate: T11 mitigation present in tests/dogfood/run-self-task.spec.ts
    pass: true
spec_violations:
  - "CF-29: layered-resolver.ts not edited; still 569 LOC (gate: ≤500)"
  - "CF-29: buildDefaultLayers/resolveUserHome/resolveUserConfigPath still defined in layered-resolver.ts (lines 488,510,536) — not removed after extract"
  - "CF-29: no re-export block in layered-resolver.ts pointing to layer-builder.ts"
concerns_non_blocking: []
next_action: { command: task-implementer, args: { substage: 9.1, fix_list: [CF-29-A, CF-29-B] } }
---
```
