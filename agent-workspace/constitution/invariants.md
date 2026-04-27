# Invariants

> Rules that must hold at all times. Violations = spec bugs or drift.
> Every PR should pass a mental check against these before merge.

---

## I-1: Daemon-Dumb Invariant

The daemon (`@orch/core`) must NEVER call an LLM API directly.

**Check**: `grep -rn "anthropic\|openai\|@anthropic-ai/sdk\|@anthropic-ai/claude-agent-sdk" packages/core/src/`

Allowed occurrences: adapter files that may invoke `claude` or `codex` CLI binaries via `execa`. Forbidden: import statements pulling in SDK clients.

Rationale: LLM calls from orchestration logic create nondeterministic state transitions. Token costs double (one for routing decision, one for actual work). Debugging becomes impossible.

### Red Flags — STOP

- "A tiny LLM call here would simplify the routing logic" → NO, route with code
- "Just an embedding for dedup, not a chat call" → still an LLM call, still forbidden in core
- "We can mock it in tests, real in prod" → two behaviors = I-1 violation anyway
- "Anthropic released a new cheap model" → price is not the point; determinism is

### Rationalization Counter

**Pressure**: "The queue dispatcher would be much simpler if it asked an LLM to classify task types."
**Correct response**: Classification is the daemon's job, via deterministic code over profile.yaml. If profile lacks the field, add a field; don't outsource the decision. I-1 exists because LLM-in-daemon makes token costs double and state nondeterministic — both kill the orchestration guarantee.

**Pressure**: "It's only one call, users will love the smart routing."
**Correct response**: "Only one call" expands. Every deprecated architecture started with "only one." Keep the daemon dumb; put intelligence in workers where it belongs.

---

## I-2: Project-Agnostic Core

No file in `packages/core/src/` may reference "stockforge" or any project-specific term.

**Check**: `grep -rn "stockforge\|StockForge\|vnstock\|VCB" packages/core/src/`

Must return zero results. If a feature seems to require project-specific code, it belongs in:
- Profile schema (configurable field)
- Project's own `.orch/profile.yaml`
- `examples/` folder (for documentation)

### Red Flags — STOP

- "Just a default value keyed to stockforge, users will override" → still hardcoding
- "A comment referencing stockforge makes it clearer" → no, use generic language
- "One test fixture with stockforge-specific data" → put in `examples/stockforge-integration/` not in core tests
- "If we inline the special case, the API is simpler" → APIs are about projection, not shortcuts

### Rationalization Counter

**Pressure**: "StockForge is the only managed project that exists; abstracting is premature."
**Correct response**: Reusability-without-forking is a charter principle. Even with one tenant today, hardcoding makes the second tenant a rewrite. The abstraction cost is ~2 config fields; the rewrite cost is weeks.

**Pressure**: "A hardcoded path is 10× faster to ship than profile plumbing."
**Correct response**: Profile plumbing is already built (see `profile-yaml` skill + T2-004). Using it is one line. Hardcoding is faster only if you skip the review that catches it.

---

## I-3: CLI Subprocess Path (ToS Safety)

Subscription account interactions go through `ccs + claude` CLI, not programmatic SDK.

**Check**: `grep -rn "claude-agent-sdk\|ClaudeSDKClient\|query(" packages/core/src/`

Must return zero results in non-test files.

**Allowed exception**: If user explicitly configures `runtime: "api-key"` in profile and provides their own API key, adapter may use SDK. Default and subscription-account paths use CLI subprocess only.

Rationale: Anthropic ToS (April 2026) explicitly restricts Agent SDK chat sending with subscription accounts. CLI subprocess is the documented path.

### Red Flags — STOP

- "SDK has better types than CLI stdout parsing" → irrelevant, ToS is non-negotiable
- "We'll document that users need api-key" → don't; default path must be ToS-safe
- "One call via SDK for edge case X" → no edge case justifies ToS exposure
- "We can A/B test SDK vs CLI for perf" → no test on subscription account; measure in api-key runtime only
- "Nobody will notice" → Anthropic will; account termination is the worst-case

### Rationalization Counter

