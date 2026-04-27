# PROJECT CHARTER
## Orch — Personal Claude Code Orchestration Daemon

> **Status**: Immutable v1.0 — changes require explicit charter revision.
> **Scope of immutability**: Vision, principles, success criteria.
> **Things that do evolve**: Agent configs, specs, implementation, UI, integrations.

---

## Vision

A lightweight, self-hosted orchestration daemon that automates the repetitive babysitting work around Claude Code sessions — account switching when rate-limited, session handoff when context fills, queue processing of prepared plans, notification and remote control via Telegram and a local Web UI — so the human operator can focus on what they uniquely do: prepare prompts, define scope, review work.

**Primary user**: Project owner (self), running Claude Code daily on a main project (StockForge) with multiple Claude subscription accounts via `ccs`, currently switching accounts manually and opening/closing sessions manually when context fills. Secondary: 3-5 trusted peers who may want to run the same pattern on their own machines.

**Primary goal**: Remove manual session lifecycle management. When the human prepares a plan (via file drop in `session-plans/pending/`, Telegram command, or webhook), Orch picks it up, spawns the right Claude Code session with the right profile, handles rate limit and context boundaries, reports back, and auto-advances to the next plan. Human intervention is required only for substantive decisions, not for session babysitting.

**Not a goal**: Replacing Claude Code intelligence. Generic multi-agent framework. Competing with Vibe Kanban / Conductor / Factory AI Droids. Cloud-hosted SaaS. Running without human oversight on destructive operations.

---

## The Core Insight (the why)

Claude Code + Opus are upgraded on an exponential curve. Every month they do more with less instruction. The painpoint is not agent intelligence — it's the mechanical work around it:

