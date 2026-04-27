---
title: Self-Application Bootstrap (Dogfooding Harness)
status: normative
ratified_by: Master plan §3 8.5 + Decision 027 §"Consequences" 6 (2026-04-27)
applies_to: scripts/dogfood/, agent-workspace/traces/, agent-workspace/queue/self-tasks/
implementer: substage 8.5.2
dispatch_executor: substage 8.5.3
adversarial_reviewer: substage 8.5.4
authoring_substage: 8.5.1
phase: 8
binding_until: SC-44 closure attestation OR rollback under §4.4 fires
cross_references:
  - PROJECT_CHARTER.md Principle 1 (Daemon-Dumb)
  - PROJECT_CHARTER.md Principle 5 (CLI subprocess)
  - PROJECT_CHARTER.md Principle 7 (Observability)
  - agent-workspace/constitution/architecture.md (module boundaries)
  - agent-workspace/constitution/tenancy-model.md (8.6.1 — file-level scope)
  - agent-workspace/constitution/invariants.md I-1, I-3, I-6, I-9, I-11
  - agent-workspace/memory/decisions/027-phase-8-strategic-redirect.md (effort routing)
  - agent-workspace/memory/decisions/029-tenancy-model-file-level.md
  - agent-workspace/memory/decisions/031-telemetry-sync-wire-format.md (telemetry opt-in default OFF)
  - master plan: agent-workspace/session-plans/pending/phase-8-v2.3-strategic-pivot.md §3 8.5 + §12
---

# Self-Application Bootstrap — dogfooding harness for orch self-tasks

> Orch dispatches its own development work-items through its own queue +
> tracer. The harness is **deterministic glue**, not a re-implementation
> of the dispatcher. LLM reasoning lives only inside the spawned Claude
> Code subprocess (Charter Principle 1 binding). Rollback is one file.

## §1 Goal & non-goals

### §1.1 Goal

Orch's own session plans (e.g.,
`agent-workspace/session-plans/pending/phase-N-*.md`) become dispatchable
through orch's existing queue dispatcher (`@orch/core` `QueueService` +
`SessionManager`) using the same code paths managed projects (StockForge,
etc.) already use. The harness is a **thin invoker**:

1. Read a self-task envelope file from
   `agent-workspace/queue/self-tasks/<id>.yaml`.
2. Validate the envelope through the tenancy resolver (8.6.2).
3. Check rollback marker (`§4`) — if present, no-op exit 0.
4. Build a `SessionPlan` and call `SessionManager.runSession()`.
5. Capture the resulting OTEL trace JSONL to
   `agent-workspace/traces/phase-{N}-{substage}.jsonl`.

The downstream Claude Code subprocess is a normal
`claude --rc` invocation (Charter Principle 5). The subprocess does the
actual work (writes the substage output file, emits subagent
dispatches, etc.); the harness only wires queue → spawn → trace.

### §1.2 Non-goals (binding)

1. **Replacing the master orchestrator session.** The current Claude Code
   session running this Phase-8 plan is NOT a candidate for self-dispatch.
   Self-application is for **sub-tasks within a phase** (e.g. authoring
   `tenancy-model.md` or the OSS architect output), not for whole-phase
   plan execution. The master session remains the human-driven driver;
   dogfood is a downward delegation, never an upward coup.

2. **Self-modifying orch.** Charter Principle 10 — "no feature creep into
   agent intelligence". The harness does not let orch rewrite its own
   dispatcher, mutate `packages/core`, or escalate its own permissions.
   The dogfood subprocess obeys the same I-6 ABSOLUTE (no `git commit`)
   that the master session obeys.

3. **A second dispatcher.** This document defines no parallel queue
   implementation. All self-task dispatches MUST flow through the
   existing `QueueService` + `SessionManager` path; the harness is
   one TS file (`scripts/dogfood/run-self-task.ts`) that adapts a YAML
   envelope into a `SessionPlan` and calls existing methods.

4. **Cross-tenant capability.** Self-application uses the
   `tenancy.user='self'` + `tenancy.project='orch'` scope only. It cannot
   read other tenants' workspaces (8.6.1 §4 cross-tenant isolation
   matrix binding).

5. **Cloud telemetry sync.** Decision 031 binds telemetry sync default
   OFF. Self-app traces are local JSONL only. The seam is reused; the
   sink is null in v2.3.

## §2 Self-application threat model + safeguards

Five named threats (T1–T5). Each has a deterministic safeguard.

### §2.1 T1 — Dogfood breaks main session loop

**Threat**: dogfood harness infinite-loops, hangs on subprocess wait,
deadlocks the SQLite queue claim, or crashes the parent autonomous
orchestrator. The current main Claude Code session dies; autonomous
mode loses continuity; user-typed `continue` cannot recover (no
checkpoint written for the dogfood failure).

**Probability × impact**: LOW × CRITICAL.

**Safeguard layers (defense in depth)**:

1. **Rollback marker** (`§4.4`). A file at
   `agent-workspace/memory/.dogfood-stop` aborts ALL dogfood dispatches
   at the harness entry-point. The master session can plant this marker
   in milliseconds the moment it detects dogfood misbehavior. Recovery
   = `rm` the marker.
2. **Subprocess containment**. The harness spawns `claude --rc` via the
   existing `ClaudeCodeAdapter`; the same SIGTERM → SIGKILL escalation
   used for managed-project sessions applies (`session-manager.ts`
   gracefulEndTimeoutMs path). No new wait semantics introduced.
