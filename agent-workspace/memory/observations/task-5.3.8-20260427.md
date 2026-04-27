# Task 5.3.8 — maxConcurrentSessions dispatcher loop (SC-8)

## Status
DONE

## Files Changed
- `packages/core/src/domain/profile.ts` — line 185: `.min(1)` → `.min(1).max(8)` (1-char edit)
- `packages/core/src/modules/events/event-channels.ts` — added `dispatchDeferred` channel + payload type
- `packages/core/src/modules/project-registry/project-registry.service.ts` — added `getProjectSync()` public method
- `packages/core/src/modules/sessions/session-manager.ts` — added `countActiveForProject()` helper + SC-8 cap check in `executeSession()`
- `packages/core/src/modules/sessions/session-manager.spec.ts` — updated `makeRegistry()` mock; added `makeRegistry() as never` arg to 7 error-case tests
- `packages/core/src/modules/sessions/concurrency-cap.spec.ts` — NEW file, 6 test cases

## Tests Added
- `packages/core/src/modules/sessions/concurrency-cap.spec.ts`: 6 cases
  - `countActiveForProject returns 0 when no sessions active`
  - `countActiveForProject counts only sessions for queried projectId`
  - `countActiveForProject decrements when session ends`
  - `N=2 across 2 projects → never exceeds 2 ACTIVE at any wallclock moment` (integration)
  - `hard-cap of 8 enforced by zod schema — maxConcurrentSessions: 9 → safeParse fails`
  - `maxConcurrentSessions: 8 is accepted by zod schema (boundary at cap)`

## Gates
- typecheck: PASS
- lint: PASS
- test: PASS (1078/1078 — up from 1072, +6 new)
- integration_3x_deterministic: PASS (6/6 three consecutive runs)
- hard_cap_zod_rejects_9: PASS
- profile_spec_regression: 0 (35/35)
- grep_count_maxConcurrentSessions: 27 (≥3 requirement met)
- core_test_count: 1078 (≥1074 requirement met)

## Deviations from Plan
1. `dispatcher.service.ts` referenced in decision 013 does not exist. Cap logic placed in `session-manager.ts/executeSession()` per architect §9.7.B ("implementer audits").
2. Added `getProjectSync()` to `ProjectRegistryService` to keep synchronous cap check (no extra microtask delay that would break existing tests using hardcoded flush count of 6).
3. 6 test cases instead of 4 (added a zod boundary test for value=8).
4. Existing `session-manager.spec.ts` required updates: `makeRegistry()` mock needed `getProjectSync`, and 7 error-case tests that previously omitted the `registry` constructor arg now include it.

## Assumptions Made
- The `active` Map in `SessionManager` is the correct in-process count source (I-1 compliant — no LLM, no DB).
- `registry.getProjectSync()` (new sync method) is the right way to get profile without adding a microtask to the chain.
- Default cap when no profile found = 1 (most conservative / backward compatible with existing serial behavior).
- The 5.3.7 parallel task did not edit `executeSession()` (only `runSession()` resume branch), so no merge conflict.

## Concerns
None.
