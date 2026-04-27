# Session Plan: Task 2.10 — Phase 1 Backlog Cleanup Bucket B

## Meta
- **Spec**: `agent-workspace/session-plans/pending/phase-2-interfaces.md` Task 2.10 (lines 506–530)
- **Phase master plan**: `phase-2-interfaces.md`
- **Session type**: MULTI_TASK_IMPL (12 sub-items)
- **Budget estimate**: 140K total (per-item: 5–12K)
- **Prerequisites**: Task 2.9 (OTEL stable) — assumed complete
- **Subagents**: `task-implementer` per item + `spec-compliance-reviewer` + `code-quality-reviewer` after each batch
- **Parent project**: `C:\htdocs\orch-starter`

## Goal
Clear all 12 deferred minor items from Task 1.9 + Task 1.10 backlog (`agent-workspace/memory/phase-1-complete.md` § "Deferred Items"). Each item is independent, small, and has its own acceptance test(s).

## Invariants (apply to every item)
- **I-2** (no `stockforge` / project names) — grep `packages/core/src/`
- **I-3** (no `@anthropic-ai/sdk` imports) — grep `packages/core/src/`
- **I-4** (project-agnostic core)
- **I-9** (every log line has `trace_id` when within span)
- **I-12** (DomainError wrapping at adapter boundary)
- **I-14** (no `let`/`var` module-level singletons; no `@nestjs/*` in `packages/core/src/domain/`)

After EACH item: run `pnpm --filter @orch/core typecheck && pnpm --filter @orch/core lint && pnpm --filter @orch/core test <pattern>`. Commit per item (squash-merge later).

---

## Recommended Execution Order

| # | Item | Why this order |
|---|---|---|
| 1 | **2.10.h** (VERIFY-ONLY) | Confirm `BoundedStderrBuffer` already lives at `claude-code-adapter.ts:73`; mark DONE if so |
| 2 | **2.10.l** (VERIFY-ONLY) | Confirm `hook.received` already emitted post-tx at `hooks.service.ts:476`; mark DONE if so |
| 3 | **2.10.k** | Removal-only; unblocks future `HooksService` constructor reads |
| 4 | **2.10.f** | Centralizes `DEFAULT_*` consts; downstream items import from new location |
| 5 | **2.10.a** | Error class structured fields; **2.10.i** depends on the new shape |
| 6 | **2.10.i** | P2002 helper builds on the `DomainError` shape from 2.10.a |
| 7 | **2.10.c** | Mostly already done; verify + tighten signatures |
| 8 | **2.10.d** | Tighten `toBeInstanceOf(Error)` once the subclasses (post-2.10.a) are stable |
| 9 | **2.10.e** | Re-entrant watchdog guard |
| 10 | **2.10.b** | SIGKILL-timeout integration test (after error class tightening lands) |
| 11 | **2.10.g** | sessionKey PII redaction |
| 12 | **2.10.j** | 60s bucket boundary test/comment |

---

## Item 2.10.a — Error classes structured fields

### Part A — Contract
`DomainError` base gains 3 new READONLY fields: `details: Record<string, unknown>` (passed through `redactSecrets`), `retryable: boolean` (default false). The existing `code: string` stays. Subclasses pass typed `details` into super. Existing `code`, `message`, `cause` semantics unchanged. `toJSON()` is added that emits `{ name, code, message, retryable, details, cause }` so Web UI error boundary (Task 2.6) can render structured fields. **Backwards-compat**: existing 2-arg constructors still work (details defaults to `{}`, retryable defaults to false).

### Part B — Signatures
File: `packages/core/src/domain/errors.ts`

```typescript
export interface DomainErrorOptions {
  cause?: unknown;
  details?: Record<string, unknown>;
  retryable?: boolean;
}

export class DomainError extends Error {
  readonly code: string;
  override readonly cause: unknown;
  readonly details: Record<string, unknown>;  // redacted at construction
  readonly retryable: boolean;

  constructor(code: string, message: string, options?: DomainErrorOptions);

  toJSON(): {
    name: string;
    code: string;
    message: string;
    retryable: boolean;
    details: Record<string, unknown>;
    cause: unknown;
  };
}
```