3. **Watchdog parent check**. Before dispatching, the harness verifies
   `process.ppid` is non-zero AND that env `ORCH_DOGFOOD_PARENT_OK=1`
   is set by the master session at autoloop startup. Missing parent
   sentinel ⇒ refuse dispatch.
4. **Budget cap envelope**. Each self-task envelope MUST set
   `budget_cap_tokens: ≤120000` (master plan budget rule). Exceeded
   ⇒ adapter terminates; failure recorded; queue item Quarantined.

### §2.2 T2 — Dogfood writes to wrong project

**Threat**: dogfood subprocess executes work against StockForge
`agent-workspace/` (or any non-orch tenant); cross-pollutes traces,
session-plans, or memory; tenancy isolation breached.

**Probability × impact**: LOW-MED × HIGH.

**Safeguards**:

1. **Tenancy enforcement** (8.6.2 deliverable). The envelope's
   `tenancy.user='self'` + `tenancy.project='orch'` resolves through
   `packages/core/src/tenancy/scope-resolver.ts`. Resolver REFUSES any
   write outside `agent-workspace/` (backwards-compat shim) for
   `default-user`, OR `agent-workspace/<user>/projects/orch/` for
   explicit-layout installs. See `tenancy-model.md` §3 + §5.
2. **`is_self_app: true` flag** triggers an additional pre-flight
   assertion in the harness: `assert(targetCwd === orchProjectRoot)`
   where `orchProjectRoot = path.resolve(__dirname, '../..')` — the
   harness's own dist location anchors the cwd lock.
3. **Adapter env-var freeze**. `ORCH_USER_ID=self` is propagated as a
   hard env var to the subprocess; the subprocess's
   `tenancy/scope-resolver.ts` reads the same env at startup; mismatch
   between envelope and runtime ⇒ `IsolationError`.

### §2.3 T3 — Dogfood escalates to `git commit`

**Threat**: subprocess autonomously runs `git commit -m ...` on the orch
repo, breaking I-6 ABSOLUTE (Decision 020). Phase 8 hard-stops.

**Probability × impact**: LOW × CRITICAL.

**Safeguards**:

1. **Existing `.husky/pre-commit` hook** rejects commits matching
   the I-6 pattern (orch-staged-only; see `.husky/pre-commit`).
2. **Inline assertion** in the harness: before dispatch, the envelope's
   `prompt_path` is grepped for the literal string `git commit` — match
   ⇒ harness refuses to dispatch (returns exit 2; logs reason).
3. **Subagent prompt prefix injection** (Decision 027 effort routing
   pattern): the harness prepends to every subprocess prompt:
   ```
   <orch-self-app-rules>
   I-6 ABSOLUTE — NO git commit, no `git push`, no destructive operations.
   Stage changes only via `git add`. Stop conditions binding from
   PROJECT_CHARTER.md §"Stop Conditions" + autonomous-protocol.md.
   </orch-self-app-rules>
   ```
   This is text-only; the actual enforcement remains the husky hook.
   Prefix is for in-context reminder.

### §2.4 T4 — Dogfood spawns runaway subprocess tree

**Threat**: subprocess spawns nested subprocesses (`claude --rc` inside
`claude --rc`) without containment; process tree grows unbounded; RSS
breaches charter §N6 72-hour stability target; OS may OOM-kill orch.

**Probability × impact**: LOW × MED.

**Safeguards**:

1. **Existing session-tracker** in `session-manager.ts` (the `active`
   Map keyed by sessionKey). Each dogfood dispatch counts against
   `profile.maxConcurrentSessions` (existing concurrency cap). Default
   for orch self = 1; second concurrent dogfood blocked.
2. **`ORCH_DOGFOOD_DEPTH` env var** propagated to subprocess; if
   subprocess attempts to spawn another dogfood (depth >= 2), the
   nested harness invocation refuses (returns exit 3).
3. **PID-tree audit hook** (existing
   `scripts/hooks/session-start-bootstrap.sh` worktree sweep pattern,
   adapted): a `scripts/hooks/dogfood-tree-audit.sh` (substage 8.5.2
   net-new) emits a count of `claude` processes parented by the dogfood
   PID; >2 ⇒ alert via Telegram (existing pipeline).

### §2.5 T5 — Dogfood telemetry pollutes managed-project traces

**Threat**: dogfood OTEL spans are emitted to the same trace stream as
managed-project traces (StockForge, etc.); cost attribution analysis
mis-categorizes orch-dev tokens as StockForge tokens.

**Probability × impact**: MED × LOW-MED.

**Safeguards**:

1. **Span attribute `span.kind=ORCH_DAEMON_DISPATCH`** on every dogfood
   root span. (Spec §5.) This is the canonical separator. Trace
   queries filter on this kind to isolate dogfood telemetry.
2. **Distinct trace path**. Dogfood traces write to
   `agent-workspace/traces/phase-{N}-{substage}.jsonl`; managed-project
   traces write to `<project>/agent-workspace/traces/...`. No file-level
   collision. (Master plan §1 SC-44 binding.)
3. **`tenancy.user`, `tenancy.project`, `is_self_app=true` attributes**
   redundantly tag the root span, allowing query-time filtering even
   if file routing changes.

## §3 Queue file format for self-tasks

