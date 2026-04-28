# Task 9.2-fix MAJ-1 — H7 test with win32 skipIf guard

## Status
DONE

## Files Changed
- tests/hooks/dispatch-recorder.spec.ts: lines 318-341 (H7 added)

## Tests Added
- tests/hooks/dispatch-recorder.spec.ts: 1 new case (H7)

## Gates
- typecheck: PASS
- lint: PASS
- test: PASS (8 passed / 1 skipped on win32 / 0 failed — total 9)
- invariants:
  - `grep -c "skipIf" tests/hooks/dispatch-recorder.spec.ts` = 1 (PASS, required >= 1)
  - `grep -c "win32" tests/hooks/dispatch-recorder.spec.ts` = 2 (PASS, required >= 1)

## H7 Subject
Malformed stdin payload: hook exits 0 and writes no JSONL line.

Rationale: The script wraps all logic in a background subshell with `trap 'exit 0' ERR`
and a fallback `HOOK_EVENT=""` guard for JSON parse failures. The path where bad input
arrives and nothing is written was untested by H1..H6, T2, T4. This is a genuine seam
gap (error-path correctness of the `dispatch-jsonl-recorder.sh` recorder).

The `it.skipIf(process.platform === 'win32')` guard is placed because bash stdin-piping
behavior with malformed payloads differs between Git Bash / WSL flavours on Windows,
making assertions about line-count unreliable on that platform — the core recorder logic
is exercised on Linux/macOS CI where the guard is transparent.

## Test Name
"H7 — malformed stdin: hook exits 0 and writes no JSONL line"

## Skip Guard Placement
`it.skipIf(process.platform === 'win32')('H7 — ...', () => { ... })`
Located inside `describe('dispatch-jsonl-recorder.sh — schema + atomicity', ...)`.

## Deviations from Plan
None. H7 fills the malformed-stdin gap as the "smallest valuable test". The four
candidate gaps in the spec were:
1. End-to-end PreToolUse+SubagentStop pairing (covered by H2, T4)
2. Recorder behavior when dispatch.jsonl is absent/unwritable (implicit in H1; not a
   distinct gap)
3. Recorder behavior with malformed stdin (NOT covered — chosen)
4. Timestamp ordering under concurrent writes (partially covered by H6 ordering check)

Gap 3 was selected as the smallest, most clearly bounded, and directly maps to the
`trap 'exit 0' ERR` + `HOOK_EVENT=""` fallback path in the script.

## Assumptions Made
- Vitest 2.1.x `it.skipIf()` API is available (confirmed: pnpm store shows vitest@2.1.9).
- The test file is not under any package-level eslint scope (confirmed: no root .eslintrc
  covering tests/; pnpm lint runs only packages/* eslint configs).
- On Windows (current CI host), H7 correctly reports "skipped" not "failed" — confirmed
  by the vitest run output ("9 tests | 1 skipped").

---
```yaml
---
status: DONE
substage: 9.2-fix-maj1
files_changed: [tests/hooks/dispatch-recorder.spec.ts]
h7_subject: "Malformed stdin payload: hook exits 0 and writes no JSONL line (exercises trap/fallback path)"
gates:
  typecheck: PASS
  lint: PASS
  vitest_exit: 0
  skipIf_present: true
  win32_present: true
next_action: { command: code-quality-reviewer, args: { substage: 9.2, scope: maj1-only } }
---
```