Subclass updates:
- `RateLimitError` — `retryable: true` by default; `details: { retryAfterSecs }` when provided
- `ContextFullError` — `retryable: false`
- `RuntimeSpawnError` — `retryable: false`
- `HookAuthError` — `retryable: false`
- `StateTransitionError` — `retryable: false`; `details: { fromState, event }`
- `ProfileValidationError` — `retryable: false`; `details: { issues }`
- `QueueCancelledError` — `retryable: false`; `details: { sessionKey }`
- `SessionLockHeldError` — `retryable: true`; `details: { sessionKey }`
- `QuarantineError` — `retryable: false`; `details: { queueItemId, attempts }`

### Part C — Pre-authorized risks
- `details` is redacted at construction time using existing `redactSecrets()` applied per stringified value (use `JSON.stringify` round-trip + parse, OR run `redactSecrets` per-string-leaf — implementer choice; document choice in PR comment).
- `toJSON()` MUST NOT include the `cause` chain raw if it contains a stack — emit `cause: cause instanceof Error ? { name, message, code } : cause`.

### Tests (~6)
File: `packages/core/src/domain/errors.spec.ts` (extend existing)

1. `DomainError.details defaults to {} and retryable defaults to false`
2. `DomainError redacts secrets inside details object` (e.g. `{ apiKey: 'sk-abc...' }` → `'[REDACTED]'`)
3. `RateLimitError.retryable === true and details.retryAfterSecs round-trips`
4. `ContextFullError.retryable === false`
5. `StateTransitionError.details === { fromState, event }`
6. `DomainError.toJSON() returns the structured shape and excludes raw stack`

Run: `pnpm --filter @orch/core test errors.spec`

---

## Item 2.10.b — SIGKILL-timeout branch integration test

### Part A — Contract
Add an integration test that exercises the `claude-code-adapter.ts:425` SIGKILL fallback path: spawn a real subprocess that ignores SIGTERM (via `process.on('SIGTERM', () => {})`), call `terminate()`, assert SIGKILL is sent after `TERMINATE_TIMEOUT_MS`, the child exits, and no `DomainError` is thrown for ESRCH path. NO production-code changes.

### Part B — Signatures
File: `packages/core/src/modules/sessions/claude-code-adapter.integration.spec.ts` (extend)

Test name: `'terminate() sends SIGKILL when SIGTERM is ignored'`. Use a tiny inline node script as the child:

```js
// node -e "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"
```

Override `TERMINATE_TIMEOUT_MS` via an injectable constant or a test-only path (see existing pattern). If no override exists, use `vi.useFakeTimers()` to advance past the timeout and `vi.runOnlyPendingTimersAsync()`.

### Part C — Pre-authorized risks
- This is a real-subprocess integration test — runs in `*.integration.spec.ts` glob (already excluded from default unit run if needed).
- On Windows, `process.kill(pid, 'SIGTERM')` is emulated; if the test is brittle on win32, gate with `it.skipIf(process.platform === 'win32')`.

### Tests (~1)
1. `'terminate() escalates to SIGKILL after TERMINATE_TIMEOUT_MS when SIGTERM is ignored'`
   - Arrange: spawn node child that ignores SIGTERM; capture PID
   - Act: call `adapter.terminate(handle, 'idle_timeout')`; advance fake timers by 5_001ms
   - Assert: child process is no longer running (`process.kill(pid, 0)` throws ESRCH); no DomainError thrown; logger captured `'adapter:terminate:sigkill-sent'` line

Run: `pnpm --filter @orch/core test claude-code-adapter.integration`

---

## Item 2.10.c — `cancel()` / `cancelSession()` Promise<void> consistency

### Part A — Contract
**Status check first**: per current code,
- `RequestQueue.cancel()` already returns `Promise<void>` (`request-queue.ts:131`)
- `SessionManager.cancelSession()` already returns `Promise<void>` (`session-manager.ts:203`)
- `ClaudeCodeAdapter` has NO `cancel()` — uses `terminate()` which is already `Promise<void>`

