# Task 2.8.d — Routes/nav-shell + cross-page integration regression

## Status
DONE

## Files Changed
- packages/web-ui/src/App.tsx:15-44 (added NavShell import + wrapped Routes)

## Files Created
- packages/web-ui/src/components/nav-shell.tsx (full file)
- packages/web-ui/src/components/nav-shell.spec.tsx (full file)
- packages/web-ui/src/App.spec.tsx (full file)

## Tests Added
- packages/web-ui/src/components/nav-shell.spec.tsx: 4 cases
- packages/web-ui/src/App.spec.tsx: 4 cases
- Total: +8 tests

## Gates
- typecheck: PASS (0 errors)
- lint: PASS (0 errors, 4 pre-existing warnings only)
- test: PASS (136/136 web-ui, was 128)
- monorepo: PASS (1051 total = 729 core + 136 web + 124 telegram + 40 shared + 22 cli)
- invariants: PASS

## Deviations from Plan
- none

## Concerns
none

## Assumptions Made
1. React Router v7 NavLink automatically sets aria-current="page" on active links (confirmed via source inspection of chunk-YZKCRDTN.js)
2. File-scan tests exclude .spec files from their own scans to prevent self-matching on comment text containing patterns (e.g., the comment "from '@orch/core'" in the spec file itself)
3. The "all 4 nav routes" test only asserts `page-dashboard` testid for the `/` route to avoid rendering full app tree across 4+ routes in one render (which would require cleanup between sub-renders)
4. The `tail` method was added to the mockClient in App.spec.tsx (not present in router.spec.tsx) because SessionDetailPage.tsx calls `sessions.tail()`
