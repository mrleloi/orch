# Research Synthesis — Phase 0

**Date**: 2026-04-24
**Scope**: Synthesizes 10 reference-repo notes + 4 primitive verifications into concrete Orch architecture decisions for Phase 1.
**Status**: Final. Informs `session-plans/pending/phase-1-core.md` refinement.

---

## 1. Recommended Skeleton Source

**Primary skeleton**: `claudegram` structure, **adapted for CLI subprocess**.

Layout to clone (with re-org for monorepo):

```
packages/core/src/
  domain/                      # pure TS, zero framework
    context.ts                 # globalThis OrchContext (← Claude-to-IM pattern)
    session-key.ts             # per-session key (projectId:sessionType:threadId)
    types/                     # IOrchStore, IAgentRuntime, IChannelAdapter interfaces
  modules/
    sessions/
      session-manager.ts       # ← claudegram/session-manager.ts
      session-history.ts       # ← claudegram/session-history.ts (zod-validated JSON persistence)
      request-queue.ts         # ← claudegram/request-queue.ts (per-session FIFO)
      agent-watchdog.ts        # ← claudegram/agent-watchdog.ts + nanoclaw's decideStuckAction
      claude-code-adapter.ts   # NEW — replaces claudegram/agent.ts (execa-based, not SDK)
    queue/                     # plan-file queue processor
    hooks/                     # HTTP POST /hooks/:event receiver (← Agent-Monitor pattern)
    tracing/                   # OTEL SDK setup + TRACEPARENT propagation
    state-machine/             # session state transitions, transaction-wrapped (← Agent-Monitor)
    repositories/              # Prisma wrappers — journal_mode=WAL, not DELETE
  main.ts                      # NestJS bootstrap + OrchContext init

packages/telegram/             # Grammy bot (Phase 2)
  src/
    adapter.ts                 # extends BaseChannelAdapter (← Claude-to-IM)
    handlers/                  # commands + message handler
    middleware/                # sequentialize, auth, rate-limit, secret-redact
    cancel-bypass.ts           # /cancel & /ping BEFORE sequentialize (← claudegram hard req)

packages/web-ui/               # React+Vite (Phase 2)
  src/
    lib/event-bus.ts           # singleton pub/sub (← Agent-Monitor)
    hooks/use-websocket.ts     # mountedRef + 2s reconnect (← Agent-Monitor)
    pages/                     # activity-feed, kanban, live-tail, dashboard, settings
```

Why claudegram over nanoclaw/praktor/Claude-to-IM:
- Closest stack match (TS + Grammy + Node 20 + ESM)
- Same concurrency model (per-session queue + watchdog)
- Single-host process, not Docker-per-agent (aligns with charter "single-user, self-hosted")
- Code readable and minimal (~1200 LOC core, no framework lock-in before NestJS port)

---

## 2. Architecture Decisions Informed by Research

### D1. IAgentRuntime adapter + CLI subprocess (not Agent SDK)

- **Informed by**: claudegram.md (uses Agent SDK — reject path), ccs.md (CLI surface), charter I-3
- **Decision**: `IAgentRuntime` with `spawn(config)` returning `Session` backed by `execa('ccs', [profile, '-p', prompt], { env: { ...TRACEPARENT, ...} })`. `resume(sessionId)` uses `ccs <profile> --resume <id>`. Mid-session rate-limit detection via stderr pattern + exit code taxonomy from ccs.md.
- **What we borrow verbatim from claudegram**: `request-queue.ts` (rename `Query` → `ExecaChildProcess`), `agent-watchdog.ts` (setInterval-based).
- **What we rewrite**: `agent.ts` → `claude-code-adapter.ts`. Parse stream-json output (`claude -p --output-format stream-json`) instead of SDK iterator.

### D2. Hook receiver as NestJS controller with transaction-wrapped state machine