Self-task envelopes are YAML files written to
`agent-workspace/queue/self-tasks/<envelope-id>.yaml`. The harness
reads the file, validates via zod (existing pattern at
`packages/core/src/modules/queue/queue.service.ts` line 39), and
maps to a `SessionPlan` consumable by `SessionManager.runSession()`.

### §3.1 Envelope schema (zod-shaped, normative)

```yaml
# Required: envelope identity
envelope_id: phase-8-8.6.1-tenancy-model-authoring     # globally unique slug
schema_version: "1"                                    # bumps on breaking change

# Required: tenancy scope (defaults render this self-app)
tenancy:
  user: self                  # 'self' | 'orch-daemon'; resolves to ORCH_USER_ID at runtime
  project: orch               # always 'orch' for orch self-app; project-agnostic value
  is_self_app: true           # gates ScopeResolver self-app trace tag (T2 safeguard)

# Required: dispatch routing
subagent_type: master-planner   # master-planner | sandwich-architect | task-implementer | etc.
model: opus                     # opus | sonnet | haiku — Decision 027 routing
effort: max                     # low | high | max — Decision 027 routing (D-H)

# Required: prompt source (NOT inlined — file-based to keep YAML readable)
prompt_path: tasks/phase-8/8.6.1-tenancy-architect-prompt.md

# Required: telemetry path
dispatch_trace_path: agent-workspace/traces/phase-8-8.6.1.jsonl

# Required: rollback marker (T1 safeguard; resolver checks BEFORE dispatch)
rollback_marker_path: agent-workspace/memory/.dogfood-stop

# Required: budget cap (T1 safeguard)
budget_cap_tokens: 120000

# Optional: handoff context for the spawned subagent
handoff:
  prior_substage: 8.0.3
  prior_artifacts:
    - agent-workspace/research/phase-8-config-drift-inventory.md
    - agent-workspace/memory/decisions/028-config-style.md
  expected_output_path: agent-workspace/constitution/tenancy-model.md
  expected_output_min_bytes: 8000

# Optional: I-6 + Charter pre-flight assertions
preflight_assertions:
  - kind: i6_grep
    forbidden_substring: "git commit"
    target: prompt_path
  - kind: tenancy_lock
    expect_user: self
    expect_project: orch
  - kind: budget_envelope
    max_tokens: 120000

# Optional: dispatch metadata (recorded in trace)
metadata:
  authoring_phase: 8
  authoring_substage: "8.5.3"
  master_plan_ref: agent-workspace/session-plans/pending/phase-8-v2.3-strategic-pivot.md
  triggered_by: substage 8.5.3 dogfood checkpoint C2
```

### §3.2 Existing queue file format — unchanged

Managed-project queue files (those parsed by `QueueWatcherService` from
`<project>/session-plans/pending/*.md`) remain Markdown-with-YAML-
frontmatter. The new self-task envelope is **a separate file family**
written to a separate directory (`agent-workspace/queue/self-tasks/*.yaml`).

The existing `QueueService.enqueue()` payload accepts an opaque
`payload: Record<string, unknown>` field (see
`queue.service.ts:47 — payload: z.record(z.string(), z.unknown())`).
The dogfood harness packs the entire envelope into this field with an
extra discriminator `payload._self_app: true`, so existing managed-
project code paths see a normal `QueueItem`. The self-app discriminator
is a payload field, NOT a schema field — backwards-compat preserved.

### §3.3 Worked example — first dogfood checkpoint (8.6.1 tenancy authoring)

File: `agent-workspace/queue/self-tasks/phase-8-8.6.1.yaml`

```yaml
envelope_id: phase-8-8.6.1-tenancy-model-authoring
schema_version: "1"
tenancy:
  user: self
  project: orch
  is_self_app: true
subagent_type: master-planner
model: opus
effort: max
prompt_path: tasks/phase-8/8.6.1-tenancy-architect-prompt.md
dispatch_trace_path: agent-workspace/traces/phase-8-8.6.1.jsonl
rollback_marker_path: agent-workspace/memory/.dogfood-stop
budget_cap_tokens: 110000
handoff:
  prior_substage: 8.0.3
  prior_artifacts:
    - agent-workspace/memory/decisions/029-tenancy-model-file-level.md
  expected_output_path: agent-workspace/constitution/tenancy-model.md
  expected_output_min_bytes: 8000
preflight_assertions:
  - kind: i6_grep
    forbidden_substring: "git commit"
    target: prompt_path
  - kind: tenancy_lock
    expect_user: self
    expect_project: orch
metadata:
  master_plan_ref: agent-workspace/session-plans/pending/phase-8-v2.3-strategic-pivot.md
  triggered_by: substage 8.5.3 dogfood checkpoint C2
```

## §4 Dispatcher entry-point + rollback path

### §4.1 Entry-point

**File**: `scripts/dogfood/run-self-task.ts`
**Wrapper**: `scripts/dogfood/run-self-task.sh` (POSIX) +
`scripts/dogfood/run-self-task.ps1` (Windows) — thin shells that invoke
`node packages/cli/dist/dogfood/run-self-task.js <envelope-path>`.

The TS file is built via existing `pnpm --filter @orch/core build` (it
imports `@orch/core` types) and packaged into the cli dist tree at
`packages/cli/dist/dogfood/run-self-task.js`.

### §4.2 Algorithm (deterministic; daemon-dumb compliant)

