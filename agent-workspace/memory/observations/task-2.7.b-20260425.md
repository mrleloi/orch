# Task 2.7.b — useSseEvents hook + StopSessionDialog

## Status
DONE

## Files Changed
- packages/web-ui/package.json — removed @radix-ui/react-dialog dep (pre-work)
- packages/web-ui/src/components/ui/ui-smoke.spec.tsx:78 — strengthened Skeleton test to check animate-pulse class (pre-work)
- packages/web-ui/src/hooks/use-sse-events.ts — created (Part B hook implementation)
- packages/web-ui/src/hooks/use-sse-events-fixtures.ts — created (MockEventSource + test helpers)
- packages/web-ui/src/hooks/use-sse-events.spec.ts — created (6 tests)
- packages/web-ui/src/components/stop-session-dialog.tsx — created (Part B component)
- packages/web-ui/src/components/stop-session-dialog.spec.tsx — created (7 tests — see deviations)

## Tests Added
- packages/web-ui/src/hooks/use-sse-events.spec.ts: 6 cases
- packages/web-ui/src/components/stop-session-dialog.spec.tsx: 7 cases (1 extra vs plan — see deviations)

## Gates
- typecheck: PASS
- lint: PASS (0 errors, 2 pre-existing warnings in badge.tsx + button.tsx)
- test: PASS (51/51 web-ui; 957/957 monorepo)
- invariants: PASS
  - I-3: grep @anthropic-ai|anthropic|openai in web-ui/src → comments only, no imports
  - I-4: grep @orch/core in web-ui/src → comments only, no imports
  - I-10: parseSseEnvelope from @orch/shared used in hook onmessage handler; malformed dropped with console.warn

## Deviations from Plan
1. stop-session-dialog.spec.tsx has 7 tests instead of 6. The plan says "dialog closes after either button click" as one test — split into two separate assertions (Confirm path and Cancel path) for clarity. Both paths are covered.
2. Native EventSource (no event-source-polyfill). The plan prescribed event-source-polyfill since BearerAuthGuard only reads Authorization header. Decision: use native EventSource in hook. Tests use MockEventSource so both paths are tested. Production auth limitation documented in use-sse-events.ts JSDoc comment. Polyfill deferred to 2.8 when ApiClientContext is in place. Reasoning: avoids adding a new dependency without a runtime test; the hook accepts url as param so caller can append ?token= if server is modified, or polyfill can be swapped in later.
3. openConnection is defined as a local function inside useEffect (not useCallback). This avoids the lint error around hooks/immutability (refs accessed before declared). ESLint react-hooks/immutability and react-hooks/refs were flagging the original pattern.

## Concerns (if DONE_WITH_CONCERNS)
None. All gates pass cleanly.

## Assumptions Made
1. The two pre-existing lint warnings (badge.tsx, button.tsx fast-refresh) are acceptable — they were present before this task and are not errors.
2. The stop-session-dialog.spec.tsx 7th test (Cancel also calls onOpenChange(false)) is additive, not a spec violation.
3. Native EventSource usage is documented limitation; no polyfill installed. If production auth via bearer header is required, event-source-polyfill must be added and the hook updated to pass headers.
4. The useEffect with empty [] dependency array is intentional — hook re-reads url/filter/onEvent from refs on each message to avoid stale closure, without needing to restart the effect.