**Pressure**: "SDK supports streaming tool use cleanly, parsing CLI is hacky."
**Correct response**: Parse the CLI. The SDK might be cleaner but ToS-unsafe on subscription path. Hacky parser + safe ToS > clean code + account termination risk.

**Pressure**: "Latency is 300ms vs 2s, users will notice."
**Correct response**: Latency is predictable and documented; account termination is catastrophic and unrecoverable. Pick predictable pain over catastrophic risk.

**Pressure**: "The user is an experienced dev, they know the risk."
**Correct response**: Charter says default-safe. Users should not have to opt INTO safety; they opt OUT for api-key runtime. Defaults reflect the highest-risk user profile.

---

## I-4: One-Way Dependency

Managed projects (like StockForge) MUST NOT import or depend on Orch.

**Check**: In any managed project's `package.json`, `@orch/*` packages must be absent.

Rationale: Orch reads projects. Projects never know Orch exists except via `.orch/profile.yaml` (just a data file) and optional hook commands in `.claude/settings.json` (just curl commands).

---

## I-5: Credentials Isolation

Daemon must never read `~/.ccs/`, `~/.claude/`, or any auth file directly.

**Check**: `grep -rn "\.ccs/\|\.claude/" packages/core/src/`

Must return zero results. Authentication is handled by `ccs` and `claude` CLIs themselves.

Rationale: Reduces blast radius if daemon is compromised. Keeps daemon stateless w.r.t. auth.

### Red Flags — STOP

- "Just read ~/.ccs/accounts.json to show which account is active" → call `ccs list` instead
- "We need to know expiry; reading the token file is fastest" → call `ccs status` or similar CLI
- "For testing, touching the file is simpler" → mock the CLI, do not touch real credentials
- "A glob under ~/.claude/ for settings" → prohibited path; find another way

### Rationalization Counter

**Pressure**: "The CLI doesn't expose the info I need, reading the JSON file is the only way."
**Correct response**: Extend the CLI (upstream) or file an issue — not touch the file. Short-term: degrade gracefully without the info. Credentials boundary is a security perimeter, not a convenience.

**Pressure**: "It's read-only, no write, no risk."
**Correct response**: Read-only today; a refactor makes it read-write tomorrow. The check grep for `.ccs/|.claude/` is path-based, not access-mode-based. No exceptions.

---

## I-6: Destructive Operations Require Confirmation

Any operation that:
- Stops a running session
- Deletes a queue item
- Forces account switch
- Clears memory

...must be gated by explicit confirmation (Telegram inline button click OR Web UI modal OR CLI flag `--confirm`).

No "auto-destructive" mode. Even in autonomous execution, destructive ops prompt.

Rationale: Orch runs unattended. A state machine bug that auto-kills sessions could destroy hours of Claude Code work.

### Red Flags — STOP

- "ORCH_SPAWNED=true means we can bypass confirmation" → NO, spawned mode requires pre-authorized flag, not bypass
- "Dry-run mode doesn't need confirmation" → correct, but real ops do
- "The user already confirmed once in this session" → per-operation confirmation, not per-session
- "It's idempotent, re-running is safe" → idempotent ≠ safe; the first run destroyed something

### Rationalization Counter

**Pressure**: "Autonomous loops require destructive ops to chain without prompts."
**Correct response**: Pre-authorize them in the task envelope (e.g., `allow_terminate: true` in the task payload signed by user). The flag replaces the interactive prompt; it does NOT remove the gate. The session still rejects destructive ops without the flag.

**Pressure**: "A reviewer will catch accidents before they commit."
**Correct response**: Reviewers catch code, not runtime state. A deleted queue item is gone; no reviewer can bring it back. The confirmation gate is the last line.

---

## I-7: Localhost Default for Web UI

Web UI server binds to `127.0.0.1` by default. Binding to `0.0.0.0` requires explicit config `web_ui.bind: 0.0.0.0` AND auth token must be set.

**Check**: Default config + startup log must show `127.0.0.1:3737`, not `0.0.0.0`.

Rationale: Daemon has significant power over user's Claude Code sessions. Accidentally exposing to LAN is a real risk.

---

## I-8: Idempotent Hook Receivers

Hook endpoints must be idempotent. Receiving the same hook event twice must not corrupt state.

Implementation: deduplicate by `session_id + hook_type + timestamp` within a 60-second window.