```
runSelfTask(envelopePath: string) -> Promise<exit code 0 | 2 | 3>:
  1. Read + parse YAML at envelopePath via zod schema (§3.1).
     On parse error → log + exit 1 (configuration error).
  2. CHECK ROLLBACK MARKER (T1 safeguard):
     if exists(envelope.rollback_marker_path):
       log "dogfood-aborted-by-marker"; exit 0 (graceful no-op).
  3. Run preflight_assertions (T2, T3, T1 safeguards):
     - i6_grep: read prompt_path, fail if any forbidden_substring matches.
     - tenancy_lock: assert envelope.tenancy.user/project match runtime ENV.
     - budget_envelope: assert budget_cap_tokens ≤ MAX_DOGFOOD_BUDGET (120K).
     Failure → exit 2 (preflight rejection).
  4. CHECK PARENT SENTINEL (T1):
     if process.env.ORCH_DOGFOOD_PARENT_OK !== "1":
       log "no-parent-sentinel"; exit 3 (containment refusal).
  5. Resolve scope via tenancy/scope-resolver.ts:
     scopePath = resolveScope(profile=orch, env={ORCH_USER_ID: 'self'}).
  6. Read prompt body from envelope.prompt_path; prepend
     <orch-self-app-rules> block (T3 safeguard).
  7. Build SessionPlan:
       prompt: '/effort ' + envelope.effort + '\n\n' +
               '<orch-self-app-rules>...</orch-self-app-rules>\n\n' +
               (read prompt_path),
       profile: 'self-app',
       budgetCapTokens: envelope.budget_cap_tokens,
       env: { ORCH_USER_ID: 'self', ORCH_DOGFOOD_DEPTH: '1', ... }
  8. Open OTEL root span dogfood.dispatch_substage with attributes from §5.
  9. Call SessionManager.runSession(projectId='orch', plan).
 10. Stream subprocess OTEL events into envelope.dispatch_trace_path.
 11. On result: span.setStatus(result.status); span.end().
 12. Return exit 0 if result.status==='ended'; else exit non-zero.
```

### §4.3 Failure-mode degradation matrix

| Failure | Detection | Degradation | User-visible |
|---|---|---|---|
| Envelope YAML invalid | step 1 zod parse | exit 1 (config error) | log line + envelope path |
| Rollback marker present | step 2 | exit 0 (graceful no-op) | log line; no trace |
| Preflight fails (I-6 / tenancy / budget) | step 3 | exit 2 | log + trace span "preflight_failed" |
| Parent sentinel missing | step 4 | exit 3 (containment) | log line; no dispatch |
| Subprocess spawn fails | step 9 (`RuntimeSpawnError`) | exit 4; queue item Failed; retry up to maxAttempts then Quarantined | trace span with error |
| Subprocess hangs > budget | adapter SIGTERM → SIGKILL | exit 5 (terminated) | trace span "timeout"; queue Failed |
| OTEL endpoint down | tracing.service.ts catches | dispatch proceeds; trace appended to local JSONL only (Decision 031 default) | log "otel-degraded" |
| ScopeResolver isolation refusal | step 5 `IsolationError` | exit 6; abort | log "tenancy-violation" |
| `git commit` slips into subprocess | husky pre-commit hook (existing) | hook rejects | trace span unaffected; commit blocked |

### §4.4 Rollback path (T1 binding safeguard)

**Marker file**: `agent-workspace/memory/.dogfood-stop`
**Marker semantics**: presence ⇒ ALL dogfood dispatches abort cleanly.
**Activation paths**:
1. **Manual**: master Claude Code session writes marker via Edit/Write
   tool when it detects dogfood misbehavior (e.g., subprocess output
   shows runaway loop, RSS spike, or test failures).
2. **Automatic**: existing `autonomous-stop-watchdog.sh` extended to
   write marker if it detects ≥2 dogfood failures in a 10-minute window
   (8.5.2 implementer adds this trigger).
3. **Telegram command**: `/pause-dogfood` (existing Telegram pipeline)
   writes the marker via authenticated HTTP POST to the daemon.
4. **Test (8.5.4)**: adversarial verifier plants the marker before
   dispatching a synthetic envelope; verifies harness exits 0 + writes
   log entry + does NOT spawn any subprocess.

**Recovery**: `rm agent-workspace/memory/.dogfood-stop`. Next dispatch
proceeds normally.

**Marker contents (optional)**: free-form Markdown; if non-empty, the
harness includes the contents in its log line for human-readable
context (e.g., "blocked by 8.5.4 verifier — synthetic test"). Empty
file = unconditional stop with no message.

## §5 OTEL trace path

### §5.1 File location

Each dogfood dispatch writes one JSONL trace file at:

```
agent-workspace/traces/phase-{N}-{substage}.jsonl
```

Example: `agent-workspace/traces/phase-8-8.6.1.jsonl`. Path comes from
envelope's `dispatch_trace_path` field (§3.1). Harness asserts the
parent directory exists (creates if missing); refuses to write outside
`agent-workspace/traces/` (T2 + T5 safeguard via path-prefix check).

### §5.2 Span structure

**Root span**: `dogfood.dispatch_substage`

**Required attributes** (every dogfood root span):

