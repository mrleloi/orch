---
id: 029
title: Tenancy model — file-level workspace separation (per-user + per-project subdirectory)
status: ratified
date: 2026-04-27
phase: 8 (substage 8.0.3)
authoring_agent: master-planner (opus 4.7, /effort max, ORCH_SPAWNED, session #40)
authority: master plan §10 D-C + research output 8.0.2 (OSS layering)
addresses_questions: []
---

# Decision 029 — Tenancy model: file-level workspace separation

## Context

Phase 8 Dimension 6 (user brief §1.6) names a practical case: primary user + 1 colleague, sharing some projects, each owning personal projects. SC-45 (master plan §1, lines 30-31) requires:
- A tenancy model document at `agent-workspace/constitution/tenancy-model.md`.
- A minimal demo at `examples/multi-user/` with 2 simulated users sharing 1 project + each owning 1 personal project.
- Deterministic isolation: user-A cannot read user-B's personal-project trace.

Charter constraint (line 116, "Not a multi-tenant system. Each user runs their own daemon") and §"Craft Philosophy" (line 41, "Build for personal use first, team-share second") together bound the design space. The user brief asks for a **practical 2-user case**, not a hosted SaaS; the tenancy model must respect personal-first while admitting a small-team share path.

Three architectural shapes are candidates:
1. **File-level**: per-user + per-project subdirectory inside one `agent-workspace/` tree. One daemon, multiple users + projects, file-system ACL or path-prefix isolation.
2. **Daemon-level**: each user runs an independent daemon process; cross-daemon comms over message bus. Mirrors charter §"Stakeholders" "each user runs their own daemon".
3. **Hybrid**: shared workspace dir + per-user daemon for spawn/runtime + shared queue dir.

Master plan §10 D-C pre-bound the default to file-level. This decision formalizes it with the concrete folder structure, isolation mechanism, and daemon-level fallback trigger that the 8.6.1 sandwich-architect needs as input.

## Options considered

### Option A — File-level workspace separation (per-user + per-project subdirectory)

Pros:
- One daemon serves all users (charter line 116 says "each user runs their own daemon" — but for a single workstation with 2 users sharing 1 project, that means 1 daemon for "self use" + 1 daemon for "colleague use" running on the same hardware via separate process spaces; file-level adds a per-user dir convention, not a daemon multiplication).
- Folder structure is self-documenting: `agent-workspace/<user>/<project>/{queue,traces,memory,sessions}` mirrors how Claude Code itself layers `~/.claude/` (user) vs `<project>/.claude/` (project) per 8.0.2 line 32-39.
- File-system ACL (POSIX 0700 on each `<user>/` dir) enforces hard isolation at the OS layer — no orch code needed for the isolation guarantee.
- Easy to demo with `examples/multi-user/` (each user dir created with `mkdir + chmod 700`); SC-45 deterministic gate passes naturally.
- Reversible: if file-level proves inadequate, daemon-level upgrade is additive (each `<user>/` dir becomes the data root for an isolated daemon).
- Aligns with research-output 8.0.2 R-1 (line 173): "adopt Claude Code 4-scope file structure verbatim — same mental model Claude Code users already know".

Cons:
- ACL semantics differ across OSes (POSIX `chmod 700` vs Windows ACL via `icacls`); cross-platform fragility.
- A misconfigured daemon could read across `<user>/` dirs — runtime check needed (the `tenancy/scope-resolver.ts` per master plan §3 substage 8.6.2 line 143).
- Single daemon means one OOM/crash takes down all tenants. Charter §"Stakeholders" tolerance is "each user runs their own daemon" — file-level violates that letter, but the user brief §1.6 explicitly asks for a 1-machine 2-user case where one daemon is the practical reality.

ACCEPTED. This is master plan §10 D-C default; matches research 8.0.2 layered-config mental model; reversible to daemon-level.

### Option B — Daemon-level isolation (each user runs an independent daemon)

Pros:
- Hardest isolation: separate process, separate memory, separate file descriptors. No risk of one user's daemon leaking another's data.
- Matches charter line 116 verbatim ("Each user runs their own daemon").
- Per-daemon OOM affects only that user.

Cons:
- Practical 2-user case (user brief §1.6) on a single workstation needs 2 daemon processes + 2 ports + 2 systemd units (or equivalent) — high friction for a "personal-tool that scales to a colleague" use case.
- Cross-daemon comms (e.g., shared queue dir, shared memory) requires a message bus (NATS, file-watcher, ...). 8.0.2 line 38 (praktor) showed Go + NATS architecture; explicit reject (line 39 "SKIP: Go-specific; over-engineered" — same rationale applies to NATS for orch).
- Demo at `examples/multi-user/` becomes much harder — must spin 2 daemon processes, port-allocate, manage shutdown. SC-45 gate `bash demo.sh` exit 0 risk-of-flake increases.
- Config-layering (DIM 7) becomes inconsistent: 8.0.2 R-1 (line 173) recommends 4-scope file structure; daemon-per-user would mean each daemon has its own 4-scope tree, doubling the layering cost.

REJECTED. Practical demo cost is high; cross-daemon comms reintroduces the message-bus complexity 8.0.2 explicitly rejected.

### Option C — Hybrid: shared workspace + per-user daemon + shared queue

Pros:
- Combines isolation (per-user daemon for runtime) with sharing (shared queue + traces dir).

Cons:
- Doubles the failure modes: daemon process boundary + shared-file lock contention + cross-daemon read of shared traces.
- Two security models to reason about (shared dir + per-user daemon ACLs); audit surface increases.
- More moving parts than the user brief §1.6 needs (a 2-user demo).

REJECTED. Complexity not justified for SC-45 scope.

## Choice

**Option A — File-level workspace separation.** One daemon, per-user dirs with POSIX 0700 (or Windows ACL equivalent), per-project subdirectories within each user dir. Reversible to Option B (daemon-level) if isolation proves inadequate.

### Folder structure

```
agent-workspace/
├── shared/                              # cross-tenant SHARED-MUTABLE (logs, public traces)
│   ├── queue/                           # shared session-plan drop zone
│   └── traces/public/                   # publicly-tagged traces
├── <user-id>/                           # per-user root; chmod 700 / Windows ACL deny others
│   ├── projects/
│   │   ├── <project-slug>/              # per-project workspace
│   │   │   ├── queue/                   # personal queue
│   │   │   ├── traces/                  # personal traces (private)
│   │   │   ├── memory/
│   │   │   │   ├── sessions/
│   │   │   │   ├── checkpoints/
│   │   │   │   └── decisions/
│   │   │   └── session-plans/
│   │   └── <other-project>/...
│   ├── settings.local.yaml              # personal overlay (gitignored)
│   └── ORCH_CONTEXT.local.md            # personal context (gitignored)
├── shared-projects/
│   └── <shared-project-slug>/           # shared project; user-A + user-B both contribute
│       ├── queue/                       # shared queue (multiple users append)
│       ├── traces/                      # all participating users' traces; tag carries user-id
│       └── memory/
│           └── decisions/               # shared decisions log (cross-user)
```

For the 2-user demo (`examples/multi-user/`):
```
examples/multi-user/
├── demo.sh                              # spins both users' workspaces; runs synthetic queue task
├── alice/
│   ├── projects/personal-alice/...
│   └── settings.local.yaml
├── bob/
│   ├── projects/personal-bob/...
│   └── settings.local.yaml
└── shared-projects/
    └── joint-spike/...
```

`demo.sh` deterministic gate (SC-45):
1. Creates Alice's + Bob's user dirs with appropriate ACL.
2. Drops 1 task into Alice's personal queue, 1 into Bob's personal queue, 1 into shared `joint-spike/queue/`.
3. Single daemon picks up all 3 tasks; each emits a trace.
4. Validates `cat alice/projects/personal-alice/traces/*.jsonl` accessible from Alice's process; rejected from Bob's process.
5. `examples/multi-user/demo.sh` exits 0; validates all 3 expected traces exist.

### Cross-tenant isolation guarantees

| Zone | Read | Write | Owners |
|---|---|---|---|
| `<user-id>/` | OWNER ONLY | OWNER ONLY | OS-enforced via 0700 |
| `<user-id>/settings.local.yaml` | OWNER ONLY | OWNER ONLY | gitignored |
| `<user-id>/ORCH_CONTEXT.local.md` | OWNER ONLY | OWNER ONLY | gitignored |
| `shared-projects/<slug>/queue/` | ALL participants | ALL participants | shared-mutable; daemon enforces tag-on-write |
| `shared-projects/<slug>/memory/decisions/` | ALL participants | ALL participants (with audit-trail) | append-only convention |
| `shared-projects/<slug>/traces/` | ALL participants | OWNER (per file) | each trace tagged with `user_id`; orch refuses cross-user write |
| `shared/queue/` | ALL | ALL | public drop zone |
| `shared/traces/public/` | ALL | OWNER (per file) | explicit-public-tag only |

The `tenancy/scope-resolver.ts` (master plan §3 substage 8.6.2 line 143) enforces these at the orch-runtime layer in addition to OS ACL: orch reads `user_id` from the env (`ORCH_USER_ID`) at startup and refuses to write outside `<that user>/` or `shared-projects/<allowed>/...`. Defense in depth — OS ACL is primary, runtime check is a backup.

### Charter coherence note ("personal-first" — multi-user must not contradict)

The charter says (line 116) "Not a multi-tenant system. Each user runs their own daemon." This decision does NOT contradict that: the canonical recommendation remains "each user runs their own daemon"; file-level workspace separation is the **practical fallback** when 2 users share 1 workstation (the user-brief §1.6 case). For the more common case (each user on their own machine), each daemon trivially uses one `<user-id>/` dir at the root and behaves identically to the personal-first single-user case. The file-level structure does not impose multi-user complexity on single-user installs.

For 8.6.3 spec-compliance review (master plan §3 line 144): coherence question is "does the file-level model add cost to single-user installs?" — answer is no; a single-user install creates one `<user-id>/` dir and uses it as the workspace root, identical to the current `agent-workspace/` layout (just nested one level deeper, transparent to the user via env-var substitution).

### Daemon-level fallback condition (when file-level proves inadequate)

Trigger conditions that force the v2.4+ upgrade to Option B:
1. **OOM cross-tenant impact**: a single-daemon OOM observed in production breaks ≥2 users' workflows AND user impact is rated high. Trigger: SC-45 demo run shows daemon RSS > 500MB at steady state with 2 active users; OR real-world user reports OOM cross-tenant.
2. **Performance contention**: SQLite WAL contention on shared queue dir produces tail latency > 5s for queue-claim across 2 users (measured during 8.6.2 demo). Trigger: lat-p99 > 5s sustained.
3. **Security audit gap**: a community PR or independent reviewer identifies a tenant-isolation bypass via the runtime path (orch code reads cross-tenant) that cannot be patched by a small (<50 LOC) tenancy/scope-resolver fix. Trigger: documented CVE-equivalent finding.
4. **User explicit ask**: a colleague-installation use case requires hard process isolation (e.g., regulated industry, audit log requirement). Trigger: user-filed feature request in v2.4+ backlog.

Until any of 1-4, file-level is binding. v2.4 backlog will carry "tenancy daemon-level upgrade" as a placeholder feature.

## Why (Charter rules + Karpathy + Master plan §10)

- **Charter §"Craft Philosophy"** (line 41): "Build for personal use first, team-share second" → file-level adds the team-share dimension cheaply without bloating personal-use.
- **Charter Principle 8** (line 67): "Reusable without forking" → 4-scope file structure mental-model (8.0.2 R-1) lets community fork without re-architecting tenancy.
- **Charter line 116** ("Not a multi-tenant system; each user runs their own daemon"): file-level model preserves "each user owns their dir tree"; daemon-level remains the canonical when needed (Option B is the v2.4 fallback, not rejected).
- **Karpathy P2 (Simplicity First)**: file-level requires 0 new daemon processes, 0 new ports, 0 new IPC. Hybrid (Option C) doubled the moving parts.
- **Karpathy P3 (Surgical Changes)**: existing `agent-workspace/` layout maps cleanly into `<user-id>/projects/<project>/...` via env-var; one wire-up in `tenancy/scope-resolver.ts` (8.6.2) plus one ACL-mode setting.
- **Master plan §10 D-C** (line 269-270): pre-bound default. This decision concretizes the folder structure and fallback trigger.
- **Research output 8.0.2 line 32-39** (Claude Code 4-scope merge): consistent mental model. `<user-id>/projects/<project>/.orch/` mirrors Claude Code's `<project>/.claude/` per-project layering.
- **Research output 8.0.2 R-1 line 173**: "Adopt Claude Code 4-scope file structure verbatim — reduces onboarding friction for community"; tenancy file-level layout is a direct application.
- **Research output 8.0.2 line 39** (praktor reject): explicit rejection of cross-process message-bus complexity → daemon-level + bus combo (Option B/C) is over-engineered for the user-brief scope.

## Consequences (binding)

1. **`agent-workspace/` layout migrates** from `agent-workspace/<bare>` to `agent-workspace/<user-id>/projects/<project>/<bare>` in 8.6.2. Single-user case: `<user-id>` defaults to `default-user`, `<project>` defaults to current dir slug.
2. **`ORCH_USER_ID` env-var introduced**; daemon reads at startup; defaults to `default-user` for personal-first single-user installs (no friction added).
3. **`tenancy/scope-resolver.ts` enforces runtime path validation** in addition to OS ACL. Defense-in-depth.
4. **`examples/multi-user/demo.sh`** (master plan §3 line 143) demonstrates the 2-user case end-to-end. SC-45 deterministic gate.
5. **Shared-projects directory** (`shared-projects/<slug>/`) separate from `<user-id>/projects/<slug>/` to make sharing semantics explicit. Shared dirs are append-only by convention; daemon enforces tag-on-write.
6. **POSIX 0700 ACL on `<user-id>/`**; on Windows, equivalent via `icacls /grant:r <user>:(OI)(CI)F /inheritance:r` per master plan §3 8.6.2 implementation. Cross-platform ACL plumbing in the resolver.
7. **Charter line 116 NOT violated**: file-level remains "each user owns their dir tree"; the canonical "each user runs their own daemon" remains the default mental model — file-level is the cheap practical fallback when 2 users share a workstation (user brief §1.6).
8. **Daemon-level upgrade path documented** with 4 trigger conditions; v2.4 backlog placeholder.
9. **`<user-id>/settings.local.yaml`** and **`<user-id>/ORCH_CONTEXT.local.md`** are gitignored by default; mirrors Claude Code `CLAUDE.local.md` pattern (8.0.2 R-7 line 204).
10. **8.6.3 charter-coherence review** confirms personal-first preserved; cost added to single-user install = 1 nested dir level + 1 env var (acceptable).
11. **Telemetry sync (Decision 031)** runs at user scope only; never at project scope (prevents one user's project committing settings that opt-in another user). This decision binds Decision 031's scope-rule.

## Cross-references

- Master plan §10 D-C (line 269-270)
- Master plan §1 SC-45 (line 30-31)
- Master plan §3 substage 8.6 (lines 138-144), §11 effort matrix (lines 304-306)
- Research output `agent-workspace/research/phase-8-oss-config-patterns.md` (lines 32-39, 173, 204)
- Decision 027 (Phase 8 strategic redirect — DIM 6 mandate)
- Decision 028 (config-style normative format — `<user-id>/.orch/profile.local.yaml` follows the same frontmatter rules)
- Decision 031 (telemetry sync — must be user-scope only, binds this decision's scope-rule)
- Charter line 116 ("Not a multi-tenant system; each user runs their own daemon")
- Charter §"Craft Philosophy" (lines 39-47)
- Charter Principle 8 (line 67)
- Karpathy P2/P3 (CLAUDE.md Core Principles)

**END Decision 029.**