This item reduces to: **verify all callers `await` these methods**, and if any call site fires-and-forgets, add `await` (or `void` with comment if intentional). No new methods. No production-code rename.

### Part B — Signatures
Audit grep:
```
pnpm --filter @orch/core exec rg "\.cancel\(|\.cancelSession\(|\.terminate\(" packages/core/src --type ts -n
```
For every match, ensure the callsite is `await ...` or `void (async () => { await ...; })()` or has a `// eslint-disable-next-line @typescript-eslint/no-floating-promises` justification comment.

If any caller is sync-fire-and-forget without justification, add `await` (only inside async fns) OR convert the surrounding fn to async.

### Part C — Pre-authorized risks
- If a caller is in a NestJS lifecycle hook that doesn't return a promise (e.g. `onModuleDestroy(): void`), wrap in `void this.fn().catch((err) => this.logger.error(err))` and emit a log line — no signature change to the lifecycle hook itself.

### Tests (0 new)
Type signatures already covered by existing specs; the audit + lint pass is the verification.

Run: `pnpm --filter @orch/core lint && pnpm --filter @orch/core typecheck`

---

## Item 2.10.d — Tighten `toBeInstanceOf(Error)` to concrete subclass

### Part A — Contract
Replace 6 weak assertions (`toBeInstanceOf(Error)`) with the concrete `DomainError` subclass that the call site actually throws. NO production-code changes.

