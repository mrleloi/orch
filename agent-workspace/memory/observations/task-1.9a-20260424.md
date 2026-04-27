# Task 1.9a — ClaudeCodeAdapter

## Status
DONE

## Files Changed
- packages/core/src/modules/sessions/claude-code-adapter.ts (created)
- packages/core/src/modules/sessions/sessions.module.ts (created)
- packages/core/src/modules/sessions/claude-code-adapter.spec.ts (created)
- packages/core/src/modules/sessions/claude-code-adapter.integration.spec.ts (created)
- packages/core/package.json (execa@5 added as dependency via pnpm)

## Tests Added
- claude-code-adapter.spec.ts: 44 test cases
- claude-code-adapter.integration.spec.ts: 1 test case (skip-gated by ORCH_SKIP_INTEGRATION=1)
- Total suite: 362/362 passing (363 total, 1 skipped integration)
- Previous suite: 318/318

## Gates
- typecheck: PASS (0 errors)
- lint: PASS (0 errors; 1 pre-existing warning in main.ts, not in sessions/)
- test: PASS (362/362 unit tests; integration test properly skip-gated)
- invariants I-3 grep (sessions/ dir): PASS — empty output
- invariants I-2 grep (sessions/ dir): PASS — empty output
- I-3 full core grep (non-spec files): PASS — empty output

## Deviations from Plan

1. **IAgentRuntime already existed**: The plan brief said "if IAgentRuntime does not yet exist... create it". It already exists at `packages/core/src/domain/types/runtime.ts` with `spawn(config: SpawnConfig)`, `resume(sessionId, prompt)`, and `terminate(handle, reason)` signatures. Implemented against the existing interface exactly.

2. **`stdoutHandler` parameter not added to SpawnConfig**: The brief listed `stdoutHandler?: (event) => void` as part of spawn params, but `SpawnConfig` already exists in the domain layer (I-14: no modifications to domain types without full review). Instead, `RuntimeHandle.stdout` exposes the raw Readable stream, and callers subscribe directly. This is the correct architectural pattern — session manager (1.9d) reads from the handle's streams.

3. **resume() sessionId encoding**: The existing `IAgentRuntime.resume(sessionId, prompt)` signature has no `profile` parameter. Since ccs requires a profile name, adopted `"<profile>/<claudeSessionId>"` encoding convention. Session manager (1.9d) is responsible for encoding when calling resume(). Documented in JSDoc. This is an open question for 1.9d to formalize.

4. **awaitAndClassify() method added**: Not in original interface but exposed as a public method on the adapter for session manager (1.9d) to use after consuming streams. Does not affect IAgentRuntime interface contract.

5. **execa v5 install**: execa was not in packages/core/package.json. Added via `pnpm --filter @orch/core add execa@5`. The monorepo already had execa@5.1.1 in the pnpm store (used transitively). Now explicitly declared.

## Concerns (if DONE_WITH_CONCERNS)
N/A — DONE

## Assumptions Made
1. IAgentRuntime.spawn() being `async` is satisfied by `await Promise.resolve()` at the start — the interface requires Promise return, and the real async work (stream events) happens after return.
2. `ExecaChildProcess` type from execa v5 CJS `export = execa` namespace is accessible via `import type execa_ns from 'execa'` and then `type ExecaChildProcess = execa_ns.ExecaChildProcess`. This worked with typecheck.
3. The pre-existing warning in main.ts (`no-floating-promises` for `NestFactory.create()`) is not introduced by this task and is acceptable.
4. Integration test defaults to `ORCH_SKIP_INTEGRATION=1` in CI (no environment variable set). When env var is absent, the test runs (which would fail without real ccs). The test uses `process.env['ORCH_SKIP_INTEGRATION'] === '1'` check — when undefined, it does NOT skip.

## Open Questions for 1.9b/c/d

1. **Profile encoding in resume()**: Session manager (1.9d) must call `adapter.resume('<profile>/<claudeSessionId>', prompt)`. This encoding should be formalized in a helper or the session manager should maintain a profile↔sessionId map.

2. **awaitAndClassify() consumer**: Session manager (1.9d) should call `adapter.awaitAndClassify(child)` after reading streams to get typed DomainErrors. The child process reference is not exposed via RuntimeHandle — the session manager needs to retain the reference from the execa call or receive it differently. Possible approach: session manager reads from handle.stdout/.stderr, then calls `awaitAndClassify`. The `child` is the ExecaChildProcess which is also a Promise.

3. **Terminate timeout (5s)**: Currently polls every 200ms for TERMINATE_TIMEOUT_MS (5s) before SIGKILL. AgentWatchdog (1.9c) may want to override this timeout per termination reason.

4. **Session ID box timing**: `handle.sessionId` returns empty string until the first stream event with `session_id` arrives. Session manager (1.9d) must not read sessionId synchronously after spawn() — must wait for stream data. Consider emitting a `session.started` event from the adapter, but this may be 1.9d's responsibility.

5. **ExecaChildProcess not in RuntimeHandle**: The handle intentionally doesn't expose the execa child. Session manager will need a way to call `awaitAndClassify`. Options: (a) session manager subscribes to handle.stdout/stderr and awaits the promise chain manually, (b) a wrapper type is introduced. Leaving for 1.9d design.