- **Informed by**: Claude-Code-Agent-Monitor.md (state machine insight: Stop ≠ session end; Agent-tool PostToolUse fires on background), hooks.md verification
- **Decision**: `POST /hooks/:event` in `HooksController`. Body dispatched to `HooksService.processEvent()` wrapped in `prisma.$transaction(async tx => {...})`. State machine: active | completed | error | abandoned for sessions; idle | working | completed | error for tool-calls. Only `SessionEnd` (not `Stop`) terminates a session.
- **Dedup**: deterministic ID for compaction entries (`{sessionId}-compact-{uuid}`), content-hash (`type+message`) for API error events. General hooks not deduped (Claude Code does not retry).
- **Security**: `X-Orch-Hook-Secret` header validated against env-stored secret. Localhost-bound by default.

### D3. Per-session serial lock + cross-session parallel via Promise chain

- **Informed by**: Claude-to-IM.md (`processWithSessionLock`, 13 lines), claudegram.md (FIFO queue + `processing` flag), nanoclaw.md (wake-dedup promise map)
- **Decision**: Two-layer lock in `SessionConcurrencyService`:
  - **In-process**: `Map<sessionKey, Promise<void>>` chained — new requests `.then()` onto the existing promise. Copied verbatim from Claude-to-IM.
  - **Cross-process** (if ever needed): DB-backed `acquireSessionLock / renewSessionLock / releaseSessionLock` on `Session` table (TTL-based).
- **Wake dedup**: when spawn is already in-flight for a session, new wake calls return the same promise (nanoclaw `wakePromises` pattern). Prevents double-spawn on burst.

### D4. DI pattern: NestJS modules + globalThis OrchContext for domain

- **Informed by**: Claude-to-IM.md (`initBridgeContext` / `getBridgeContext`), ADR-003 (NestJS)
- **Decision**: NestJS DI for feature modules (`SessionsModule`, `QueueModule`, etc.). At bootstrap, `AppModule.onModuleInit` populates a `globalThis.OrchContext` singleton with `store`, `runtime`, `notifier`, `tracer` references pulled from the NestJS container. Domain-layer pure TS modules call `getOrchContext()` — no NestJS import leaks into `packages/core/src/domain/`.
- **Why not pure DI or pure singleton**: pure DI makes domain code testable only inside a NestJS test harness; pure singleton sacrifices NestJS ergonomics for feature modules. Hybrid is the cleanest of both.

### D5. Hooks-first active model (not passive file-tailing)