Rationale: Claude Code may retry hooks on network hiccups. Queue state corruption is non-recoverable.

---

## I-9: Structured Logging with Trace Correlation

Every log line from domain or module code must include:
- `level`
- `msg`
- `trace_id` (if within a span)
- `module` (which NestJS module)

Use `pino` with the OTEL context plugin to auto-inject.

---

## I-10: Typed External Input

All external input (profile.yaml, hook payload, Telegram command, Web UI form) must pass through a `zod` schema before entering domain logic.

**Check**: grep for route handlers and Grammy command handlers. Each must call `<Schema>.parse()` on input.

Rationale: Untyped `any` leaking from HTTP or YAML into domain = runtime bugs + TypeScript safety lie.

---

## I-11: No Silent State Transitions

Every session state transition writes a log entry AND an OTEL span event.

State transitions:
- `QUEUED → STARTING`
- `STARTING → RUNNING`
- `RUNNING → ENDING`
- `ENDING → COMPLETED | FAILED | RATE_LIMITED | CONTEXT_FULL`

Missing log = bug. State debugging must be possible from log + traces alone.

---

## I-12: Adapter Failure Isolation

Adapter errors (ccs crashed, claude CLI not found, network timeout) must:
- Be caught at adapter boundary
- Be wrapped in `DomainError` subclass
- Not propagate raw Node errors to domain

```typescript
// WRONG
async spawn() {
  return execa('claude', args); // raw throw on ENOENT
}

// RIGHT
async spawn(): Promise<Session> {
  try {
    const proc = await execa('claude', args);
    return Session.from(proc);
  } catch (e) {
    throw new RuntimeUnavailableError('claude CLI not found or failed', { cause: e });
  }
}
```

---

## I-13: Test Isolation

Unit tests must NOT:
- Spawn real subprocesses
- Make real HTTP calls
- Read real filesystem outside test tmpdir
- Touch real SQLite DB (use in-memory)

Integration tests CAN, but must run in a separate CI job and clean up.

---

## I-14: No Singleton State Outside DI

State is held by NestJS-managed services (DI scope). No module-level `let x = ...` mutable state.

**Check**: `grep -rn "^let\s\|^var\s" packages/core/src/ | grep -v "\.spec\.ts"`

Allowed: `const` imports, pure function outputs, type declarations.

---

## I-15: Token Budget Instrumentation

Every LLM invocation (inside workers, via OTEL spans) must record:
- `gen_ai.usage.input_tokens`
- `gen_ai.usage.output_tokens`
- `gen_ai.usage.cache_read_tokens`
- `gen_ai.request.model`
- `project.id` (custom attribute)

These come from Claude Code's native OTEL emission. Orch just propagates `TRACEPARENT` so they nest under Orch root span.

---

### INV-S9 — Skills/agents/hooks latency budget

Every skill, hook, or agent invocation MUST complete a single fire under **50ms median, 200ms p99** on a developer workstation. Hooks specifically MUST wrap any non-trivial payload work in a fire-and-forget background subshell so the gate completes before the calling tool's wait.

**Rationale**: violations cumulate across thousands of invocations per session and degrade the foreground latency budget that makes autonomous-mode dispatch viable. The 6.1.6 verifier measured `component-telemetry.sh` median=567ms / p99=2527ms (>10× over budget); fix in 6.1.x landed at 71ms median (8× improvement, within budget).

**Origin**: lifted into first-class invariant in 6.5.3 retrospective (was previously embedded in `5.2-skill-evolution-architect.md:902`). Verified at hook level by 6.1.6 substage probes.

**Gate**: `tests/hooks/component-telemetry.spec.ts` (and analogous tests for new hooks/skills) MUST assert median <50ms and p99 <200ms or be SKIP-gated with rationale on platforms where fire-and-forget is not available.

---

## Verification

A PR/commit drifts if it introduces a violation. During autonomous execution, check invariants before declaring a task done:

1. `grep` checks (I-1, I-2, I-3, I-4, I-5, I-14)
2. Type check (I-10, I-12)
3. Log audit on a sample run (I-9, I-11)
4. Manual review of new adapter code (I-12)

Violations detected late are still violations. Fix, don't rationalize.
