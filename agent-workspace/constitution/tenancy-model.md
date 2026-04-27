---
title: Tenancy Model
status: normative
ratified_by: Decision 029 (2026-04-27)
applies_to: agent-workspace/, packages/core/src/tenancy/, examples/multi-user/
implementer: substage 8.6.2
reviewer: substage 8.6.3
authoring_substage: 8.6.1
phase: 8
binding_until: file-level proves inadequate (see §8)
cross_references: [Decision 029, Decision 031, Charter §"Craft Philosophy", Charter Principle 8, Charter line 116, Master plan §3 8.6, Master plan §10 D-C]
---

# Tenancy Model — file-level workspace separation

> Multi-user / multi-project tenancy for orch. Default: **file-level** workspace
> separation (per-user + per-project subdirectory). Daemon-level multi-tenant
> deferred to v2.4 unless file-level proves inadequate against §8 thresholds.
> Personal-first; sharing is opt-in.

## §1 Goals

1. Two users (primary + 1 colleague — user-brief §1.6) can run the same orch
   installation against shared + personal projects on a single workstation OR
   each on their own machine.
2. Cross-tenant isolation by default — user A cannot read user B's personal
   traces, queues, memory, or session-plans.
3. Charter-coherent (personal-first; team-sharing is opt-in; charter §"Craft
   Philosophy" line 39 "Build for personal use first, team-share second").
4. Backwards-compatible — existing single-user installs (current
   `agent-workspace/` flat layout) keep working with **zero migration** by
   defaulting to `ORCH_USER_ID=default-user` AND a flat-layout shim.
5. Charter line 116 ("Not a multi-tenant system. Each user runs their own
   daemon.") preserved as the canonical mental model — file-level is the cheap
   practical fallback for the 1-machine 2-user case, NOT a SaaS pivot.
6. Reversible to daemon-level (Option B per Decision 029) without rewriting
   path conventions; the v2.4 upgrade adopts each `<user-id>/` subtree as the
   per-daemon data root.

## §2 Scope identifiers

- **user**: `ORCH_USER_ID` env var (default `default-user`). User-scope is the
  highest-tenant identifier.
- **project**: profile.yaml `projectId` field (existing convention,
  `packages/core/src/domain/profile.ts` lines 119-131; URL-safe lowercase
  with hyphens).
- **scope**: ordered pair `(user, project)`. Every workspace path resolves
  through a `(user, project)` scope, never standalone.
- **tenancy mode**: per-project, declared in `profile.yaml` under
  `tenancy.mode: personal | shared` (default `personal` for backwards-compat;
  see §3.3).

## §3 Folder layout

### §3.1 Single-user backwards-compat (current layout — preserved)

When `ORCH_USER_ID` is unset OR explicitly `default-user` AND no
`agent-workspace/<user-id>/` subdirectory exists, orch uses the **flat shim**:

```
agent-workspace/
  ├── memory/
  ├── session-plans/
  ├── traces/
  ├── research/
  ├── constitution/
  └── ontology/
```

This matches the v2.2 layout exactly. No migration required. (Decision 029
Consequence 1 binds this default; Decision 029 Consequence 7 confirms
"each user owns their dir tree" remains the mental model for single-user
installs.)

### §3.2 Multi-user explicit layout (`ORCH_USER_ID` set, multi-user dir present)

```
agent-workspace/
  ├── <user-id>/                      # per-user root; OS ACL 0700 (POSIX) or
  │   │                               # icacls deny-others (Windows)
  │   ├── projects/
  │   │   ├── <project-slug>/         # per (user, personal-project) workspace
  │   │   │   ├── memory/
  │   │   │   │   ├── sessions/
  │   │   │   │   ├── checkpoints/
  │   │   │   │   └── decisions/
  │   │   │   ├── session-plans/
  │   │   │   ├── traces/             # personal traces — private
  │   │   │   ├── research/
  │   │   │   └── queue/
  │   │   └── <other-project>/...
  │   ├── settings.local.yaml         # personal overlay (gitignored)
  │   └── ORCH_CONTEXT.local.md       # personal context (gitignored)
  └── shared-projects/
      └── <shared-project-slug>/      # shared project: multiple users contribute
          ├── memory/
          │   └── decisions/          # shared cross-user decisions log
          ├── session-plans/
          │   └── pending/            # shared queue (mutex-protected; §4)
          ├── traces/                 # all participants; each trace tagged
          │                           # with user_id; orch refuses cross-user
          │                           # write per Decision 029 §"Cross-tenant
          │                           # isolation guarantees"
          └── queue/
```

(Folder structure matches Decision 029 §"Folder structure" lines 80-106
verbatim; this document re-anchors it as the normative path convention for
substage 8.6.2 implementation.)

### §3.3 Shared project zone (opt-in)

A project becomes "shared" when its `profile.yaml` declares:

```yaml
tenancy:
  mode: shared
  participants: [<user-id-A>, <user-id-B>]
```

When `tenancy.mode: shared`, orch resolves the project workspace under
`agent-workspace/shared-projects/<slug>/` rather than
`agent-workspace/<user-id>/projects/<slug>/`. Mode defaults to `personal`
(no migration cost for existing profiles).

Shared-zone semantics:
- **Append-only logs**: traces, decisions, sessions are write-once; no truncate.
- **Mutex on session-plans/queue**: only one user dispatches at a time;
  enforced by `tenancy/scope-resolver.ts` via filesystem lock per Decision 029
  §"Cross-tenant isolation" line 137.
- **Tag-on-write**: each trace file's leading JSONL line carries
  `user_id: <originating-user>`. Cross-user write of a tagged trace is
  refused at runtime.

## §4 Cross-tenant isolation guarantees

Resources × actors matrix (≥9 cells per Part-C gate 4):

| Resource | Owner-user (e.g. user-A) | Same-tenant peer (user-A on shared project, user-B participating) | Different-tenant user (user-B with no participant declaration) |
|---|---|---|---|
| `<user-A>/projects/X/memory/` | RW | NONE (not exposed; OS ACL 0700) | NONE (OS-enforced) |
| `<user-A>/projects/X/traces/` | RW | NONE | NONE |
| `<user-A>/settings.local.yaml` | RW (gitignored) | NONE | NONE |
| `<user-A>/ORCH_CONTEXT.local.md` | RW (gitignored) | NONE | NONE |
| `shared-projects/X/session-plans/pending/` | RW (mutex) | RW (mutex) | NONE (not in `participants:`) |
| `shared-projects/X/traces/` | append-only; tag=user-A | append-only; tag=peer | NONE (refused) |
| `shared-projects/X/memory/decisions/` | append-only | append-only | NONE |
| `shared-projects/X/queue/` | RW (mutex) | RW (mutex) | NONE |
| Telemetry config (`~/.orch/telemetry.json`) | user-scope only (Decision 031) | NONE | NONE |

Total cells: 9 resources × 3 actors = 27 enforcement statements.

Defense in depth (per Decision 029 line 142):
1. **OS layer (primary)**: POSIX `chmod 700` on `<user-id>/`; Windows
   equivalent `icacls /grant:r <user>:(OI)(CI)F /inheritance:r`.
2. **Runtime layer (backup)**: `packages/core/src/tenancy/scope-resolver.ts`
   reads `ORCH_USER_ID` at startup and refuses to write outside
   `<that user>/projects/...` or `shared-projects/<allowed>/...`. Defends
   against OS-ACL misconfiguration.

## §5 Scope resolution algorithm

Pseudocode (substage 8.6.2 implements as `scope-resolver.ts`):

```
resolveScope(profile, env) -> ScopePath:
  1. user_id = env.ORCH_USER_ID ?? "default-user"
  2. project_slug = profile.projectId
  3. tenancy_mode = profile.tenancy?.mode ?? "personal"

  4. if tenancy_mode == "shared":
       4a. assert user_id in profile.tenancy.participants
           else throw NotAParticipantError
       4b. return "agent-workspace/shared-projects/" + project_slug

  5. // personal mode
  6. if user_id == "default-user":
       6a. // BACKWARDS-COMPAT SHIM
       6b. if exists("agent-workspace/<user-id>/projects/...") AS
              dir-tree-with-multi-user-content:
             return "agent-workspace/" + user_id + "/projects/" + project_slug
           else:
             // existing flat-layout install — preserve as-is
             return "agent-workspace"  // flat root
  7. return "agent-workspace/" + user_id + "/projects/" + project_slug
```

**Backwards-compat shim** (per 8.0.3 completion-report concern; Decision 029
Consequence 1):

- Step 6a/6b detects existing flat-layout installs and returns
  `agent-workspace/` directly (no `<user-id>/` nesting).
- Trigger: `ORCH_USER_ID` unset OR equal to `default-user` AND no
  `agent-workspace/default-user/` subdirectory exists.
- Single-user installs upgrading from v2.2 → v2.3 see no behavior change.
- The shim is opt-out: setting `ORCH_USER_ID` to anything other than
  `default-user` (or creating `agent-workspace/default-user/`) graduates the
  install into the §3.2 explicit layout.

## §6 Demo scenarios (substage 8.6.2 implementer must cover all four)

Master plan §3 8.6 line 142 mandates 4 scenarios; `examples/multi-user/demo.sh`
must cover each end-to-end with `bash demo.sh` exit 0 (SC-45 deterministic
gate per master plan §1 line 30-31).

### §6.1 Scenario 1 — Shared project, both users RW (mutex-coordinated)

- Setup: `examples/multi-user/shared-projects/joint-spike/profile.yaml`
  with `tenancy: { mode: shared, participants: [alice, bob] }`.
- Action: Alice drops `task-A.md` into `joint-spike/session-plans/pending/`;
  Bob drops `task-B.md` simultaneously.
- Expected: both files accepted (mutex serializes write); orch dispatches
  in arrival order; both traces emitted under `joint-spike/traces/` tagged
  with originating user_id.
- Verify: `joint-spike/traces/*.jsonl | wc -l` ≥ 2; each leading line
  contains `user_id: alice` OR `user_id: bob`; no overwrite.

### §6.2 Scenario 2 — Shared project, personal token (rate-limit failover)

- Setup: same `joint-spike` shared project; Alice's ccs profile rate-limits
  mid-task; orch fails over to her personal backup ccs profile (per Charter
  F3 + ccs research notes).
- Action: Alice's task continues with her own personal ccs token; trace
  remains under `joint-spike/traces/` tagged `user_id: alice`.
- Expected: Bob's separate ccs token is **never** consulted; cross-user
  token leak prevented.
- Verify: trace span attribute `ccs_profile` carries Alice's profile name
  only; Bob's profile name does not appear in Alice's trace JSONL.

### §6.3 Scenario 3 — Personal projects per user (full isolation)

- Setup: Alice owns `personal-alice/` under
  `agent-workspace/alice/projects/`; Bob owns `personal-bob/` under
  `agent-workspace/bob/projects/`.
- Action: Each user dispatches a task in their own personal project.
- Expected: each trace lands under its owner's `<user>/projects/<slug>/traces/`;
  no cross-pollination.
- Verify: `find agent-workspace/alice/projects/personal-alice/traces -type f
  | wc -l` ≥ 1; same for bob; cross-glob `find agent-workspace/alice ...
  -path '*bob*'` returns 0 hits.

### §6.4 Scenario 4 — Cross-tenant isolation probe

- Setup: Alice's daemon process (with `ORCH_USER_ID=alice`) attempts to
  read `agent-workspace/bob/projects/personal-bob/traces/*.jsonl`.
- Expected: `scope-resolver.ts` refuses the read (returns `IsolationError`);
  OS ACL on `bob/` denies the read at the syscall layer as a backup.
- Verify: probe script exit code = 1; stderr contains `IsolationError` OR
  `EACCES`; trace fixture itself remains unread.

(Decision 029 §"For the 2-user demo (`examples/multi-user/`)" lines 108-127
specifies the demo skeleton; this document fixes the 4 scenarios that the
demo must cover for SC-45 deterministic-gate green.)

## §7 Migration plan (v2.2 → v2.3)

Migration is **OPT-IN**, never required. Existing single-user installs work
without any user action.

### §7.1 No-op default (existing installs)

`ORCH_USER_ID` unset; `agent-workspace/` flat layout preserved; profile.yaml
has no `tenancy:` block (defaults to `personal`). Orch operates identically
to v2.2.

### §7.2 New install via `orch init`

`orch init` flow prompts for `ORCH_USER_ID` (default offer = SHA-256-truncated
hash of `git config user.email`, falls back to `default-user`). The chosen
ID writes to `~/.orch/profile.local.yaml` per Decision 029 Consequence 9
(gitignored, mirroring Claude Code `CLAUDE.local.md` pattern). New installs
land in §3.2 explicit layout from day 1.

### §7.3 Optional one-shot rehome script

`scripts/migration/v2.3-tenancy-rehome.sh` (substage 8.6.2 deliverable):

- Default OFF; user opts in by running the script explicitly.
- One-shot: re-roots `agent-workspace/{memory,session-plans,traces,research,
  ontology}` into `agent-workspace/<chosen-user-id>/projects/<slug>/`.
- Idempotent: safe to re-run (detects if rehome already happened; no-op
  in that case). Reversible via `--rollback` flag.

### §7.4 Backwards-compat shim retention horizon

The §5 step-6 backwards-compat shim is **permanent**, not a transition
period. It is part of the normative model: "single-user installs use flat
layout" is a first-class behavior, not a deprecation path. The shim only
yields when `ORCH_USER_ID` is set to a non-default value.

## §8 Daemon-level fallback condition

File-level (Decision 029 Option A) is adequate as long as ALL the following
numerical thresholds hold (≥3 thresholds per Part-C gate 8):

1. **Concurrency**: ≤5 concurrent users per machine.
2. **Workspace size**: ≤100 GB total `agent-workspace/` size.
3. **Cross-tenant query rate**: ≤10 queries/min cross-tenant access (the
   resolver-refusal counter exposed at `/internal/tenancy-stats`).
4. **Daemon RSS at steady state**: ≤500 MB with all tenants active
   (Decision 029 line 153 trigger 1).
5. **Queue tail latency**: SQLite p99 latency for queue-claim < 5s sustained
   (Decision 029 line 154 trigger 2).
6. **Security audit gap**: zero documented tenancy-isolation bypass findings
   that cannot be patched by a <50-LOC `scope-resolver.ts` change
   (Decision 029 line 155 trigger 3).

If any one threshold breaches sustained for ≥1 week of dogfood usage OR a
single critical security finding lands, daemon-level multi-tenant
(Decision 029 Option B) becomes warranted; v2.4 design is out of scope here.
v2.4 backlog carries "tenancy daemon-level upgrade" as the placeholder
(Decision 029 Consequence 8). Substage 8.6.1 commits to file-level for v2.3.

## §9 Charter coherence

- **Charter §"Craft Philosophy"** (line 39): "Build for personal use first,
  team-share second" — file-level adds the team-share dimension cheaply
  (one nested dir level + one env var) without bloating personal-use.
- **Charter Principle 2** ("Tight scope", line 55): tenancy is in scope
  per user-brief §1.6; not generic multi-tenancy SaaS.
- **Charter Principle 3** ("Project-agnostic core", line 57): per-project
  tenancy declaration in `profile.yaml`, not hardcoded in core.
- **Charter Principle 8** ("Reusable without forking", line 67): tenancy-aware
  paths still allow `orch init` zero-config for solo install (backwards-compat
  shim §5).
- **Charter line 116** ("Not a multi-tenant system. Each user runs their
  own daemon."): preserved as canonical mental model. File-level is the
  practical fallback for 1-machine 2-user case (user-brief §1.6); each
  user still owns their dir tree (Decision 029 line 146 + Consequence 7).
- **I-6 ABSOLUTE preserved**: tenancy adds zero autonomous git operations.
  The `tenancy/scope-resolver.ts` is pure-functional path resolution.
- **Decision 031 cross-binding**: telemetry sync is user-scope only; this
  decision ratifies that user-scope is the highest tenant identifier.

## §10 Charter-coherence review checklist (for substage 8.6.3 reviewer)

≥5 items per Part-C gate 6:

1. **Default behavior preservation**: Does the default (no `ORCH_USER_ID` set,
   existing flat layout) match v2.2 single-user experience exactly?
   → **YES**. §3.1 + §5 step 6a/6b. Backwards-compat shim is permanent.

2. **Opt-in sharing**: Does cross-user sharing require explicit opt-in via
   `profile.yaml` `tenancy.mode: shared`?
   → **YES**. §3.3. Default mode = `personal`. Cross-user participants must
   be explicitly listed.

3. **Machine-local paths**: Are all paths machine-local (no network
   filesystem assumptions in v2.3)?
   → **YES**. §3 path conventions are filesystem-local; no NFS/SMB/cloud
   storage assumptions. v2.4 may revisit network FS.

4. **Tight-scope respect (Charter Principle 2)**: Does multi-user model
   add features beyond user-brief §1.6 scope?
   → **NO**. The 2-user case (primary + 1 colleague) is the binding scope;
   §8 thresholds gate any expansion. SaaS is explicit OOS.

5. **I-6 ABSOLUTE compliance**: Does this require autonomous git commits?
   → **NO**. `scope-resolver.ts` is pure-functional path math; no git ops.
   Migration script `v2.3-tenancy-rehome.sh` is opt-in only and stages
   changes for user review (no commit).

6. **Decision 029 fidelity**: Does this document concretize Decision 029
   without contradicting any Consequence (lines 172-184)?
   → **YES**. Folder structure §3 mirrors Decision 029 lines 80-106;
   isolation guarantees §4 mirror Decision 029 lines 131-141; backwards-compat
   §5 + §7 implements Decision 029 Consequence 1 + 7.

7. **Reusability (Charter Principle 8)**: Can community fork orch and
   keep tenancy mental model intact?
   → **YES**. §3 layout matches Claude Code's `<project>/.claude/` mental
   model per research 8.0.2 R-1 (cited in Decision 029 line 169); no fork
   required to extend.

## §11 Cross-references

- **Decision 029** (`agent-workspace/memory/decisions/029-tenancy-model-file-level.md`): binding ratification. Lines 80-106 (folder), 131-141 (isolation), 150-158 (fallback triggers), 172-184 (Consequences). This document concretizes Decision 029 for substage 8.6.2.
- **Decision 031** (`agent-workspace/memory/decisions/031-telemetry-sync-wire-format.md`): user-scope-only telemetry; cross-binds tenancy scope-rule.
- **Master plan §3 8.6** (`agent-workspace/session-plans/pending/phase-8-v2.3-strategic-pivot.md` lines 138-144): 8.6.1 (this doc) → 8.6.2 (impl + examples) → 8.6.3 (review).
- **Master plan §10 D-C** (line 269-270): pre-bound default = file-level.
- **PROJECT_CHARTER.md** §"Craft Philosophy" (line 39), Principle 2 (line 55), Principle 3 (line 57), Principle 8 (line 67), line 116 ("Not a multi-tenant system; each user runs their own daemon").
- **`packages/core/src/domain/profile.ts`** lines 119-131: `projectId` schema basis for `<project-slug>`.
- **Substage 8.6.2** surface: `packages/core/src/tenancy/scope-resolver.ts` + `examples/multi-user/demo.sh` + `scripts/migration/v2.3-tenancy-rehome.sh`.
- **Substage 8.6.3** surface: this document + 8.6.2 deliverables; apply §10 checklist.

**END Tenancy Model.**
