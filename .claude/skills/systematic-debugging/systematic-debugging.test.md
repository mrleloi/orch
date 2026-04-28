# systematic-debugging -- Sibling Self-Test

## Trigger

- Second fix attempt has failed on the same symptom
- "Works on my machine" / intermittent failures
- Data pipeline output does not reproduce across runs
- Integration bug: subprocess / hook / trace-context propagation
- Any moment the assistant catches itself guessing at root cause

## Expected behavior (PASS)

Skill activates; 4-phase flow executes in order: Phase 1 instruments every
component boundary crossed by the symptom (logging added, scenario run ONCE,
logs saved -- no fix yet). Phase 2 writes one-sentence root-cause statement.
Phase 3 tests ONE hypothesis at a time (max 3 attempts, each reverted on FAIL).
Phase 4 writes regression test then applies fix. Phase 4.5 fires after 3 FAILED
hypotheses: write escalation.md and HALT. NO bundled changes at any point.

## Named failure modes

- Mode F1: hypothesis bundled -- "let me change X and Y together" applied in a single diff (Phase 3 violation; single-variable isolation is mandatory)
- Mode F2: 4th hypothesis attempted instead of stopping at 3 and writing escalation.md (Phase 4.5 violation; historical >95% failure rate beyond 3 hypotheses)
- Mode F3: defensive checks added without confirmed root cause -- "I'll add a guard just in case" masks the bug rather than fixing it (Red Flag in SKILL.md)
- Mode F4: refactor-while-debugging -- unrelated cleanup applied in the same diff as the fix attempt (P3 violation; "let me refactor while I'm here")

## Metrics

- activation_count_per_session: 0-2
- success_rate: TBD (Phase 5.5)
- token_cost_p50: TBD (Phase 5.5)
- duration_ms_p50: TBD (Phase 5.5)

## Assertions

1. When component_name=systematic-debugging is activated, an instrumentation diff (Phase 1 logging added, no logic change) appears in git log BEFORE every fix-attempt diff within the same task window -- grep git log for instrumentation commit preceding any fix commit in the same task
2. NO session contains 4 or more consecutive failed-fix turns without an escalation.md write occurring between turns 3 and 4 -- grep agent-workspace/memory/escalation.md mtime relative to transcript turn sequence for any systematic-debugging activation
3. Every fix marked PASSED (Phase 4 outcome=ok) is accompanied by a new regression test file -- grep the diff for a new *.spec.ts or *.test.ts file added in the same commit or task window as the fix diff
