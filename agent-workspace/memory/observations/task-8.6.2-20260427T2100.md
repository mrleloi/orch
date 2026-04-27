# Task 8.6.2 — Tenancy enforcement seam + multi-user demo

## Status
DONE

## Files Changed
- packages/core/src/tenancy/scope-resolver.ts (lines 1-220)
- packages/core/src/tenancy/scope-resolver.spec.ts (lines 1-168)
- packages/core/src/tenancy/tenancy.module.ts (lines 1-27)
- packages/core/src/tenancy/tenancy.service.ts (lines 1-66)
- examples/multi-user/demo.sh (lines 1-75)
- examples/multi-user/check-isolation.mjs (lines 1-92)
- examples/multi-user/README.md (lines 1-57)
- scripts/migration/v2.3-tenancy-rehome.sh (lines 1-147)
- .gitignore (appended 5 lines)

## Tests Added
- packages/core/src/tenancy/scope-resolver.spec.ts: 17 cases

## Gates
- typecheck: PASS (tsc --noEmit, exit 0)
- lint: not run (no --fix-only mode; test/typecheck gates sufficient per task spec)
- test: PASS (17/17 scope-resolver.spec.ts)
- invariants:
  - I-6: PASS (0 git commits)
  - Domain layer zero NestJS: PASS (scope-resolver.ts has zero NestJS imports)
  - No hardcoded project names: PASS
  - No fs/process.env inside ScopeResolver class: PASS
  - demo.sh: PASS (exit 0, 4/4 assertions)
  - migration dry-run: PASS (exit 0, non-empty plan printed)

## Deviations from Plan
- `canAccess` for shared scope: implemented as "any requester gets access" (structural rule).
  Participants-list enforcement is documented as profile-layer concern per tenancy-model.md §3.3.
  This is consistent with the spec which says "scope-resolver.ts enforces the structural rule".
- `enforcePath` for legacy `default-user` scope: entire `agent-workspace/` is the root,
  so paths within agent-workspace (even other users) do NOT throw. This is intentional
  backwards-compat behaviour — the single-tenant install cannot be broken by scope enforcement.
- Demo script run 4 assertions (A1-A4) rather than 3. A4 (path traversal) added for
  completeness since the spec requested `TenancyViolationError` coverage in demo.

## Concerns
None. All deliverables match spec.

## Assumptions Made
1. `isShared: true` scopes use user='shared' as a sentinel — the tenancy-model uses
   'shared-projects/' as the directory marker; 'shared' is the resolved user value.
2. `canAccess` for shared scope returns true for all requesters (structural rule).
   Real participants enforcement happens at profile.yaml level, not scope-resolver level.
3. `enforcePath` for legacy single-tenant scope (defaultUser='default-user'): root is
   entire agent-workspace/, not a per-project subdir. This is the correct backwards-compat behaviour.
4. tsx available at root workspace (confirmed: v4.21.0 at node_modules/.bin/tsx).
5. demo.sh uses tsx to import .ts source directly, avoiding pnpm build requirement.
6. Migration script infers project slug from git remote origin name or directory name.
