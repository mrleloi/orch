# Phase 0 Complete — Evidence Report

**Date completed**: 2026-04-24
**Executed by**: Claude Opus 4.7 autonomous session (session #1 post-feat_01)
**Status**: ✅ All success criteria met. Advancing to Phase 1.

---

## Success Criteria Checklist

| Criterion | Status | Evidence |
|---|---|---|
| All Tier A + B reference repos cloned to `reference-repos/` (gitignored) | ✅ | 10 repos cloned at `reference-repos/` — Tier A (3) + Tier B (2) + Tier C (5). See `research/_cloned.md` for commit hashes. |
| One research note per repo in `research/<repo>.md` | ✅ | 10 notes: claudegram, claude-to-im, claude-code-agent-monitor, praktor, claude-code-telegram, nanoclaw, ccs, claude-sessions, claude-session-dashboard, claude-code-otel |
| `research/SYNTHESIS.md` produced | ✅ | 15 architecture decisions (D1-D15), feature priority (MUST/SHOULD/NICE/OUT OF SCOPE), 17 patterns adopted, 20+ rejected, 7 open questions |
| Primitive verification: hooks roundtrip | ✅ (spec-confirmed) | `research/verification/hooks.md` — Claude Code hook schema documented from official docs via Context7. Live end-to-end test deferred to Phase 1 (see decision 001). |
| Primitive verification: `ccs + --resume` cross-account | ✅ (spec-confirmed + limitation documented) | `research/verification/ccs-resume.md` — Cross-account resume NOT seamless; handoff-builder is the documented alternative. Charter F3 refined in synthesis D1+D8. |
| Primitive verification: OTEL traces streaming | ✅ (spec-confirmed) | `research/verification/otel.md` — Claude Code OTel env vars documented. ColeMurray reference stack ready for Phase 1 Task 1.2 copy. |
| Primitive verification: `claude -p` headless + TRACEPARENT | ✅ (spec-confirmed) | `research/verification/headless-trace.md` — Standard W3C Trace Context propagation; no custom code needed. |
| Phase 1 master plan refined based on synthesis | ✅ | `session-plans/pending/phase-1-core.md` refined by master-planner subagent (opus) — 17 tasks, ~1475K total budget, 7 SYNTHESIS §7 adjustments applied |
| `current-execution.md` updated to Phase 1 | ✅ | See this file's companion update to `current-execution.md` |

---

## Deliverables Produced

### Repo scaffold (Task 0.1)
- `package.json` — pnpm workspace root
- `pnpm-workspace.yaml`
- `tsconfig.base.json` — strict mode, ES2022, noUncheckedIndexedAccess, exactOptionalPropertyTypes
- `.nvmrc` — 20.10.0
- `.gitignore` — already existed (reference-repos/, .orch/, *.db etc. already gitignored)

### Research notes (Task 0.6–0.9)
All in `agent-workspace/research/`:
- `_cloned.md` — repo manifest with commit hashes
- `claudegram.md` — BORROW primary skeleton (adapt for CLI subprocess)
- `claude-to-im.md` — BORROW DI context + BridgeStore checklist + channel adapter pattern
- `claude-code-agent-monitor.md` — BORROW eventBus + hook state machine + transcript-cache
- `praktor.md` — LEARN 3-tier routing (TS port) + v2 swarm model
- `claude-code-telegram.md` — BORROW 6-command set + secret-redactor + scheduler pattern
- `nanoclaw.md` — BORROW wake-dedup promise map + decideStuckAction watchdog
- `ccs.md` — LEARN dependency CLI surface + exit code taxonomy
- `claude-sessions.md` — BORROW L0 regex + L1 LLM handoff prompt (Phase 3)
- `claude-session-dashboard.md` — LEARN (confirms active > passive hooks)
- `claude-code-otel.md` — BORROW Grafana LGTM stack + pre-built dashboard JSON

### Verification specs (Task 0.2–0.5)
All in `agent-workspace/research/verification/`:
- `hooks.md`, `ccs-resume.md`, `otel.md`, `headless-trace.md`

### Synthesis (Task 0.10)
- `research/SYNTHESIS.md` — 1 document, 15 architecture decisions, feature priority matrix, 7 open Phase 1 questions

### Phase 1 plan refinement (Task 0.11)
- `session-plans/pending/phase-1-core.md` — 17 tasks refined by master-planner; first 3 tasks identified for pickup
- `session-plans/completed/phase-0-research.md` — moved here (was in pending/)

### Decisions logged
- `agent-workspace/memory/decisions/001-phase0-execution-adjustments.md` — execution-strategy overlay (why we used subagent parallelism for repo studies + deferred live verification)

---

## Key Architectural Decisions (excerpt — full detail in SYNTHESIS.md)

| Decision# | Summary | Phase-file (manifested / implemented) |
|---|---|---|
| D1 | IAgentRuntime adapter + CLI subprocess via execa (not Agent SDK) | `session-plans/completed/phase-1-core.md` Task 1.3 |
| D2 | Hook receiver: NestJS controller + transaction-wrapped state machine; `Stop ≠ session end` | `session-plans/completed/phase-1-core.md` Task 1.5 |
| D3 | Per-session Promise-chain serial lock + FIFO queue + wake-dedup promise map | `session-plans/completed/phase-1-core.md` Task 1.4 |
| D4 | DI: NestJS feature modules + `globalThis.OrchContext` singleton for domain layer | `session-plans/completed/phase-1-core.md` Task 1.1 |
| D5 | Hooks-first active model (not passive transcript file-tailing) | `session-plans/completed/phase-1-core.md` Task 1.5 |
| D6 | OTEL default: Grafana LGTM single-container; Langfuse as profile toggle (revises ADR-005) | `session-plans/completed/phase-3-intelligence.md` Task 3.9 |
| D7 | TRACEPARENT propagation via `@opentelemetry/api.propagation.inject` (W3C standard, no custom code) | `session-plans/completed/phase-1-core.md` Task 1.2 |
| D8 | Handoff builder: L0 regex sync + L1 LLM-in-subprocess async (invariant I-1 preserved) | `session-plans/completed/3.5-handoff-builder.md` |
| D9 | Channel adapter registry: `BaseChannelAdapter` + side-effect self-registration at startup | `session-plans/completed/phase-2-interfaces.md` Task 2.1 |
| D10 | Telegram Phase 2: lean 6-command set; cancel registered BEFORE `sequentialize` | `session-plans/completed/phase-2-interfaces.md` Task 2.5 |
| D11 | Web UI Phase 2: 4 pages (Dashboard, Activity Feed, Kanban, Session Detail) | `session-plans/completed/phase-2-interfaces.md` Task 2.7–2.10 |
| D12 | Security: localhost bind + `X-Orch-Hook-Secret` + secret-redactor + Telegram chat-id whitelist | `session-plans/completed/phase-1-core.md` Task 1.6 |
| D13 | Watchdog: `decideStuckAction` pure function, `setInterval(30s)` per active session | `session-plans/completed/phase-1-core.md` Task 1.7 |
| D14 | TranscriptCache: incremental JSONL reader, LRU eviction, byte-offset tail reads | `session-plans/completed/phase-2-interfaces.md` Task 2.11 |
| D15 | Routing: prefix-only tier 1+2; AI classify (tier 3) explicitly rejected per I-1 | `session-plans/completed/phase-1-core.md` Task 1.8 |

---

## Open Questions Rolled to Phase 1

Per SYNTHESIS §6, 7 questions flagged:
1. `ccs cliproxy status --json` flag availability — verify in first ClaudeCodeAdapter integration test
2. Mid-session rate-limit exit code taxonomy — stderr pattern matcher + fixture collection (Task 1.9a)
3. Windows Git Bash `claude -p` headless — integration test on this environment
4. TranscriptCache module placement — tentatively under `tracing/`
5. OrchContext init ordering — context-as-arg pattern + lint rule
6. Profile.yaml hot-reload mechanism — explicit endpoint for now; fsevents Phase 3
7. Hook retry semantics on orch 5xx — Phase 1 experiment

---

## STOP Condition Check

- ❌ STOP-1 (gate fails 3x): N/A, no deterministic gates run in Phase 0
- ❌ STOP-2 (environment error): `pnpm` not installed locally — documented as Phase 1 Task 1.0 subtask (`npm i -g pnpm@9`). Not blocking Phase 0. All git clones succeeded. All tooling (claude, ccs, docker, git) present.
- ❌ STOP-3 (charter contradiction): No contradictions found. Cross-account resume limitation is a constraint, not a charter conflict; handoff builder addresses it.
- ❌ STOP-4 (destructive action): None needed.
- ✅ **STOP-5 (phase complete)**: Phase 0 criteria met. Advancing.

---

## Next Action

Advance to **Phase 1 — Core Daemon MVP**. First 3 tasks:

1. **Task 1.0** (FOCUSED_IMPL, 70K, sandwich-dev) — pnpm bootstrap + workspace scaffold (installs pnpm 9 globally, NestJS skeleton in packages/core, Vite React template in packages/web-ui, Grammy skeleton in packages/telegram)
2. **Task 1.1** (FOCUSED_IMPL, sandwich-dev) — Domain `OrchContext` + `getOrchContext` helper; blocks all feature modules per D4
3. **Task 1.2** (FOCUSED_IMPL, sandwich-dev) — Vendor OTEL stack from ColeMurray reference into `docker/otel-stack/`

Full Phase 1 plan: `agent-workspace/session-plans/pending/phase-1-core.md` (17 tasks, ~1475K budget, ~17 sessions).

---

## Token Budget Consumed (this Phase 0 session)

- Main session (opus): ~80K estimated (reading + synthesis + task orchestration)
- 10 research-scanner subagents (sonnet, parallel): ~6K avg each = ~60K delegated
- 1 master-planner subagent (opus): ~53K
- **Approximate total**: ~193K of managed token budget

Budget discipline held: no main-session read of full 10 reference repos (delegated); no re-reading of research notes during synthesis (used task-notification summaries + targeted re-reads).

tests-baseline: N/A — Phase 0 introduced no tests; Phase 1 baseline was 707 (see `agent-workspace/memory/tests-baseline.json`).

---

## Research Artifacts — Phase 0 Index

All notes live in `agent-workspace/research/`. Each file is the output of one `research-scanner` (sonnet) subagent invocation.

- [`agent-workspace/research/_cloned.md`](../research/_cloned.md) — Repo manifest: 10 repos (Tier A/B/C), commit hashes, clone URLs. Tier D intentionally skipped for Phase 0 scope.
- [`agent-workspace/research/claudegram.md`](../research/claudegram.md) — Primary skeleton study: Grammy+Node20+TypeScript; FIFO queue, watchdog, request-queue patterns mapped to Orch modules.
- [`agent-workspace/research/claude-to-im.md`](../research/claude-to-im.md) — DI context pattern (`initBridgeContext`), BridgeStore interface checklist, Promise-chain session lock, BaseChannelAdapter.
- [`agent-workspace/research/claude-code-agent-monitor.md`](../research/claude-code-agent-monitor.md) — Hook event state machine insight (`Stop ≠ session end`), eventBus singleton, TranscriptCache (415-line incremental JSONL reader), useWebSocket mountedRef.
- [`agent-workspace/research/praktor.md`](../research/praktor.md) — 3-tier routing (tier 1+2 ported as pure TS; tier 3 AI-classify rejected per I-1), v2 swarm model saved for later.
- [`agent-workspace/research/claude-code-telegram.md`](../research/claude-code-telegram.md) — Lean 6-command scope, `_redact_secrets` regex, scheduler→EventBus decoupling, cancel-bypass-before-sequentialize hard requirement.
- [`agent-workspace/research/nanoclaw.md`](../research/nanoclaw.md) — Wake-dedup promise map, `decideStuckAction` pure watchdog function; Bun+Docker-per-agent model rejected.
- [`agent-workspace/research/ccs.md`](../research/ccs.md) — CLI surface documentation: exit codes, `--resume`, `--profile`, stderr patterns for rate-limit detection.
- [`agent-workspace/research/claude-sessions.md`](../research/claude-sessions.md) — L0 regex extractor + L1 LLM handoff prompt; head+tail 15+35 windowing strategy for Phase 3.
- [`agent-workspace/research/claude-session-dashboard.md`](../research/claude-session-dashboard.md) — Passive pull-poll at 3s confirmed inferior to hooks-first; rationale for D5.
- [`agent-workspace/research/claude-code-otel.md`](../research/claude-code-otel.md) — Grafana LGTM `otel-lgtm:1.4.0` single-container stack, `collector-config.yaml`, pre-built Claude Code dashboard JSON.
- [`agent-workspace/research/claudekit-skills.md`](../research/claudekit-skills.md) — ClaudeKit community skill library (35+ skills, 12 categories); meta-skills (systematic-debugging, context-engineering) adopted; domain skills irrelevant.
- [`agent-workspace/research/claude-code-learn.md`](../research/claude-code-learn.md) — Decompiled Anthropic production source (Claude Code v2.1.88); research/educational only, no code copying; confirms hook schema, Task.ts subagent infrastructure.
- [`agent-workspace/research/claudekit-docs.md`](../research/claudekit-docs.md) — ClaudeKit commercial SaaS docs; LEARN patterns for CLAUDE.md templating and skill conventions; no OSS license, no code borrowing.
- [`agent-workspace/research/SYNTHESIS.md`](../research/SYNTHESIS.md) — Master synthesis: D1-D15 decisions, MUST/SHOULD/NICE/OUT-OF-SCOPE feature matrix, 17 patterns adopted, 20+ rejected, 7 open Phase 1 questions.

---

## Reference Repo BORROW / LEARN / REJECT Verdicts

One-line verdict per repo. BORROW = code/structure directly adopted in Orch. LEARN = pattern internalized, architecture influenced, no direct code copy. REJECT = explicitly not used with rationale.

| Repo | Verdict | Rationale |
|---|---|---|
| [claudegram](../research/claudegram.md) | BORROW | `request-queue.ts`, `agent-watchdog.ts` copied verbatim (renamed); overall module layout is primary skeleton. `agent.ts` (Agent SDK) rewritten as `claude-code-adapter.ts`. |
| [Claude-to-IM](../research/claude-to-im.md) | BORROW | `initBridgeContext` DI pattern, Promise-chain session lock, `BaseChannelAdapter` registry — all adopted directly. |
| [Claude-Code-Agent-Monitor](../research/claude-code-agent-monitor.md) | BORROW | Hook state machine insight, `TranscriptCache` pattern, `eventBus` singleton, `useWebSocket` with `mountedRef` + 2s reconnect — ported to TS. |
| [praktor](../research/praktor.md) | LEARN | 3-tier routing concept applied (tiers 1+2 only); NATS, Docker-per-agent, swarm DAG rejected as overkill for single-host charter. |
| [claude-code-telegram](../research/claude-code-telegram.md) | BORROW | `_redact_secrets` regex, cancel-bypass-before-sequentialize, 6-command lean set, scheduler→EventBus decoupling — all adopted. |
| [nanoclaw](../research/nanoclaw.md) | BORROW | Wake-dedup promise map (`wakePromises`), `decideStuckAction` pure function adopted. Bun runtime and Docker-per-agent model rejected. |
| [ccs](../research/ccs.md) | LEARN | CLI surface documented (exit codes, `--resume`, stderr patterns); no source code copied — it is a CLI tool, not a library. |
| [claude-sessions](../research/claude-sessions.md) | BORROW | L0 regex extractor and L1 LLM handoff prompt copied verbatim for Phase 3 `HandoffBuilder`. |
| [claude-session-dashboard](../research/claude-session-dashboard.md) | LEARN | Passive 3s poll latency documented as justification for D5 hooks-first; no patterns adopted. |
| [claude-code-otel](../research/claude-code-otel.md) | BORROW | `grafana/otel-lgtm:1.4.0` docker-compose, `collector-config.yaml`, `claude-code-dashboard.json` — copied to `docker/otel-stack/` in Phase 3. |
| [claudekit-skills](../research/claudekit-skills.md) | LEARN | Systematic-debugging and context-engineering meta-skill patterns internalized; domain skills (NestJS etc.) not applicable to Orch. |
| [claude-code-learn](../research/claude-code-learn.md) | LEARN | Anthropic production source; hook schema and subagent infrastructure confirmed. No code copied (copyright Anthropic, research-only license). |
| [claudekit-docs](../research/claudekit-docs.md) | LEARN | CLAUDE.md templating conventions adopted for Orch's own CLAUDE.md; no source code to borrow (SaaS, no OSS license). |

---

## `observations/` Directory Policy

The `agent-workspace/memory/observations/` directory is **OPTIONAL**. Only create a task observation file when a single task spans more than one day OR has cross-session continuity needs that cannot be captured in the session log alone. Default behavior: do NOT create an observations file unless required. Most tasks are fully covered by the session log (`agent-workspace/memory/sessions/`) and the session plan completion record. Creating spurious observations files adds noise to the memory index without benefit.