| Attribute | Value | Source |
|---|---|---|
| `span.kind` | `ORCH_DAEMON_DISPATCH` | hardcoded; T5 safeguard separator |
| `phase` | from envelope.metadata.authoring_phase OR parsed from envelope_id | §3 |
| `substage` | from envelope.metadata.authoring_substage OR parsed from envelope_id | §3 |
| `tenancy.user` | `self` | envelope.tenancy.user |
| `tenancy.project` | `orch` | envelope.tenancy.project |
| `is_self_app` | `true` (boolean) | envelope.tenancy.is_self_app |
| `subagent_type` | `master-planner` / `sandwich-architect` / etc. | envelope.subagent_type |
| `model` | `opus` / `sonnet` / `haiku` | envelope.model |
| `effort` | `low` / `high` / `max` | envelope.effort |
| `envelope_id` | full envelope_id string | envelope |
| `dogfood_checkpoint` | `C1` / `C2` / `C3` / `C4` / `C5` | §6 mapping |

**Child spans** (subprocess lifecycle):

1. `dogfood.preflight` — preflight assertions (success/failure)
2. `dogfood.scope_resolution` — tenancy scope-resolver call
3. `dogfood.subprocess_spawn` — adapter `spawn()` (existing span name reused)
4. `dogfood.first_token` — first stdout token from subprocess
5. `dogfood.subprocess_complete` — subprocess exit
6. `dogfood.trace_close` — flush + close JSONL

These nest naturally under the root via `tracing.service.ts withSpan()`
(see service line 75-101). No new tracer code required.

### §5.3 TRACEPARENT propagation

The harness uses existing
`TracingService.injectTraceparentIntoEnv()` (see `tracing.service.ts`
line 127) to propagate the W3C `TRACEPARENT` env var into the
subprocess. The subprocess (Claude Code with OTEL hooks) emits child
spans linked to the parent via standard W3C propagation. Same code
path that managed-project sessions already use; no harness-specific
propagation logic.

### §5.4 Storage policy

- **Local JSONL only in v2.3**. `agent-workspace/traces/*.jsonl` is the
  storage. No remote sync.
- **Decision 031 binding**: telemetry sync is opt-in default OFF;
  `packages/core/src/telemetry/sync-seam.ts` (substage 8.7.3) defines
  the future export wire. Self-app traces flow through the same seam
  if/when sync is enabled.
- **Retention**: traces kept indefinitely on disk; rotation policy
  deferred to v2.4 (out of scope for this document).

## §6 Dogfood checkpoints (≥4 mandatory)

Per master plan §12. Each checkpoint binds an envelope template, an
expected trace file, and success/failure criteria.

### §6.1 C1 — Synthetic smoke test (substage 8.5.2)

**Purpose**: prove harness exists + can dispatch end-to-end before any
real substage runs through it.

**Envelope template**: `agent-workspace/queue/self-tasks/c1-smoke.yaml`
(8.5.2 implementer creates).
**Subagent type**: `task-implementer` (lowest-stakes).
**Prompt**: a trivial "echo the string OK to a fixture file" task at
`tasks/phase-8/c1-smoke-prompt.md`.
**Expected trace**: `agent-workspace/traces/phase-8-c1-smoke.jsonl`.
**Success**: trace contains `span.kind=ORCH_DAEMON_DISPATCH` AND
fixture file `agent-workspace/memory/.dogfood-c1-smoke-output.txt`
contains "OK".
**Failure**: any non-zero exit; envelope re-validated; harness
debugged before C2 attempted.

### §6.2 C2 — Tenancy model authoring (substage 8.5.3)

**Purpose**: orch dispatches 8.6.1 (tenancy model authoring) through
its own queue. First **real** dogfood. (Note: 8.6.1 already authored
by master session in 8.6.1; if 8.5.3 runs AFTER 8.6.1 directly via
master, this checkpoint re-runs with a different prompt that re-derives
the same artifact through dogfood — proof of dogfoodability, not
duplicate authoring.)

**Envelope**: `agent-workspace/queue/self-tasks/phase-8-8.6.1.yaml`
(see §3.3 worked example).
**Subagent type**: `master-planner` (matches 8.6.1 §"authoring_substage").
**Effort**: `max`.
**Expected trace**: `agent-workspace/traces/phase-8-8.6.1.jsonl`.
**Success**:
- Trace contains `span.kind=ORCH_DAEMON_DISPATCH`.
- Trace root span has `subagent_type=master-planner`.
- If artifact re-authoring is enabled: target file
  `agent-workspace/constitution/tenancy-model.md` updated; size matches
  envelope `expected_output_min_bytes`.
- If artifact re-authoring is disabled (mode=verify-only): trace
  contains a `dogfood.verify_only=true` attribute and no file write.
**Failure criteria**:
- Trace missing → re-dispatch.
- `is_self_app=false` in trace → tenancy bug; STOP.
- I-6 violation (commit detected) → STOP entire phase; rollback marker
  planted.

### §6.3 C3 — OSS readiness architect (substage 8.5.3)

**Purpose**: second dogfood; orch dispatches 8.7.1 (OSS-readiness +
config layering + ontology stub) through queue.

**Envelope**: `agent-workspace/queue/self-tasks/phase-8-8.7.1.yaml`
(8.5.3 implementer creates analogous to 8.6.1 example).
**Subagent type**: `sandwich-architect`.
**Effort**: `max`.
**Expected trace**: `agent-workspace/traces/phase-8-8.7.1.jsonl`.
**Success**:
- Trace contains `span.kind=ORCH_DAEMON_DISPATCH`.
- Trace root span has `subagent_type=sandwich-architect`.
- Artifact `agent-workspace/constitution/config-layering.md` produced
  (or verified-only as in C2).
**Failure**: same pattern as C2.

### §6.4 C4 — CF-21 telemetry first real read (substage 8.8.1)

