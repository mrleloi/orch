# Project State

> Living document. Updated when architectural decisions made or phase boundaries reached.

---

## Summary

**Project**: Orch — Personal Claude Code Orchestration Daemon
**Status**: Starter kit created. Phase 0 (Research & Verify) not yet started.
**Primary stack**: Node.js 20+, NestJS, TypeScript strict, Prisma+SQLite, Grammy, React+Vite, OpenTelemetry.

---

## Current Phase

See `current-execution.md` for the active phase.

---

## Architecture Decisions (ADRs)

### ADR-001: Separate Repo from Managed Projects
**Status**: Decided (Charter)
**Context**: Orch orchestrates Claude Code sessions on projects like StockForge. Question: same repo as StockForge, monorepo, or separate?
**Decision**: Separate repo. Orch reads managed projects via `.orch/profile.yaml`. One-way dependency.
**Rationale**: Reusability across projects/users. Decoupled release cycles. No financial data leakage from StockForge into public tool.

### ADR-002: CLI Subprocess over Agent SDK
**Status**: Decided (Charter Principle 5 + Invariant I-3)
**Context**: Could use `@anthropic-ai/claude-agent-sdk` for programmatic Claude Code control. Or spawn `claude` CLI subprocess via `ccs`.
**Decision**: CLI subprocess only for subscription accounts.
**Rationale**: Anthropic ToS (April 2026) restricts Agent SDK chat sending with subscription accounts. CLI subprocess is documented and safe. Compatible with existing `ccs` workflow.

### ADR-003: NestJS as Framework
**Status**: Decided
**Context**: Need backend framework for daemon. Options: NestJS, Fastify+manual, Express+manual, Hono.
**Decision**: NestJS with platform-fastify.
**Rationale**: User proficiency (stated). Built-in DI essential for adapter pattern. Modules align with feature structure. Fastify platform gives speed and modern HTTP.

### ADR-004: SQLite for State
**Status**: Decided
**Context**: Persistence for queue, sessions, decisions.
**Decision**: SQLite via Prisma.
**Rationale**: Single-user, single-machine. No distributed locking needed. Prisma gives typed queries. WAL mode handles concurrency.

### ADR-005: OpenTelemetry + Langfuse (default)
**Status**: Decided
**Context**: Tracing backend options: Langfuse, SigNoz, Honeycomb (commercial), Phoenix.
**Decision**: Default Langfuse self-hosted via docker-compose. Support SigNoz as alternative.
**Rationale**: Langfuse has LLM-specific UI (sessions, generations, scores). Self-hosted = no vendor lock. OTEL is the abstraction; backend swappable.

### ADR-006: Grammy for Telegram
**Status**: Decided
**Context**: Telegram bot library choices: telegraf, grammy, node-telegram-bot-api.
**Decision**: Grammy.
**Rationale**: Modern TypeScript-first API. Used in claudegram reference. Active maintenance.

### ADR-007: Monorepo via pnpm Workspaces
**Status**: Decided
**Context**: Multiple packages (core, telegram, web-ui, cli, shared) — monorepo tool?
**Decision**: pnpm workspaces (no Nx, no Turborepo yet).
**Rationale**: Minimal, native to pnpm. Can add Turborepo later if build parallelization becomes bottleneck.

### ADR-008: React + Vite for Web UI
**Status**: Decided
**Context**: Web UI framework: React, Svelte, Vue, SolidJS.
**Decision**: React + Vite + Tailwind + shadcn/ui.
**Rationale**: Largest ecosystem, most reference implementations match. shadcn gives production-quality components. User familiarity.

### ADR-009: Profile-based Project Integration
**Status**: Decided (Charter Principle 3-4)
**Context**: How do managed projects "join" Orch?
**Decision**: Each managed project commits `.orch/profile.yaml`. Orch reads profiles to register projects. Projects never import Orch code.
**Rationale**: Minimal coupling. Profile is a data file, safe to commit. Revert = delete `.orch/`. No code to uninstall.

### ADR-010: Hook-based Lifecycle (not polling)
**Status**: Decided
**Context**: How does Orch know when a Claude Code session ends?
**Decision**: Use Claude Code's native SessionEnd, Stop, SubagentStop hooks. Orch exposes HTTP endpoints, hooks POST to them.
**Rationale**: Native API, event-driven (not polling), supported by Anthropic, trivially installable via profile.

---

## Known Issues / Open Questions

(To be populated during Phase 0 research and subsequent phases.)

- [ ] Does `claude --resume <session-id>` preserve full context across `ccs` account switches? (Verify in Phase 0 Task 3)
- [ ] How to detect context-full condition programmatically — OTEL span attributes vs parsing stderr? (Verify in Phase 0 Task 4)
- [ ] Should Web UI be embedded in core package or separate? (Decision deferred to Phase 2)
- [ ] Plugin system for v2? (Out of scope for v1 per charter)

---

## Dependencies on External Projects

| Dependency | Version pinned | Notes |
|---|---|---|
| `claude` (Anthropic CLI) | latest | Via PATH, no install by us |
| `ccs` (kaitranntt/ccs) | >= 7.x | Via PATH; wraps claude + account switching |
| `codex` (OpenAI CLI) | optional | Only if user configures codex adapter |
| `git` | >= 2.25 | For worktree support in Phase 3+ |
| Docker | optional | For optional OTEL stack |

---

## Invariant Violations Detected

(Run `pnpm run check:invariants` periodically. None detected yet — no code exists.)

---

## Team

**Author/Maintainer**: Project Owner
**Contributors**: TBD (solo until sharing phase)

---

## Related Repos

**Main project** (that this orchestrates): `stockforge` (separate repo, private)
**Reference repos** (studied but not depended on): see `agent-workspace/research/` after Phase 0