- **Informed by**: claude-session-dashboard.md (passive pull-polling at 3s has latency + mtime races), Agent-Monitor.md (hooks-first)
- **Decision**: Primary signal = Claude Code hooks POSTed to orch. Transcript tailing is **secondary** (only for backfill on orch restart, or live-tail feature where hook events don't carry full assistant text). Charter confirmed: active > passive.

### D6. OTEL: Grafana LGTM single-container default, Langfuse as alternative

- **Informed by**: claude-code-otel.md (ColeMurray provides LGTM stack + pre-built dashboard JSON + collector config), otel.md verification, ADR-005 (Langfuse default)
- **Decision**: **Revise ADR-005**: default shipped stack is `grafana/otel-lgtm:1.4.0` single-container (faster to bring up, includes Prometheus+Loki+Tempo+Grafana). Langfuse remains supported as a profile toggle for users who want LLM-specific UI. Copy `collector-config.yaml`, `docker-compose-lgtm.yml`, `claude-code-dashboard.json` from ColeMurray into `docker/otel-stack/` in Phase 3.
- **ADR-005 update**: add "Grafana LGTM (default)" alongside "Langfuse (alt)". Decision rationale: LGTM has pre-built dashboard for Claude Code specifically; orch inherits that work for free.

### D7. TRACEPARENT propagation via `@opentelemetry/api.propagation.inject`

- **Informed by**: headless-trace.md
- **Decision**: Standard W3C propagation, no custom code. Before `execa`, `propagation.inject(ctx, carrier)` → `carrier` merged into env. Claude Code's own OTel SDK reads it.

### D8. Handoff builder (Phase 3): claude-sessions L0 regex + L1 LLM prompt

- **Informed by**: claude-sessions.md (L0 regex parser, L1 extraction prompt, head+tail 15+35 windowing)
- **Decision**: When session N ends (SessionEnd or context-budget trigger), `HandoffBuilder`:
  1. Synchronously parses transcript JSONL with L0 regex extractor (files, commands, errors, failures, next_step, decisions) — copied verbatim.
  2. Asynchronously fires L1 LLM prompt via a **dedicated handoff session** (NOT a daemon LLM call — spawned Claude session with the 6-category extraction prompt). Result stored in `HandoffContext` table.
  3. Next session's prompt seeded with L1 summary + L0 facts + "resume work from: <summary>".
- **Invariant protection**: I-1 "daemon-dumb" preserved — L1 runs INSIDE a Claude Code subprocess, not in orch code.

### D9. Channel adapter registry: BaseChannelAdapter + side-effect self-registration

- **Informed by**: Claude-to-IM.md (`BaseChannelAdapter` + `registerAdapterFactory`), nanoclaw.md (same pattern), charter P3/P4 (project-agnostic + light-touch)
- **Decision**: `IChannelAdapter` interface + `AdapterRegistry.register(type, factory)` + side-effect import in `packages/{telegram,web-ui}/src/index.ts`. `AppModule` imports these packages; on startup, adapters self-register. Adding a new channel = new package, no core changes.

### D10. Telegram command set (Phase 2 target)

- **Informed by**: claude-code-telegram.md (14-command superset)
- **Decision**: Phase 2 Telegram bot ships **6 commands** in agentic mode (lean):
  - `/status` — active session + queue summary
  - `/queue` — list pending plans
  - `/pause` — halt dispatcher
  - `/resume` — re-enable dispatcher
  - `/tail` — live tail of active session
  - `/cancel` — cancel active session (registered BEFORE `sequentialize` per claudegram hard req)
- Text messages (no prefix) → dispatch to ProjectRouter → spawn session via IAgentRuntime.
- Classic-mode commands (`/cd`, `/ls`, `/git`, `/actions`) explicitly deferred to Phase 3 nice-to-have.

### D11. Web UI page inventory (Phase 2 target)

- **Informed by**: Agent-Monitor.md (Activity Feed + Kanban + Dashboard), praktor.md (adds Tasks + Swarms), charter F6
- **Decision**: Phase 2 ships **4 pages**:
  - Dashboard (stat cards: active session, queue depth, daily tokens, daily cost)
  - Activity Feed (live event tail with pause+buffer pattern from Agent-Monitor, max 200 events)
  - Kanban (queue items by state: pending | running | completed | failed)
  - Session Detail (transcript viewer with token/cost chart, trace link)
- Tasks page = Phase 3 (cron integration). Swarms page = out of scope v1.

### D12. Security posture

- **Informed by**: Agent-Monitor.md (NO auth — flagged as CONCERN, not borrow), claude-code-telegram.md (`_redact_secrets` regex, 3-layer middleware), ccs-resume.md, charter S-1/S-2/S-3
- **Decision**:
  - Web UI: localhost-bound by default (F6 already says this; enforce via Fastify listen on `127.0.0.1`)
  - Hook receiver: `X-Orch-Hook-Secret` header validation, localhost bind
  - Telegram: whitelist env var (`ORCH_TG_ALLOWED_CHAT_IDS`) + rate-limit middleware + secret-redact on outbound text
  - Copy `_redact_secrets` regex patterns from claude-code-telegram/src/claude/orchestrator.py lines 52-80 → `packages/core/src/modules/security/secret-redactor.ts`
  - Never touch `~/.ccs/` or `~/.claude/` (I-5 + ccs CLAUDE.md reinforces)

### D13. Watchdog: two-tier pure function

- **Informed by**: nanoclaw.md (`decideStuckAction`), claudegram.md (setInterval liveness monitor)
- **Decision**: `packages/core/src/modules/sessions/watchdog.ts` with pure function `decideAction({ session, now, heartbeatAgeMs, absCeiling, perClaimTolerance }): 'ok' | 'soft-warn' | 'hard-kill'`. `setInterval(30s)` invokes it per active session. Heartbeat = latest hook-event timestamp OR `execa.ChildProcess.exitCode === null` check.

### D14. TranscriptCache for live-tail

- **Informed by**: Agent-Monitor.md (415-line incremental JSONL reader with LRU + byte-offset reads)
- **Decision**: **Borrow pattern, port to TS**. New `packages/core/src/modules/tracing/transcript-cache.ts`. Size-based LRU eviction, mtime+size dual-check for invalidation, tail reads by byte-offset for append-only files. Feeds `/tail` Telegram command and WebUI live-tail page.

### D15. Routing (prefix only for v1)

- **Informed by**: praktor.md (3-tier AI routing — charter forbids LLM in daemon)
- **Decision**: Tier 1 (`@swarm`) + Tier 2 (`@agent`) prefix routing ported as pure TS function. Tier 3 (AI classify) explicitly rejected per I-1. Swarm graph model deferred to v2.

---

## 3. Feature Priority

### MUST (Phase 1 — Core Daemon MVP)

- [ ] Hook HTTP receiver (`/hooks/:event`) with transaction-wrapped state machine (D2)
- [ ] IAgentRuntime interface + ClaudeCodeAdapter (CLI subprocess) (D1)
- [ ] Session state machine + Prisma schema + WAL mode (D2)
- [ ] Per-session queue + serial lock (D3)
- [ ] Agent watchdog (D13)
- [ ] OTEL SDK setup + TRACEPARENT propagation (D7)
- [ ] `.orch/profile.yaml` loader + validator (already scoped in prior planning; confirmed by claude-code-telegram project-registry pattern)
- [ ] OrchContext DI bootstrap (D4)
- [ ] Queue processor (reads `session-plans/pending/*.md`, dispatches)

### SHOULD (Phase 2 — Interfaces)

- [ ] Telegram bot with 6 commands + Grammy `sequentialize` + cancel-bypass + secret-redact (D9, D10, D12)
- [ ] Web UI with 4 pages + eventBus singleton + mountedRef WS (D11, D5)
- [ ] TranscriptCache (D14)
- [ ] Localhost auth binding + X-Orch-Hook-Secret header (D12)

### NICE (Phase 3 — Intelligence)

- [ ] Handoff builder (L0 regex sync + L1 LLM-in-subprocess async) (D8)
- [ ] Context budget enforcer (soft@200K, hard@230K trigger handoff)
- [ ] Grafana LGTM docker-compose bundle + pre-built dashboard (D6)
- [ ] Langfuse alternative backend toggle (D6)
- [ ] Cron scheduler (node-cron; EventBus decoupling from claude-code-telegram)
- [ ] Session Detail page with trace link

### OUT OF SCOPE (v1 — deferred or rejected)

- Swarms / multi-agent coordination (v2 — praktor swarm model saved for v2)
- AI routing (charter I-1 rejects)
- Docker-container-per-agent (nanoclaw model rejected; orch uses subprocess)
- Two-DB split (nanoclaw solves Docker cross-mount; orch doesn't have that problem)
- Cross-account seamless resume (ccs-resume.md confirmed not possible; handoff builder is the alternative)
- OneCLI / vault / secrets manager (out of charter scope)
- Voice/TTS (claudegram + claude-code-telegram have it; not charter)
- Markdown rendering for 3+ platforms (Claude-to-IM has it; orch targets only Telegram + WebUI)
- Tasks / Swarms pages in Web UI (praktor has them; defer)
- Multi-project permissions matrix / audit trail persistence (Phase 4+ if team share happens)

---

## 4. Patterns Adopted (summary table)

| Pattern | Source | Orch module | Effort |
|---|---|---|---|
| Per-session FIFO queue + soft-cancel | claudegram | `modules/sessions/request-queue.ts` | Low |
| setInterval liveness watchdog | claudegram | `modules/sessions/agent-watchdog.ts` | Low |
| Cancel-bypass before sequentialize | claudegram | `packages/telegram/src/cancel-bypass.ts` | Trivial |
| globalThis DI context | Claude-to-IM | `domain/context.ts` | Low |
| BridgeStore method checklist → IOrchStore | Claude-to-IM | `domain/types/store.ts` | Low |
| Promise-chain session lock | Claude-to-IM | `modules/sessions/concurrency.ts` | Trivial |
| BaseChannelAdapter + registry | Claude-to-IM + nanoclaw | `domain/types/channel-adapter.ts` | Medium |
| Hook event state machine | Agent-Monitor | `modules/hooks/state-machine.ts` | Medium |
| eventBus singleton + useWebSocket | Agent-Monitor | `packages/web-ui/src/lib/event-bus.ts` | Low |
| TranscriptCache incremental reader | Agent-Monitor | `modules/tracing/transcript-cache.ts` | Medium |
| Wake-dedup promise map | nanoclaw | `modules/sessions/spawn-dedup.ts` | Low |
| decideStuckAction pure function | nanoclaw | `modules/sessions/watchdog.ts` | Low |
| L0 regex + L1 LLM handoff extractor | claude-sessions | `modules/handoff/*.ts` (Phase 3) | Medium |
| 3-tier routing (tier 1+2 only) | praktor | `modules/routing/router.ts` | Low |
| OTEL Collector + Grafana LGTM bundle | claude-code-otel | `docker/otel-stack/` | Low (copy) |
| Telegram command scope (lean 6) | claude-code-telegram | `packages/telegram/src/handlers/` | Medium |
| _redact_secrets regex | claude-code-telegram | `modules/security/secret-redactor.ts` | Trivial |
| Scheduler → EventBus decouple | claude-code-telegram | `modules/scheduler/` (Phase 3) | Low |

---

## 5. Patterns Rejected (with rationale)

| Pattern | Source | Reason rejected |
|---|---|---|
| Agent SDK `query()` iterator | claudegram | I-3 ToS: CLI subprocess only for subscription accounts |
| Docker-per-agent | nanoclaw, praktor | Overhead; charter "single-host, single-user, lightweight" |
| NATS pub/sub | praktor | Overkill for single-process; EventEmitter suffices |
| AI routing (tier 3) | praktor | I-1 daemon-dumb; no LLM in orch core |
| Swarm graph + DAG execution | praktor | v2 scope; YAGNI for v1 |
| Vault / encrypted secrets | praktor | Out of scope; env vars + file permissions sufficient |
| Two-DB split (inbound/outbound) | nanoclaw | Solves Docker cross-mount problem orch doesn't have |
| Bun runtime | nanoclaw | Node 20+ LTS preferred for compatibility |
| `journal_mode=DELETE` | nanoclaw | WAL is appropriate for single-process Prisma; DELETE was their cross-process workaround |
| Multi-platform Markdown (Feishu/Discord rendering) | Claude-to-IM | Only Telegram + WebUI for v1 |
| SDK-side permission_request events | Claude-to-IM | CLI subprocess parses permissions from stdout differently |
| Classic-mode terminal commands (`/cd`, `/ls`, `/git`) | claude-code-telegram | Agentic-mode only for v1; classic commands can be agentic prompts |
| FastAPI webhook server | claude-code-telegram | Orch core is NestJS; webhook = Nest controller |
| No-auth WebSocket | Agent-Monitor | Security hole; orch adds localhost bind + JWT |
| D3.js Workflows page | Agent-Monitor | Over-engineered; Phase 1 overkill |
| VAPID web push | Agent-Monitor | Telegram is orch's push channel |
| Passive file-tailing only | claude-session-dashboard | Hooks-first is more reliable + lower latency |
| Cross-session memory pool + hotness scoring | claude-sessions | Orch does point-to-point handoff only |
| Multi-runtime adapter registry (Codex/Qwen/Gemini) | claude-sessions | Phase 1 ships Claude Code only; extend later via IAgentRuntime |

---

## 6. Open Questions for Phase 1

1. **CLIProxy JSON output?** `ccs cliproxy status --json` flag existence unverified. If absent, orch parses `ccs cliproxy status` stdout as structured text. Fallback: call `ccs auth list --json` + cross-reference with `ccs doctor` output. **Phase 1 Task**: verify during first ClaudeCodeAdapter integration test.

2. **Mid-session rate-limit exit code.** ccs.md says code 6 is pre-spawn detection; mid-session rate-limit may pass through raw claude exit + stderr pattern. **Phase 1 Task**: write stderr pattern matcher; collect real-world examples during first long-running session.

3. **Windows `--print` headless mode.** ccs.md flags `claude -p` not yet verified on Windows Git Bash. **Phase 1 Task**: integration test on this very environment.

4. **TranscriptCache placement.** Under `tracing/` (since it feeds trace-adjacent data) or `sessions/` (since it's session-state)? **Tentative decision**: `tracing/` to avoid circular import with sessions manager. Revisit in Phase 1 as module boundaries solidify.

5. **OrchContext init ordering.** NestJS DI bootstraps asynchronously; domain-layer code calling `getOrchContext()` before `AppModule.onModuleInit` completes crashes. **Mitigation**: domain modules accept `OrchContext` as function arg in their public API (enforced by lint rule) — singleton is fallback for convenience only.

6. **Profile.yaml hot-reload.** User will edit profiles while orch is running. Polling, fsevents, or explicit `/reload` admin command? **Tentative**: explicit endpoint for now, fsevents in Phase 3.

7. **Hook retry semantics.** Agent-Monitor says "Claude Code does not retry hooks" — but what happens on orch receiver 5xx? Does Claude Code buffer? **Phase 1 Task**: experiment with orch HTTP 500 response during active session; observe whether hooks queue or drop.

---

## 7. Phase 1 Plan Adjustments (feed into master-planner refinement)

Based on this synthesis, Phase 1 master plan (`session-plans/pending/phase-1-core.md`) should:

1. **Add a first task** to copy `docker/otel-stack/` from ColeMurray (not Phase 3 — move up to Phase 1 so OTEL verification can run on real stack instead of assumptions).
2. **Split "session controller"** into: `session-manager` + `request-queue` + `agent-watchdog` + `claude-code-adapter` (four separate modules per D1, D3, D13).
3. **Rename "state machine"** task to "hooks receiver + state machine" — they're one PR because the state machine is driven by hook events (D2).
4. **Add task**: `packages/core/src/domain/context.ts` + `getOrchContext` helper (D4). Blocks all other feature modules.
5. **Add task**: secret-redactor (D12) — not a Phase 2 thing; any outbound text (including CLI echo for admin) needs it.
6. **Reference the research notes** from each task: e.g. task "Implement request-queue" → "see research/claudegram.md §5 for port details".
7. **Budget tighten**: several tasks are "Low effort" (verbatim or near-verbatim port). Phase 1 can fit in fewer sessions than originally estimated.

---

## 8. Verification Summary

All 4 primitive verifications complete (see `verification/` directory):

| Primitive | Verdict | Live test deferred to |
|---|---|---|
| Claude Code hooks | Spec-confirmed, no blockers | Phase 1 first integration test |
| `ccs + --resume` cross-account | Not seamless; handoff-builder is the answer | Phase 1 once 2 accounts active |
| OTEL end-to-end | Spec-confirmed; ColeMurray stack ready | Phase 1 (early) — moved up from Phase 3 |
| TRACEPARENT headless | Standard W3C; no custom code | Phase 1 after OTEL stack up |

No STOP-3 contradictions (no spec contradicts charter). No STOP-2 environment blockers. Proceed to Phase 1.

---

## 9. Version + Changelog

- **v1.0** (2026-04-24): Initial synthesis. 10 repos studied, 4 primitives verified. Informed Phase 1 plan adjustments.