**Purpose**: SC-39 retry decision at 8.8.1 reads CF-21 correlation
match-rate from a dogfood-emitted trace; demonstrates feedback loop
(orch's own telemetry drives orch's own decision).

**Envelope**: implicit. 8.8.1 master-planner reads
`agent-workspace/traces/phase-8-*.jsonl` files (the C2 + C3 traces)
plus the existing CF-21 dispatch.jsonl, computes match rate, writes
Decision 032.
**Subagent type**: `master-planner` (decision authoring).
**Expected output**: `agent-workspace/memory/decisions/032-sc39-retry-or-defer.md`.
**Success**:
- Decision file exists.
- Decision cites correlation match rate from dogfood trace data.
- Decision rationale references at least one of the C2/C3 traces.
**Failure**: decision file missing OR cites no telemetry → 8.8.1 retry
under master session (non-dogfood).

### §6.5 C5 (optional) — Rollback path test (substage 8.5.4)

**Purpose**: adversarial verifier proves the rollback marker actually
stops dispatch. Not counted toward SC-44's "≥2 substages dogfooded"
requirement; counts toward SC-44's "rollback path tested" requirement.

**Envelope**: any from §6.1–§6.4, dispatched in dry-run mode.
**Setup**: 8.5.4 verifier plants
`agent-workspace/memory/.dogfood-stop` with contents "test by 8.5.4
verifier".
**Action**: invoke `node scripts/dogfood/run-self-task.ts <envelope>`.
**Expected behavior**:
- Exit 0.
- Log line includes "dogfood-aborted-by-marker" + marker contents.
- NO subprocess spawned.
- NO trace file written.
- Main session unaffected; subsequent dispatches (after marker
  removal) proceed normally.
**Success criteria**: all 5 expected behaviors observed.
**Failure**: any subprocess spawn attempt during marker presence ⇒
T1 safeguard broken; harness defective; STOP phase.

### §6.6 SC-44 closure binding

SC-44 deterministic gate (master plan §1):
```
ls agent-workspace/traces/phase-8-*.jsonl | wc -l ≥ 2
each trace contains span.kind=ORCH_DAEMON_DISPATCH
```

C2 + C3 satisfy the count (≥2). C5 satisfies the rollback test.

## §7 Sub-task design (informs 8.5.2 / 8.5.3 / 8.5.4 implementers)

Authoritative input/output spec for downstream sub-tasks. The
orchestrator dispatches each sub-task with the envelope below.

| Sub-task | Input | Output | Effort | Model | Dispatch |
|---|---|---|---|---|---|
| **8.5.2** Dogfood harness implementation | This document §3-§5 + tenancy-model.md §3-§5 | `scripts/dogfood/run-self-task.ts` (~300-450 LOC) + `scripts/dogfood/run-self-task.sh` + `scripts/dogfood/run-self-task.ps1` + zod envelope schema (`packages/core/src/dogfood/envelope-schema.ts`, ~80 LOC) + smoke-test fixture (envelope C1 + prompt + expected output checker) + `scripts/hooks/dogfood-tree-audit.sh` (T4 safeguard) + 8 unit tests (envelope parse, preflight, rollback marker, scope resolution, span attribute presence, exit-code mapping, parent sentinel check, isolation refusal) | high | sonnet | task-implementer with this doc as `spec` |
| **8.5.3** Dispatch C2 + C3 + C4 | §6 checkpoints + 8.6.1 + 8.7.1 prompt files prepared by master at `tasks/phase-8/8.6.1-tenancy-architect-prompt.md` and `tasks/phase-8/8.7.1-oss-architect-prompt.md` | 2 trace JSONL files at `agent-workspace/traces/phase-8-{8.6.1,8.7.1}.jsonl`; each validated against §5 attribute checklist; C4 decision file produced via dogfooded master-planner in 8.8.1 | medium | sonnet | task-implementer with §6.2 + §6.3 envelopes |
| **8.5.4** Adversarial verifier | §2 threat model + §4.4 rollback path | Adversarial verifier report at `agent-workspace/memory/audits/phase-8-8.5.4-dogfood-verify.md` covering: T1-T5 safeguard validation, C5 rollback test execution evidence, main-session continuity confirmation (master Claude Code session running before/during/after verifier), residual-risk catalogue. ≥5 evidence rows. | max | opus | sandwich-verifier with full §1-§6 read |

### §7.1 8.5.2 deliverable detail

**File: `scripts/dogfood/run-self-task.ts`**

Public surface:
```ts
export interface DogfoodEnvelope {
  envelope_id: string;
  schema_version: '1';
  tenancy: { user: 'self' | 'orch-daemon'; project: 'orch'; is_self_app: boolean };
  subagent_type: string;
  model: 'opus' | 'sonnet' | 'haiku';
  effort: 'low' | 'high' | 'max';
  prompt_path: string;
  dispatch_trace_path: string;
  rollback_marker_path: string;
  budget_cap_tokens: number;
  handoff?: { /* see §3.1 */ };
  preflight_assertions?: PreflightAssertion[];
  metadata?: Record<string, unknown>;
}

export type PreflightAssertion =
  | { kind: 'i6_grep'; forbidden_substring: string; target: string }
  | { kind: 'tenancy_lock'; expect_user: string; expect_project: string }
  | { kind: 'budget_envelope'; max_tokens: number };

export async function runSelfTask(envelopePath: string): Promise<number>;
```