### Part B — Signatures
Audit greps already located 3 occurrences:
1. `packages/core/src/domain/errors.spec.ts:25` — already paired with `toBeInstanceOf(DomainError)` (line 26); leave as-is (it's the contract test for "is an Error too")
2. `packages/core/src/domain/domain-error-redacts.spec.ts:106` — same pattern; verify or leave
3. `packages/core/src/modules/sessions/request-queue.spec.ts:225` — change to `toBeInstanceOf(DomainError)` since the queue wraps non-Error throws into `DomainError` (per current `request-queue.ts` behavior)

For the remaining 3 of the "6 flagged" — re-grep across the suite:
```
rg "toBeInstanceOf\(Error\)" packages/core/src --type ts -n
```
For each remaining match, replace `Error` with the most-specific subclass per the SUT's documented throws.

### Part C — Pre-authorized risks
- If grep finds fewer than 6 matches, document the discrepancy in a `// note:` PR comment — Phase 1 carryover may have already cleaned some. Target outcome: zero `toBeInstanceOf(Error)` assertions in `packages/core/src/**/*.spec.ts` EXCEPT in `errors.spec.ts:25` and `domain-error-redacts.spec.ts:106` where the assertion is intentional contract documentation.

### Tests (0 new)
Modify 6 existing assertions; existing tests must still pass.

Run: `pnpm --filter @orch/core test`

---

## Item 2.10.e — Re-entrant watchdog tick guard

### Part A — Contract
`AgentWatchdog.check()` (`agent-watchdog.ts:132`) is async and is fired from `setInterval`. If a tick takes longer than `intervalMs`, a second tick can start while the first is in-flight — concurrent termination dispatches against the same session is a real risk. Add `private ticking = false;` guard: if a tick fires while a previous is still running, log `watchdog:tick-skipped` and return immediately.

### Part B — Signatures
File: `packages/core/src/modules/sessions/agent-watchdog.ts`

```typescript
@Injectable()
export class AgentWatchdog implements OnModuleInit, OnModuleDestroy {
  // ...existing fields...
  private ticking = false;

  async check(): Promise<void> {
    if (this.ticking) {
      this.logger.warn({ msg: 'watchdog:tick-skipped', reason: 're-entrant' });
      return;
    }
    this.ticking = true;
    try {
      // ...existing body...
    } finally {
      this.ticking = false;
    }
  }
}
```

### Part C — Pre-authorized risks
- The guard MUST live on the public `check()` method (not `evaluateSession`) — the per-session loop is sequential within a tick, so the race is only across ticks.
- I-14: `ticking` is per-instance state on a DI-managed service, NOT module-level — compliant.

### Tests (~1)
File: `packages/core/src/modules/sessions/agent-watchdog.spec.ts` (extend)

1. `'check() is re-entrant safe — second concurrent call logs tick-skipped and returns immediately'`
   - Arrange: stub registry to return 1 session + a terminator that takes 100ms
   - Act: call `watchdog.check()` and `watchdog.check()` in parallel via `Promise.all`
   - Assert: terminator called exactly once; logger captured one `'watchdog:tick-skipped'` warn

Run: `pnpm --filter @orch/core test agent-watchdog.spec`

---

## Item 2.10.f — `DEFAULT_*` constants consolidation

### Part A — Contract
Move scattered `DEFAULT_*` constants into `packages/core/src/config/defaults.ts`. Existing call sites import from the new location. Old export points may keep a re-export for one cycle if the diff is large, but new code MUST import from `config/defaults.ts`.

### Part B — Signatures
**Create**: `packages/core/src/config/defaults.ts`

```typescript
/**
 * Centralized DEFAULT_* constants for Orch core.
 *
 * I-2: no project-specific defaults (all configurable via profile.yaml).
 * I-14: const exports only; no module-level mutable state.
 */

// Watchdog
export const DEFAULT_HEARTBEAT_TIMEOUT_MS = 180_000;
export const DEFAULT_ABSOLUTE_CEILING_MS = 1_800_000;
export const DEFAULT_SOFT_WARN_GRACE_MS = 60_000;
export const DEFAULT_WATCHDOG_INTERVAL_MS = 30_000;

// API tail
export const DEFAULT_TAIL_LINES = 20;

// Hook dedup
export const DEFAULT_DEDUP_BUCKET_MS = 60_000;

// Stderr buffering
export const DEFAULT_STDERR_BUFFER_MAX_BYTES = 256 * 1024;

// Subprocess termination
export const DEFAULT_TERMINATE_TIMEOUT_MS = 5_000;
```

**Update imports** at:
- `packages/core/src/modules/sessions/agent-watchdog.ts` — replace local `DEFAULT_HEARTBEAT_TIMEOUT_MS`, `DEFAULT_ABSOLUTE_CEILING_MS`, `DEFAULT_SOFT_WARN_GRACE_MS`, `WATCHDOG_INTERVAL_MS` with imports
- `packages/core/src/modules/api/api.controller.ts:324` — replace local `DEFAULT_LINES = 20` with import
- `packages/core/src/modules/hooks/hooks.service.ts:52` — replace local `DEDUP_BUCKET_MS` with import
- `packages/core/src/modules/sessions/claude-code-adapter.ts:56,59` — replace local `TERMINATE_TIMEOUT_MS`, `STDERR_BUFFER_MAX_BYTES`

Re-export: `agent-watchdog.ts` MAY re-export `DEFAULT_HEARTBEAT_TIMEOUT_MS` etc. to avoid touching `agent-watchdog.spec.ts:20-22` imports. Document in code comment: `// re-export for backwards-compat with spec file imports — migrate next cycle`.

### Part C — Pre-authorized risks
- Keep re-exports from old locations to keep diff small. Do NOT touch existing spec imports.
- Naming: `DEFAULT_TERMINATE_TIMEOUT_MS` (was `TERMINATE_TIMEOUT_MS` — prefix added for consistency).

### Tests (~1 grep-style)
File: `packages/core/src/config/defaults.spec.ts` (NEW)

1. `'no DEFAULT_* declarations exist outside config/defaults.ts'`
   - Use `node:fs` + `globby` (or shell out via `execa('rg', ...)`). The test reads `packages/core/src/**/*.ts` excluding `config/defaults.ts`, `**/*.spec.ts`, and asserts no line matches `/^export const DEFAULT_/`.
   - Re-exports of the form `export { DEFAULT_X } from '...config/defaults.js'` are allowed; the regex matches `export const DEFAULT_` only.

```typescript
// pseudo
const violations = await scanFiles(/^export const DEFAULT_/m, {
  ignore: ['**/config/defaults.ts', '**/*.spec.ts'],
});
expect(violations).toEqual([]);
```

Run: `pnpm --filter @orch/core test defaults.spec`

---

## Item 2.10.g — `sessionKey` PII redaction in logs

### Part A — Contract
The `sessionKey` (computed at `session-manager.ts:146` as `${projectId}:${plan.profile}:${plan.prompt.slice(0, 32)}`) embeds 32 chars of raw user prompt — likely PII. Replace log emissions of `sessionKey` with a hashed form (sha256, first 12 hex chars) by default. When env `ORCH_DEBUG_SESSION_KEYS=1`, log the raw `sessionKey` (dev only). Provide a pure helper `hashSessionKey(raw: string): string`. The DB persistence and in-memory map keys still use the RAW `sessionKey` — only the log field is redacted.

### Part B — Signatures
**Create**: `packages/core/src/modules/security/session-key-redactor.ts`

```typescript
import * as crypto from 'node:crypto';

/**
 * Redact a sessionKey for log emission.
 *
 * Default: sha256(raw).hex.slice(0, 12) — PII-safe, collision-safe enough for log correlation.
 * Debug:   when env ORCH_DEBUG_SESSION_KEYS === '1', returns raw (dev only, never default).
 */
export function redactSessionKey(raw: string): string {
  if (process.env['ORCH_DEBUG_SESSION_KEYS'] === '1') return raw;
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 12);
}
```

**Update call sites**:
- `packages/core/src/modules/sessions/session-manager.ts` — every `this.logger.{log,warn,error}` line that includes `sessionKey: <raw>` → use `sessionKey: redactSessionKey(<raw>)`. There are several (e.g., lines 153, 208, 226 per current grep).
- DO NOT change DB writes, EventBus payloads, or `wakeDedup.set/get` keys.

### Part C — Pre-authorized risks
- The hash is non-reversible; for debugging in dev, set `ORCH_DEBUG_SESSION_KEYS=1` in shell. This env is documented in the new spec file and must NOT appear in `.env.example` or any default config.
- 12 hex chars = 48 bits = ~280T collision space; enough for a per-process log correlation.

### Tests (~2)
File: `packages/core/src/modules/security/session-key-redactor.spec.ts` (NEW)

1. `'default — returns sha256 hex prefix (12 chars), not the raw input'`
   - Assert output ≠ input; output matches `/^[a-f0-9]{12}$/`; deterministic
2. `'with ORCH_DEBUG_SESSION_KEYS=1 — round-trips raw input'`
   - Use `vi.stubEnv('ORCH_DEBUG_SESSION_KEYS', '1')`; assert returns input verbatim; restore env

Run: `pnpm --filter @orch/core test session-key-redactor`

---

## Item 2.10.h — VERIFY-ONLY: stderrChunks bounded

### Part A — Contract
Phase 1 close-out fix C1 (per `phase-1-complete.md` line 99) already replaced `stderrChunks: Buffer[]` with `BoundedStderrBuffer`. Verify no regression. NO new code.

### Part B — Verification
Run grep:
```
rg "BoundedStderrBuffer" packages/core/src --type ts -n
rg "stderrChunks: Buffer\[\]" packages/core/src --type ts -n
```

**Expected outcomes**:
- First grep: returns hits in `claude-code-adapter.ts` (class definition + usages) AND `claude-code-adapter.spec.ts` (tests). Confirmed at line 73.
- Second grep: returns ZERO hits.

If both expectations hold → **status: ALREADY_DONE**. Write `agent-workspace/memory/sessions/<date>-2.10.h-skip.md` noting the verification and skip.

If second grep finds hits → fall through to implementing the cap (256 KiB ring per Phase 1 close-out spec).

### Part C — Pre-authorized risks
- N/A — verify-only.

### Tests (0 new)
Existing tests at `claude-code-adapter.spec.ts` covering BoundedStderrBuffer pass.

Run: `pnpm --filter @orch/core test claude-code-adapter.spec`

---

## Item 2.10.i — P2002 unique-constraint helper

### Part A — Contract
Two known P2002 race conditions:
1. `HooksService.processEvent()` INSERT into `HookEvent` (dedupKey unique) — if two concurrent identical hooks land between the SELECT and INSERT, the second INSERT throws `PrismaClientKnownRequestError code='P2002'`. Currently uncaught.
2. `OperatorActionLogService.log()` INSERT into `OperatorActionLog` — no unique constraint today, but planned migrations may add one (`actor + action + target + timestamp_bucket`).

Create a shared helper `handlePrismaError(err): DomainError | never` that:
- Returns a `DuplicateRecordError extends DomainError` (code `'DUPLICATE_RECORD'`, retryable=false) when err is `PrismaClientKnownRequestError` with `code === 'P2002'`.
- Re-throws (returns never) otherwise.

Apply: HooksService.processEvent() catch path inside the `tx.hookEvent.create` block — convert P2002 into the deduped path (log `'hooks:p2002-race-deduped'`, return `{ deduped: true }`).
Apply: OperatorActionLogService.log() — convert P2002 into a debug log + swallow (audit row already exists, the op succeeded).

### Part B — Signatures
**Create**: `packages/core/src/domain/errors.ts` — add subclass:
```typescript
export class DuplicateRecordError extends DomainError {
  readonly model: string;  // e.g. "HookEvent"
  readonly target: readonly string[];  // e.g. ["dedupKey"]

  constructor(model: string, target: readonly string[], options?: { cause?: unknown }) {
    super(
      'DUPLICATE_RECORD',
      `Unique constraint violation on ${model}(${target.join(',')})`,
      { cause: options?.cause, retryable: false, details: { model, target } },
    );
    this.model = model;
    this.target = target;
  }
}
```

**Create**: `packages/core/src/domain/prisma-error-helper.ts` (note: lives in `domain/` — pure, no NestJS, no Prisma client import — uses structural shape check):

```typescript
import { DomainError, DuplicateRecordError } from './errors.js';

interface PrismaP2002Like {
  code: string;
  meta?: { modelName?: string; target?: readonly string[] };
}

function isPrismaP2002(err: unknown): err is PrismaP2002Like {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: unknown }).code === 'P2002'
  );
}

/**
 * Convert a Prisma error into a DomainError, or pass through if not a known shape.
 * Returns `DuplicateRecordError` for P2002.
 */
export function handlePrismaError(err: unknown): DomainError {
  if (isPrismaP2002(err)) {
    return new DuplicateRecordError(
      err.meta?.modelName ?? 'unknown',
      err.meta?.target ?? [],
      { cause: err },
    );
  }
  // not a known prisma shape — wrap as generic DomainError
  return new DomainError('PRISMA_ERROR', String(err), { cause: err });
}
```

**Apply** in `hooks.service.ts` (inside the tx block, around `tx.hookEvent.create`):
```typescript
try {
  await tx.hookEvent.create({ data: { ... } });
} catch (err) {
  const wrapped = handlePrismaError(err);
  if (wrapped instanceof DuplicateRecordError) {
    this.logger.log({ msg: 'hooks:p2002-race-deduped', sessionId, dedupKey });
    span.addEvent('hook.deduped', { dedupKey, reason: 'p2002-race' });
    return { deduped: true } satisfies TxResult;
  }
  throw wrapped;
}
```

**Apply** in `operator-action-log.service.ts`:
```typescript
} catch (err: unknown) {
  const wrapped = handlePrismaError(err);
  if (wrapped instanceof DuplicateRecordError) {
    this.logger.debug({ msg: 'audit:p2002-suppressed', actor: entry.actor });
    return;  // already-logged, swallow
  }
  this.logger.error({ err, entry }, 'audit:operator-action-log:write-failed');
}
```

### Part C — Pre-authorized risks
- Helper lives in `domain/` (pure, no Prisma import) — matches I-14. Subclass also lives in `domain/errors.ts`.
- Structural type check (`err.code === 'P2002'`) is fine; do NOT import `PrismaClientKnownRequestError` from `@prisma/client/runtime` to keep the domain layer free of Prisma types.

### Tests (~3)
File: `packages/core/src/domain/prisma-error-helper.spec.ts` (NEW)
1. `'handlePrismaError(P2002) returns DuplicateRecordError with model + target'`
   - Arrange: fake error `{ code: 'P2002', meta: { modelName: 'HookEvent', target: ['dedupKey'] } }`
   - Assert: returns `DuplicateRecordError`, code === `'DUPLICATE_RECORD'`, model + target preserved
2. (in same file) `'handlePrismaError(generic Error) wraps as PRISMA_ERROR'`

File: `packages/core/src/modules/hooks/hooks.service.spec.ts` (extend)
1. `'P2002 race during HookEvent insert is converted into deduped path'`
   - Mock `tx.hookEvent.create` to reject with `{ code: 'P2002', meta: { modelName: 'HookEvent', target: ['dedupKey'] } }`
   - Assert: `processEvent` resolves with `{ deduped: true }`; logger captured `'hooks:p2002-race-deduped'`

File: `packages/core/src/modules/audit/operator-action-log.service.spec.ts` (extend)
1. `'P2002 race during OperatorActionLog insert is suppressed'`
   - Mock prisma.operatorActionLog.create to throw P2002
   - Assert: `log()` resolves; logger captured `'audit:p2002-suppressed'` debug; no error log

Run: `pnpm --filter @orch/core test prisma-error-helper hooks.service operator-action-log`

---

## Item 2.10.j — Generic 60s bucket boundary clarification

### Part A — Contract
The generic dedup bucket at `hooks.service.ts:71-78` uses `Math.floor(nowMs / 60_000)` — a wall-clock-aligned 60s window. This means two events at `t=59.999s` and `t=60.001s` (1ms apart) land in DIFFERENT buckets. Document this in code AND pin behavior with a test. Optional: add a JSDoc on the function explaining the choice. **No behavior change.**

### Part B — Signatures
File: `packages/core/src/modules/hooks/hooks.service.ts` — extend the JSDoc on `dedupKeyGeneric`:

```typescript
/**
 * Compute a 60s bucket dedup key.
 *
 * Boundary semantics: bucket = floor(arrivalMs / 60000) — buckets are aligned
 * to wall-clock 60s windows starting at epoch second 0. This means two events
 * 1ms apart can land in DIFFERENT buckets if they straddle a 60s boundary.
 * Trade-off: simpler (no per-session bucket state) at the cost of a worst-case
 * deduplication window of ~1ms (instead of the nominal 60s).
 *
 * Acceptable: hook retries from Claude Code happen within seconds, far inside
 * the average bucket. The boundary edge is rare and not safety-critical
 * (the destination state machine is idempotent for transient events).
 */
function dedupKeyGeneric(...) { ... }
```

### Part C — Pre-authorized risks
- Document only; no behavior change. If a future spec requires a sliding-window dedup, it's a separate task.

### Tests (~1)
File: `packages/core/src/modules/hooks/hooks.service.spec.ts` (extend)

1. `'dedup bucket is wall-clock aligned — events 1ms apart across boundary land in different buckets'`
   - Use `service.computeDedupKeyPublic('Notification', { session_id: 's1' }, 59_999)`
   - And: `service.computeDedupKeyPublic('Notification', { session_id: 's1' }, 60_001)`
   - Assert: keys are NOT equal
   - Assert: `service.computeDedupKeyPublic('Notification', { session_id: 's1' }, 0)` and `... 59_999` ARE equal (same bucket)

Run: `pnpm --filter @orch/core test hooks.service`

---

## Item 2.10.k — Remove unused `OrchStoreService` injection from `HooksService`

### Part A — Contract
`HooksService` constructor at `hooks.service.ts:248` injects `OrchStoreService` and immediately discards it via `void this.store`. Remove the parameter, remove the import, remove the `void` line. NestJS DI will simply not resolve it.

### Part B — Signatures
File: `packages/core/src/modules/hooks/hooks.service.ts`

Diff:
- Remove `import { OrchStoreService } from '../db/orch-store.service.js';`
- Remove `private readonly store: OrchStoreService,` from constructor
- Remove `void this.store;` line

Audit: re-grep `rg "OrchStoreService" packages/core/src/modules/hooks` — must be empty.
Audit: confirm `hooks.module.ts` does NOT need to provide `OrchStoreService` (other consumers are unaffected).

### Part C — Pre-authorized risks
- If a future feature needs `OrchStoreService`, re-add then.
- If `hooks.service.spec.ts` constructs `HooksService` manually with all 4 args, update the spec to drop the 2nd arg. Confirm test still passes.

### Tests (0 new)
Existing `hooks.service.spec.ts` must still pass after constructor signature update.

Run: `pnpm --filter @orch/core test hooks.service && pnpm --filter @orch/core typecheck`

---

## Item 2.10.l — VERIFY-ONLY: `hook.received` emitted POST-transaction

### Part A — Contract
Per `hooks.service.ts:473-489`, `hook.received` is already emitted AFTER `prisma.$transaction` resolves (the txResult.deduped check is post-tx). The Phase 1 close-out fix already addressed this. NO new code.

### Part B — Verification
Run grep:
```
rg "EVENT_CHANNELS\.hook\.received" packages/core/src/modules/hooks --type ts -A 1 -B 5
```

**Expected**: the emit is OUTSIDE `prisma.$transaction(async (tx) => { ... })`. Specifically, it should appear AFTER the `const txResult = await this.prisma.$transaction(...)` block.

In current code (lines 471-481):
```typescript
});  // <-- closes $transaction
// Post-transaction event emissions (I-11)
if (!txResult.deduped) {
  this.eventBus.emit(EVENT_CHANNELS.hook.received, ...);
```

If verified, **status: ALREADY_DONE**. Skip with note.

### Part C — Pre-authorized risks
- N/A — verify-only.

### Tests (0 new)
Existing `hooks.service.spec.ts` covers the post-tx emission ordering.

Run: `pnpm --filter @orch/core test hooks.service`

---

## Aggregate Success Criteria
- [ ] All 12 items either DONE or ALREADY_DONE
- [ ] `pnpm --filter @orch/core typecheck` PASS
- [ ] `pnpm --filter @orch/core lint` PASS
- [ ] `pnpm --filter @orch/core test` PASS (cumulative test count rises by ~+15 to +25 — lower if 2.10.h and 2.10.l are ALREADY_DONE as expected)
- [ ] Invariant greps clean:
  - `rg "@anthropic-ai/sdk" packages/core/src` → empty
  - `rg "stockforge\|StockForge" packages/core/src` → empty
  - `rg "^let\s\|^var\s" packages/core/src | grep -v "\.spec\.ts"` → empty
  - `rg "@nestjs" packages/core/src/domain` → empty
- [ ] Each item committed as a separate logical chunk (12 commits, 2 of which may be "verify-only, no code change" docs commits)

## Handoff to Next Session
- Task 2.11 (Round-Trip E2E Smoke) depends on the structured `DomainError.toJSON()` shape from 2.10.a and the P2002 helper from 2.10.i.
- The new `config/defaults.ts` is the canonical place for future `DEFAULT_*` constants — Telegram (2.x) and Web UI tasks should import from here.

## Risks & Open Calls
1. **2.10.a redaction strategy**: choosing per-string-leaf vs JSON round-trip for `details` redaction. Per-leaf is preferred (preserves non-string types); document choice in PR.
2. **2.10.b on Windows**: SIGTERM emulation on win32 may make the integration test flaky. Skip on `process.platform === 'win32'` if needed (charter principle: deterministic tests > broad coverage).
3. **2.10.f re-export tail**: keeping re-exports from old locations adds 5 lines of cruft. Acceptable for one cycle; remove in Phase 3 cleanup pass.
4. **2.10.i Prisma type bleeding**: the helper uses structural shape check ONLY (no `@prisma/client` import). This keeps `domain/` framework-free per I-14.
5. **2.10.h and 2.10.l VERIFY-ONLY**: if greps unexpectedly fail (Phase 1 work was reverted), fall through to implementation. Set per-item budget +5K headroom.

## Spawned-mode Note
If `ORCH_SPAWNED=true`, each task-implementer invocation is a separate spawned session. The orchestrator selects items in the recommended execution order; on per-item completion, the implementer emits the structured YAML completion block per `spawned-session-mode` skill.