- Rate limits force account switches (solved by `ccs` at auth layer, but human still restarts Claude Code)
- Context window fills at ~250K (solved by stockforge's session-split discipline, but human types `/session-end` and manually starts new session)
- Prepared plans queue up, but human must dispatch them one at a time
- When not at computer, Telegram integration is bare-bones (OpenClaw-level: screenshot + inject text)
- No unified view of what's running, what's queued, what changed
- No tracing across sessions → no cost attribution, no "why did yesterday cost $200"

Orch's job is to handle all of this **deterministically** — with code, not LLM calls — so human leverage goes to prompt prep and review, not to session mechanics.

---

## The Craft Philosophy

Build for personal use first, team-share second.

- Production-grade engineering standards from Day 1 (TypeScript strict, DI, tests, OTEL)
- Reusability as explicit design constraint, never an afterthought
- When personal convenience conflicts with hypothetical-future-team, personal convenience wins IF and only if the cost of making it team-ready later is low (i.e., don't hardcode personal paths/names)
- Quality bar: I use this daily and trust it to run overnight on real work
- Edge comes from compounding — better traces over time, better handoff context builder, richer memory of past sessions — not from any single clever feature

Reference models: `kaitranntt/ccs` (account switching + quota failover done right), `qwibitai/nanoclaw` (small enough to understand), Praktor (architecture reference), `claudegram` (TypeScript skeleton).

---

## Core Principles (non-negotiable)

1. **Daemon is dumb, workers are smart.** Orchestration logic is deterministic code. LLM reasoning is exclusively inside Claude Code sessions it spawns. The daemon does NOT call Anthropic API directly.

2. **Tight scope.** This is a personal orchestrator, not a generic agent framework. Features outside "schedule, spawn, monitor, notify, hand off" are out of scope unless they directly support those.

3. **Project-agnostic core, project-specific config.** `packages/core` knows nothing about StockForge. A project's `.orch/profile.yaml` declares its session types, hook targets, queue sources. One daemon → N projects.

4. **Light-touch integration.** Managed projects commit `.orch/profile.yaml` and optionally inject hooks into `.claude/settings.json`. That is the entire integration surface. Orch crashing does not break the project's Claude Code.

5. **CLI subprocess path for subscription accounts.** Compliance with Anthropic ToS (April 2026). `ccs` + `claude` CLI, never Agent SDK programmatic chat sending.

6. **Adapter abstraction for runtimes.** All runtime interactions go through `IAgentRuntime`. Swappable implementations for Claude Code, Codex, future agents. Core never imports a specific runtime.

7. **Observability from day one.** Every session is a trace. Every hook event is a span. Langfuse or SigNoz self-hosted. Cost attribution is a first-class concern, not bolted on.

8. **Reusable without forking.** A friend on another machine installs via npm, scaffolds their project with `orch init`, edits `profile.yaml`, runs `orch start`. Zero code changes.

9. **Fail loud, recover gracefully.** State machine transitions are logged. Failures notify via Telegram immediately. Queue items failed 3 times are quarantined, not retried forever.

10. **No feature creep into agent intelligence.** Tempting to add "smart routing", "auto-planning", "auto-review". Resist. Those belong in Claude Code + project's own subagents (see stockforge pattern).

---

## Success Criteria (phase 1.0)

Orch is **done enough to dogfood** when all of the following hold, tested on StockForge as the first managed project:

**Functional:**
- F1. Plan file dropped in `session-plans/pending/` is automatically picked up and executed
- F2. Session lifecycle events (start, end, stop, subagent-stop) from Claude Code hooks are received and update state
- F3. When `ccs` fails over to another account, Orch detects continuity and does not restart the session
- F4. When OTEL span reports tokens > 230K, Orch gracefully ends current session and spawns next with handoff context
- F5. Telegram commands `/status`, `/queue`, `/pause`, `/resume`, `/tail` work
- F6. Web UI at localhost shows queue kanban, active session, live tail, token/cost chart
- F7. `orch init` scaffolds a new project integration in < 60 seconds
- F8. Orch can manage 2+ projects simultaneously (StockForge + a second project) with no code changes

**Non-functional:**
- N1. TypeScript strict mode, zero `any` types in `packages/core`
- N2. Test coverage > 70% for state machine, queue, session controller
- N3. Daemon crashes do not corrupt queue state (SQLite transactions, WAL mode)
- N4. Cold start to ready state < 5 seconds
- N5. Telegram command response latency < 2 seconds (excluding LLM-bound operations)
- N6. Daemon runs 72 hours without memory leak (stable RSS)

**Observability:**
- O1. Every queue item = one OTEL trace root with `TRACEPARENT` propagated to Claude Code subprocess
- O2. Claude Code's own spans nest correctly under the Orch root span
- O3. Cost and token usage queryable per project, per day, per session type
- O4. Session end reasons (completed / rate-limited / context-full / failed) are categorized in traces

**Safety:**
- S1. Destructive operations (stop, kill, delete queue item) require confirmation in Telegram and Web UI
- S2. Daemon never reads or writes `~/.ccs/` or `~/.claude/` credentials directly
- S3. Web UI bound to localhost by default; remote access only via explicit Tailscale/tunnel config
- S4. Managed projects are read-only from daemon perspective EXCEPT for hook injection (with explicit user consent once)

---

## What This Is Not (anti-requirements)

- Not a replacement for Claude Code's CLI. Orch invokes the CLI, doesn't reimplement it.
- Not a hosted service. Single-user, self-hosted, machine-local.
- Not a multi-tenant system. Each user runs their own daemon.
- Not a workflow engine. No Temporal, no BPMN, no DAG. Simple state machine + queue.
- Not an AI agent framework. No agent-to-agent protocols, no swarms (those belong in Claude Code subagent layer).
- Not a code review tool. Claude Code already does that within sessions.
- Not a plan generator. Human prepares plans; or uses stockforge's `/master-plan` inside a Claude Code session. Orch just dispatches them.
- Not a general-purpose chatbot. Telegram interface is operational (commands to control daemon), not conversational.

---

## Stakeholders

- **Primary operator**: you. Makes all decisions. Owns roadmap.
- **Future team (3-5 peers)**: read-only on roadmap, consumers of the npm packages. Feedback welcome but no commit rights to charter.
- **Anthropic / ccs / OpenClaw upstream**: dependencies whose API may drift. Orch adapts, not the other way around.

---

## Versioning Policy

- **Major** (2.0, 3.0): charter amendment (requires written rationale)
- **Minor** (1.1, 1.2): new SPEC approved, new feature module, non-breaking contract changes
- **Patch** (1.0.1): bug fixes, doc improvements, dependency bumps

Current: **v1.0.0-alpha** (starter kit phase).

---

## Reference Repos to Study (during Phase 0)

These are the projects to clone, study, and selectively borrow from. Approach is in `agent-workspace/constitution/research-protocol.md`.

**Architecture reference (don't copy code, learn pattern):**
- `mtzanidakis/praktor` (Go) — most complete architecture: Telegram + Router + NATS + Docker agents + Mission Control
- `RichardAtCT/claude-code-telegram` (Python) — feature-complete scope reference

**Clone skeleton (most likely to borrow structure):**
- `NachoSEO/claudegram` (TypeScript + Grammy) — closest stack match, session-manager / request-queue / agent-watchdog modules

**Design pattern reference:**
- `op7418/Claude-to-IM` (TypeScript library) — DI-based bridge abstraction for reusability

**Dashboard pattern:**
- `hoangsonww/Claude-Code-Agent-Monitor` (Node + React + WebSockets) — hooks → WebSocket → dashboard pipeline
- `dlupiak/claude-session-dashboard` (Node) — minimal passive observability reference

**Session memory pattern:**
- `tradchenko/claude-sessions` (TypeScript CLI) — cross-agent session memory extraction

**Personal assistant pattern (too heavy but architecturally close):**
- `qwibitai/nanoclaw` (TypeScript) — channels → SQLite → polling loop → container runner

**Existing account/provider switching (dependency, not reference):**
- `kaitranntt/ccs` — used by Orch, not replaced. Understand its CLI surface.

**Observability reference:**
- `ColeMurray/claude-code-otel` — OTEL stack docker-compose for reference
- `TechNickAI/claude_telemetry` — thin wrapper pattern

---

## Signature

Charter authored by: Project Owner
Date: (fill in when committed)
Version: 1.0.0