Implementer must NOT fork `QueueService` or `SessionManager`. Must
import existing classes via `@orch/core` and call methods. Implementer
may add ONE new method to `SessionManager` (e.g., `runSelfTaskSession`)
if the existing `runSession` API is insufficient — but only with a
written rationale documenting why a separate method is needed.

Test count: 8 unit tests minimum (one per algorithmic step in §4.2).
Test framework: vitest (existing).

### §7.2 8.5.3 deliverable detail

For C2 and C3, implementer:
1. Reads §3.3 worked example envelope.
2. Adapts envelope to substage-specific values (model, effort, prompt
   path).
3. Writes envelope to `agent-workspace/queue/self-tasks/`.
4. Invokes `node scripts/dogfood/run-self-task.ts <envelope>` once
   per checkpoint.
5. Validates trace file presence + attribute completeness using a
   `scripts/audit/validate-dogfood-trace.sh` (8.5.2 net-new).
6. Records dispatch outcome in completion report.

For C4 (CF-21 telemetry read at 8.8.1): NOT 8.5.3's responsibility.
8.8.1 master-planner reads the C2 + C3 trace files. 8.5.3 only
ensures C2 + C3 traces exist with valid CF-21 correlation fields.

### §7.3 8.5.4 deliverable detail

Adversarial verifier MUST:
1. Read this document end-to-end.
2. Read 8.5.2 + 8.5.3 outputs.
3. Execute C5 rollback test (§6.5) and capture evidence.
4. Probe each of T1-T5 with a designed scenario; document outcome.
5. Confirm main session continuity by checking
   `agent-workspace/memory/.transcript-tokens` before, during, after
   the verifier's own dogfood probes — same value or growing as
   expected; no crash markers; no `.dogfood-stop` from autonomous-
   watchdog auto-trigger.
6. Catalogue residual risks not addressed by safeguards.
7. Issue PASS / DONE_WITH_CONCERNS / BLOCKED verdict with rationale.

If verdict = BLOCKED: phase 8 STOP-2 (escalation per autonomous-
protocol). Master session reads the verifier report, decides patch +
re-verify OR rollback to non-dogfood C2 + C3 execution.

## §8 Backwards-compat + project-agnostic

### §8a Existing queue file format unchanged

Managed-project session-plan files at
`<managed-project>/session-plans/pending/*.md` continue to be parsed
by `QueueWatcherService` exactly as today. Self-task envelopes live
in a separate directory family (`agent-workspace/queue/self-tasks/`)
and use a separate file extension (`.yaml`). No change to the
existing watcher-debounce-frontmatter pipeline.

The single touchpoint to `QueueService.enqueue` is the payload field
(already opaque `Record<string, unknown>` per zod schema). Adding
`payload._self_app: true` is forward-compatible with existing
managed-project payloads (which have no such field; default false at
read time).

### §8b Project-agnostic preserved

`scripts/dogfood/run-self-task.ts` is generic. The hardcoded value
`tenancy.project: 'orch'` lives in the envelope file (user-supplied),
NOT in the harness code. A community member dogfooding their own
project simply writes envelopes with their own project slug:

```yaml
tenancy:
  user: self
  project: their-project-slug
  is_self_app: true
```

The harness's only orch-specific assumption is the dist location of
the harness binary (anchored via `path.resolve(__dirname, '../..')`)
— which is project-local for each install. No `if (project ===
'orch') { ... }` branches anywhere in the harness.

### §8c NPM publishability

When orch is published as `@orch/cli` on npm (substage 8.7.5), the
dogfood harness ships under `@orch/cli/dist/dogfood/run-self-task.js`.
Downstream community installs receive the harness automatically;
they enable it by writing their own envelopes under
`<their-orch-home>/queue/self-tasks/`. Documentation lives in
`docs/dogfood-harness.md` (substage 8.7.4 OSS docs deliverable; not
mandated by this 8.5.1 document but flagged for 8.7.4 to pick up).

## §9 Open questions (8.5.2 implementer may resolve via Decision-And-Move)

Per autonomous-protocol Rule 7 (Document-And-Move). The 8.5.2
implementer is authorized to resolve the following without escalation,
provided the resolution is documented in
`agent-workspace/memory/decisions/NNN-*.md`:

### §9.1 Q-1: Synchronous vs asynchronous dispatch

**Question**: should `runSelfTask` block until the subprocess completes
(synchronous; harness returns the exit code of the subprocess), or
return immediately after enqueueing (asynchronous; harness returns
the queue item ID and the master polls for completion)?

**Default (orchestrator pre-binds)**: synchronous in v2.3. Easier
debugging; matches existing `SessionManager.runSession()` semantics
(which already returns a `Promise<SessionResult>`). Asynchronous
mode deferred to v2.4 if a use-case emerges.

**Implementer authority**: switch to asynchronous if synchronous proves
to deadlock the master; document the deadlock evidence + rationale.

### §9.2 Q-2: Where to surface dogfood traces in the Web UI

**Question**: does the Web UI dashboard show dogfood dispatches
inline with managed-project dispatches, or in a separate "Self-app"
tab?

**Default**: inline, with the `span.kind=ORCH_DAEMON_DISPATCH` badge.
Avoids UI fragmentation. (Does not block 8.5.2 — UI work is 8.7.x or
v2.4.)

**Implementer authority**: defer entirely to UI substage; 8.5.2
ships harness + traces only.

### §9.3 Q-3: Does C2 re-author or verify-only?

**Question**: when C2 dispatches the 8.6.1 master-planner against a
prompt that re-derives the tenancy-model.md artifact, does the
subprocess overwrite the existing 8.6.1 file, or run in
verify-only mode (read existing, emit a delta report)?

**Default**: verify-only mode for C2 + C3 in v2.3. Re-authoring during
dogfood risks divergence between master-session-authored and
dogfood-authored artifacts; verify-only proves dogfoodability without
overwrite risk. Re-authoring mode unlocks in v2.4 once master vs
dogfood divergence patterns are characterized.

**Implementer authority**: choose mode per envelope via a new optional
field `dogfood_mode: re_author | verify_only` (default `verify_only`).

### §9.4 Q-4: Can the master session itself be a dogfood subprocess?

**Question**: §1.2 non-goal 1 binds "no replacing master orchestrator".
Could the master, late in Phase 9 or v2.4, voluntarily restart itself
through dogfood (handoff its own work-in-progress)?

**Default**: NO in v2.3. Master session restart goes through the
existing self-reboot mechanism (`scripts/session-self-reboot.sh`),
which is OS-level keystroke injection — not a dogfood path. Mixing
the two creates the T1 risk surface enormously.

**Implementer authority**: cannot override this default; escalation
to master-planner required if 8.5.2 implementer wants to challenge.

## §10 Charter coherence

- **Charter Principle 1** (Daemon-Dumb): harness is deterministic glue
  in TS; LLM calls happen only inside the spawned `claude --rc`
  subprocess. Verified: §4.2 algorithm has no LLM call; §1.2 non-goal
  3 binding.
- **Charter Principle 5** (CLI subprocess): subprocess is `claude --rc`
  via existing `ClaudeCodeAdapter`. Verified: §4.2 step 9.
- **Charter Principle 7** (Observability): every dogfood dispatch emits
  a root span at `agent-workspace/traces/`. Verified: §5.
- **Charter Principle 3** (Project-agnostic core): harness has zero
  orch-specific branches. Verified: §8b.
- **Charter Principle 8** (Reusable without forking): community can
  use harness with their own envelopes. Verified: §8c.
- **Charter Principle 10** (No feature creep into agent intelligence):
  harness does not add intelligence to daemon; subprocess is the
  Claude Code session that already had intelligence. Verified: §1.2
  non-goal 2.
- **I-6 ABSOLUTE** (Decision 020): zero `git commit` in harness, in
  envelope, in subprocess prompt prefix. Verified: §2.3 T3
  safeguards 1+2+3.
- **Decision 027 effort routing** (D-H): harness reads `effort` from
  envelope, prepends `/effort <mode>` to subprocess prompt.
  Verified: §4.2 step 7.
- **Decision 029 / tenancy-model.md** binding: harness uses
  `scope-resolver.ts` (8.6.2 deliverable) for tenancy; envelope sets
  `tenancy.user='self'` + `tenancy.project='orch'`; verified: §2.2
  T2 safeguard + §3.1 envelope schema.
- **Decision 031 telemetry-sync** binding: traces are local JSONL
  only; sync is opt-in default OFF. Verified: §5.4.
- **autonomous-protocol Rule 7** (Document-And-Move): §9 lists open
  questions with pre-bound defaults; implementer authorized to resolve
  via decision file. Verified.

## §11 Cross-references

- **Master plan** §3 8.5 + §12: substage breakdown + dogfood
  checkpoints — `agent-workspace/session-plans/pending/phase-8-v2.3-strategic-pivot.md` lines 129-136 + 319-324.
- **Tenancy model** (8.6.1 ratified): `agent-workspace/constitution/tenancy-model.md` §3 (folder layout) + §4 (isolation) + §5 (resolveScope algorithm). Required dependency for §2.2 T2 + §3.1 + §4.2 step 5.
- **Architecture** doc: `agent-workspace/constitution/architecture.md` Layer 2 modules (queue, sessions, tracing) + Layer 3 adapters (claude-code-adapter). Harness operates at the application layer above these.
- **Charter**: `PROJECT_CHARTER.md` Principles 1, 3, 5, 7, 8, 10.
- **Invariants**: `agent-workspace/constitution/invariants.md` I-1, I-3, I-6, I-9, I-11.
- **Decision 027** (Phase 8 redirect): `agent-workspace/memory/decisions/027-phase-8-strategic-redirect.md` §"Consequences" 5 (effort routing) + 6 (self-application baseline).
- **Decision 029** (tenancy file-level): `agent-workspace/memory/decisions/029-tenancy-model-file-level.md`.
- **Decision 031** (telemetry sync wire format): `agent-workspace/memory/decisions/031-telemetry-sync-wire-format.md`.
- **Existing queue + session + tracing modules**:
  - `packages/core/src/modules/queue/queue.service.ts` (envelope payload field at line 47).
  - `packages/core/src/modules/sessions/session-manager.ts` (`runSession` line 220; concurrency cap line 194-202).
  - `packages/core/src/modules/sessions/claude-code-adapter.ts` (subprocess spawn).
  - `packages/core/src/modules/tracing/tracing.service.ts` (`withSpan` line 75; `injectTraceparentIntoEnv` line 127).
- **Implementer downstream**: substage 8.5.2 (`scripts/dogfood/run-self-task.ts` + envelope schema + 8 unit tests); substage 8.5.3 (C2 + C3 envelopes + dispatches); substage 8.5.4 (adversarial verifier report).

**END Self-Application Bootstrap.**
