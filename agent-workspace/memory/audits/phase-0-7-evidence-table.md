# Phase 0-7 Charter Evidence Table

> Input to substage 8.3.2 (audit synthesis). Each charter principle has >= 1
> evidence row per phase. Evidence cites file path + concrete artifact.
> Produced: 2026-04-27 by research-scanner (ORCH_SPAWNED=true). Overwrites
> 578-byte stub from failed Session #40 attempt.

---

## Charter Principles Indexed

| ID  | Principle |
|-----|-----------|
| P1  | Daemon is dumb, workers are smart |
| P2  | Tight scope |
| P3  | Project-agnostic core, project-specific config |
| P4  | Light-touch integration |
| P5  | CLI subprocess path for subscription accounts |
| P6  | Adapter abstraction for runtimes |
| P7  | Observability from day one |
| P8  | Reusable without forking |
| P9  | Fail loud, recover gracefully |
| P10 | No feature creep into agent intelligence |

## Success Criteria Families

F1..F8 (functional) / N1..N6 (non-functional) / O1..O4 (observability) / S1..S4 (safety)

---

## Evidence Table

| Phase | Principle | Evidence (path + 1-line quote/summary) | Compliance | Confidence |
|-------|-----------|----------------------------------------|------------|------------|
| 0 | P1 | research/SYNTHESIS.md D6 -- daemon never calls Anthropic API directly; D15 -- AI-classify rejected per I-1 | PASS | HIGH |
| 0 | P2 | research/SYNTHESIS.md MUST/SHOULD/NICE/OUT-OF-SCOPE matrix -- generic agent framework features placed OUT OF SCOPE | PASS | HIGH |
| 0 | P3 | research/SYNTHESIS.md D4 -- globalThis.OrchContext singleton; no project names in core; profile.yaml design ratified | PASS | HIGH |
| 0 | P4 | research/SYNTHESIS.md D5 -- hooks-first active model chosen; examples/stockforge-integration planned as only integration surface | PASS | HIGH |
| 0 | P5 | research/SYNTHESIS.md D1 -- IAgentRuntime adapter + CLI subprocess via execa (not Agent SDK); no SDK usage path | PASS | HIGH |
| 0 | P6 | research/SYNTHESIS.md D1 -- IAgentRuntime adapter interface decided; claudegram Agent SDK rewritten as claude-code-adapter.ts | PASS | HIGH |
| 0 | P7 | research/SYNTHESIS.md D6/D7 -- Grafana LGTM OTEL stack chosen; TRACEPARENT W3C standard propagation; otel.md produced | PASS | HIGH |
| 0 | P8 | research/SYNTHESIS.md D9 -- BaseChannelAdapter + side-effect self-registration; orch init scaffolding; claude-to-im DI adopted | PASS | HIGH |
| 0 | P9 | research/SYNTHESIS.md D13 -- decideStuckAction pure watchdog + setInterval(30s); D3 -- FIFO queue + wake-dedup promise map | PASS | HIGH |
| 0 | P10 | research/SYNTHESIS.md D15 -- AI classify tier 3 explicitly rejected per I-1; praktor swarm DAG rejected as overkill | PASS | HIGH |
| 1 | P1 | phase-1-complete.md I-1 -- grep anthropic|openai packages/core/src/ -> empty; daemon = deterministic state machine | PASS | HIGH |
| 1 | P2 | phase-1-complete.md -- 17 tasks covering schedule/spawn/monitor/notify/handoff only; 640 tests within scope | PASS | HIGH |
| 1 | P3 | phase-1-complete.md I-4 -- All project config via profile.yaml + ProjectRegistry; grep stockforge core/src/ -> empty | PASS | HIGH |
| 1 | P4 | phase-1-complete.md Task 1.15 -- examples/stockforge-integration/profile.yaml+hooks-snippet = entire integration surface | PASS | HIGH |
| 1 | P5 | phase-1-complete.md I-3 -- grep @anthropic-ai/sdk packages/core/src/ -> empty; ClaudeCodeAdapter uses execa | PASS | HIGH |
| 1 | P6 | phase-1-complete.md fix-D -- SessionManager injected concrete ClaudeCodeAdapter (soft-violation); IAGENT_RUNTIME token introduced | PASS_WITH_CAVEAT | HIGH |
| 1 | P7 | phase-1-complete.md I-9 -- createPinoOtelMixin() wired; pino-otel-wired.spec.ts asserts trace_id inside withSpan; sdk.start() succeeds | PASS | HIGH |
| 1 | P8 | phase-1-complete.md Task 1.12 -- packages/cli 5 commands; Task 1.15 -- examples populated; orch init pattern ready for peer install | PASS | MED |
| 1 | P9 | phase-1-complete.md fix-C1 -- BoundedStderrBuffer 256 KiB ring; fix-C2 -- unhandledRejection/uncaughtException handlers in main.ts | PASS | HIGH |
| 1 | P10 | phase-1-complete.md I-1 PASS + I-14 -- domain zero framework deps (grep @nestjs core/src/domain/ -> empty); no LLM routing | PASS | HIGH |
| 2 | P1 | phase-2-complete.md I-1 -- grep @anthropic-ai/sdk packages/core/src/ -> 0 hits; SSE bridge = pure event relay | PASS | HIGH |
| 2 | P2 | phase-2-complete.md Tasks 2.0-2.12 -- Telegram + WebUI + SSE + OTEL only; verifier 0 critical/0 major findings | PASS | HIGH |
| 2 | P3 | phase-2-complete.md I-4 -- grep @orch/core packages/telegram/src packages/web-ui/src -> 0 hits; D21 ratified | PASS | HIGH |
| 2 | P4 | phase-2-complete.md D16 -- Telegram bot = standalone process; crashed bot cannot take down scheduler | PASS | HIGH |
| 2 | P5 | phase-2-complete.md I-3 -- ClaudeCodeAdapter uses execa; no Agent SDK import anywhere; spawn path unchanged | PASS | HIGH |
| 2 | P6 | phase-2-complete.md I-3 + IAGENT_RUNTIME token confirmed across Task 2.9 wiring; HandoffModule per D21 | PASS | HIGH |
| 2 | P7 | phase-2-complete.md Task 2.9 -- OTEL HTTP auto-instrumentation wired BEFORE NestFactory.create(); D19: ordering critical | PASS | HIGH |
| 2 | P8 | phase-2-complete.md Task 2.6 -- packages/web-ui Vite+React scaffold; localhost-bind enforced; Bearer token login | PASS | MED |
| 2 | P9 | phase-2-complete.md Task 2.5 -- SSE auto-reconnect exponential backoff max 30s; bounded buffer 200 events; redactSecrets() | PASS | HIGH |
| 2 | P10 | phase-2-complete.md Deferred items -- token/cost chart deferred; no smart routing or auto-planning features added | PASS | HIGH |
| 3 | P1 | phase-3-complete.md Daemon State -- HandoffOrchestratorService: git diff + session log + prompt render; Decision 006: zero LLM | PASS | HIGH |
| 3 | P2 | phase-3-complete.md Tasks 3.2-3.11 -- context-budget, handoff chain, cron, N5 latency, usage chart; all within scope | PASS | HIGH |
| 3 | P3 | phase-3-complete.md Task 3.5.a-e -- HandoffContextBuilder deterministic, config-driven via profile thresholds; no StockForge in core | PASS | HIGH |
| 3 | P4 | phase-3-complete.md Task 3.6 -- IAgentRuntime.spawn() seedPrompt threading; handoff orchestrator calls adapter only | PASS | HIGH |
| 3 | P5 | phase-3-complete.md Task 3.3 -- graceful end via /session-end stdin dispatch, SIGTERM/SIGKILL fallback; execa path unchanged | PASS | HIGH |
| 3 | P6 | phase-3-complete.md Task 3.6.x -- HandoffModule consumes IAGENT_RUNTIME via SessionsModule import; I-3 compliance end-to-end | PASS | HIGH |
| 3 | P7 | phase-3-complete.md Task 3.8 -- GET /sessions/:id/usage + UsageChartPage (Charter O3); Langfuse alt-backend toggle Task 3.9 | PASS | HIGH |
| 3 | P8 | phase-3-complete.md Task 3.9 -- Langfuse toggle via ORCH_TRACE_BACKEND env; configurable thresholds; no project hardcoding | PASS | MED |
| 3 | P9 | phase-3-complete.md Wins -- Date passthrough fix redact-log-object.ts:61-64; pre-fix: TypeError swallowed -> silent handoff failure | PASS | HIGH |
| 3 | P10 | phase-3-complete.md Decision 006 -- Handoff context builder zero LLM calls -- deterministic only; context-budget = threshold math | PASS | HIGH |
| 4 | P1 | phase-4-complete.md Wins -- Zero new I-1 violations: no Anthropic SDK imports in core; final verifier P7 grep clean | PASS | HIGH |
| 4 | P2 | phase-4-complete.md Tasks 4.0-4.13 -- Polish/docs/CI/Docker; no new functional scope beyond schedule/spawn/monitor/notify/handoff | PASS | HIGH |
| 4 | P3 | phase-4-complete.md Task 4.6 -- examples/stockforge-integration/ + examples/generic-project/; orch init is generic | PASS | HIGH |
| 4 | P4 | phase-4-complete.md Task 4.5 -- inject-hooks.ts backup->validate->atomic; .claude/settings.json merge = entire integration surface | PASS | HIGH |
| 4 | P5 | phase-4-complete.md Scorecard F3 PASS -- ccs failover continuity confirmed; ClaudeCodeAdapter execa path unchanged | PASS | HIGH |
| 4 | P6 | phase-4-complete.md fix-D (Phase 1 backport) confirmed stable -- IAGENT_RUNTIME token; adversarial re-confirmed PASS | PASS | HIGH |
| 4 | P7 | phase-4-complete.md Scorecard O1-O4 -- all PASS; OTEL trace root per queue item, spans nest under Orch root, cost queryable | PASS | HIGH |
| 4 | P8 | phase-4-complete.md Tasks 4.4/4.7/4.9/4.10 -- orch init < 60s, GitHub Actions CI, comprehensive README + docs, 2 examples | PASS | HIGH |
| 4 | P9 | phase-4-complete.md Task 4.12.r -- P2021-tolerance: releaseSessionLock catches Prisma P2021 -> warn not throw; +3 tests; 1375/1375 | PASS | HIGH |
| 4 | P10 | phase-4-complete.md Scorecard -- all 22 criteria pass; docs/architecture.md 314 lines; no new agent-intelligence features | PASS | HIGH |
| 5 | P1 | phase-5-complete.md Invariant I-1 -- grep core/src/modules/{queue,sessions/mailbox,hooks}+env-propagation.ts -> 0 hits | PASS | HIGH |
| 5 | P2 | phase-5-complete.md Charter Vision Alignment -- Did NOT add agent intelligence; loop-resilience + parallelization = mechanical work | PASS | HIGH |
| 5 | P3 | phase-5-complete.md Invariant I-2 -- only documentation references in core; no code hardcoding; max_concurrent via profile field | PASS | HIGH |
| 5 | P4 | phase-5-complete.md SC-8 -- max_concurrent_sessions per profile field; SC-10 --resume wiring in adapter; hook injection unchanged | PASS | HIGH |
| 5 | P5 | phase-5-complete.md SC-10 -- claude-code-adapter.ts:362 resume() argv contains --resume; spawn() argv does NOT; both asserted | PASS | HIGH |
| 5 | P6 | phase-5-complete.md Invariant I-3 -- adapter pattern preserved; SC-10 wiring pre-existed; 5.3.7 codified test coverage | PASS | HIGH |
| 5 | P7 | phase-5-complete.md SC-6 -- component-telemetry.sh ships; zod schema packages/core/src/telemetry/; 1938 JSONL lines on disk | PASS_WITH_CAVEAT | HIGH |
| 5 | P8 | phase-5-complete.md SC-4/5/6 -- skill validator + .test.md harness ships; scripts/skills-validate.ts exit-0 across 13 skills | PASS | HIGH |
| 5 | P9 | phase-5-complete.md SC-2/SC-3 -- Mode B API-truncation auto-recovery + Mode C premature wind-down hard guard wired | PASS | HIGH |
| 5 | P10 | phase-5-complete.md Retrospective s4.5 -- framework records data but does NOT read own data and propose changes | PASS | HIGH |
| 6 | P1 | phase-6-complete.md Block-Close 6.3 -- I-1 0 hits confirmed; 6.5.2 verifier grep all 6.x deliverables = 0 SDK matches | PASS | HIGH |
| 6 | P2 | phase-6-complete.md Retrospective C -- self-evolution loop architecturally functional but signal-thin; all SCs within scope | PASS | HIGH |
| 6 | P3 | phase-6-complete.md SC-25 -- worktree isolation via profile field worktree_path (opt-in); D018: adapter-owned, default false | PASS | HIGH |
| 6 | P4 | phase-6-complete.md SC-25 -- additive Prisma migration; zero DROP (D018); worktreePath field in schema; hook injection unchanged | PASS | HIGH |
| 6 | P5 | phase-6-complete.md SC-25 -- I-3 strict 3x execa(git, [...]); claude-code-adapter T1-T9 = 9/9 PASS; no SDK path opened | PASS | HIGH |
| 6 | P6 | phase-6-complete.md SC-25 -- claude-code-adapter.ts worktree lifecycle (T1-T9 specs); IAgentRuntime honored; D018 adapter-owned | PASS | HIGH |
| 6 | P7 | phase-6-complete.md SC-22 -- rollup-telemetry.ts ships; SC-23 -- telemetry-analyst subagent; 14 components from 2590 events | PASS | HIGH |
| 6 | P8 | phase-6-complete.md SC-24 -- master-planner v3 cites phase-N-routing-recommendations.md; D021 ratifies; install path unaffected | PASS | HIGH |
| 6 | P9 | phase-6-complete.md SC-19 -- INV-S9 fix: p50=105ms p99=126ms (was p50=567ms); subshell fire-and-forget; regression test | PASS | HIGH |
| 6 | P10 | phase-6-complete.md Retrospective C -- self-evolution loop conservative-by-design (Decision 017); no LLM added to daemon routing | PASS | HIGH |
| 7 | P1 | phase-7-complete.md H P7 -- grep packages/core/src/**/*.ts -> 6 matches all in doc-comments/test URLs; 0 in scripts/ | PASS | HIGH |
| 7 | P2 | phase-7-complete.md H P8 -- Net Phase 7 production LOC <= 280 (measured 278); scope = carryforward hardening only | PASS | HIGH |
| 7 | P3 | phase-7-complete.md SC-34 -- worktree-isolation integration spec uses tmpdir probe; SC-35 -- citation linter exit 0 | PASS | HIGH |
| 7 | P4 | phase-7-complete.md SC-37 -- Mandate E regression spec 3/3 PASS; hook injection unchanged; Phase 7 adds test/utility files only | PASS | HIGH |
| 7 | P5 | phase-7-complete.md F -- I-6 ABSOLUTE honored; ClaudeCodeAdapter execa path confirmed; decisions/026 defers sidecar | PASS | HIGH |
| 7 | P6 | phase-7-complete.md SC-34 -- I-3 strict execa(git, [...]); IAGENT_RUNTIME binding untouched; 7.3 spec probes adapter | PASS | HIGH |
| 7 | P7 | phase-7-complete.md SC-33 -- dispatch.jsonl real timestamps; SC-35 -- citation linter validates rollup; SC-39 DEFERRED | PASS_WITH_CAVEAT | HIGH |
| 7 | P8 | phase-7-complete.md SC-36 -- sc18-realworld.ts hygiene; SC-37 -- Mandate E in sandwich-architect.md; install path unaffected | PASS | HIGH |
| 7 | P9 | phase-7-complete.md B SC-38 -- byte-identical 1470/1470/1470 across 3 consecutive runs; 126/126 hooks PASS | PASS | HIGH |
| 7 | P10 | phase-7-complete.md SC-39 DEFERRED -- routing-recommendations.md classifies deferral; loop remains read-only | PASS | HIGH |

---

## Success-Criteria Spot-Check

| Family | SC ID | Evidence (path + artifact) | Verdict |
|--------|-------|----------------------------|---------|
| F | F1 plan auto-pickup | phase-4-complete.md F1 PASS -- chokidar watcher in ProjectRegistryService; plan drop -> enqueue event | PASS |
| F | F3 ccs failover | phase-1-complete.md verification/ccs-resume.md -- cross-account resume not seamless; handoff-builder alternative; F3 redefined per D1+D8 | PASS |
| F | F4 230K graceful end | phase-3-complete.md Wins -- integration test: force_handoff_at_tokens=1000 + synthetic spans -> forceHandoff -> DB row -> spawn | PASS |
| F | F7 orch init < 60s | phase-4-complete.md F7 PASS -- static review; fast-path mkdirs + 32-byte token write | PASS |
| F | F8 2+ projects | phase-5-complete.md SC-8 -- max_concurrent N=2 across DIFFERENT projects integration test; F8 PASS | PASS |
| N | N1 TS strict zero any | phase-4-complete.md Wins -- Zero new TypeScript any: all packages strict-clean; N1 PASS | PASS |
| N | N3 no queue corruption | phase-1-complete.md Task 1.4 -- PrismaService WAL mode, FK enforcement; phase-5-complete.md SC-7 -- atomic claim | PASS |
| N | N6 72h memory leak | phase-5-complete.md SC-14d PARTIAL -- 72h protocol documented; n6-rss-sample.md written; NOT_RUN through Phase 7 | DRIFT_LOW |
| O | O1 OTEL trace root | phase-1-complete.md Task 1.7 -- TracingService W3C propagation; phase-2-complete.md Task 2.9 -- OTLP exporter; O1 PASS | PASS |
| O | O3 cost queryable | phase-3-complete.md Task 3.8 -- GET /sessions/:id/usage + UsageChartPage; phase-4-complete.md O3 PASS | PASS |
| S | S1 destructive confirm | phase-1-complete.md I-6 -- confirm=1 gate wired; 5 test cases; Telegram inline-keyboard confirm | PASS |
| S | S2 no credential reads | phase-1-complete.md I-5 -- grep .ccs/.claude/ packages/core/src/ -> empty; confirmed every phase-end verifier | PASS |
| S | S3 UI localhost | phase-2-complete.md -- Web UI 127.0.0.1:4142; LAN-IP refusal confirmed I-7; phase-4-complete.md S3 PASS | PASS |
| S | S4 projects read-only | phase-4-complete.md Task 4.5 -- inject-hooks.ts backup->validate->atomic; user-invoked orch attach; S4 PASS | PASS |

---

## Findings Preview (inputs to 8.3.2 -- do NOT rate here)

The following are the most consequential potential drift candidates across the 0-7 grid.
Ratings and synthesis are 8.3.2 responsibility.

1. P6 Phase 1 adapter soft-violation found and fixed: phase-1-complete.md fix-D -- SessionManager initially injected concrete ClaudeCodeAdapter, violating adapter abstraction. Caught by adversarial verifier at Task 1.16; corrected via IAGENT_RUNTIME token. Principle upheld after fix, but initial implementation drifted before first adversarial review.

2. N6 never empirically run: phase-5-complete.md SC-14d PARTIAL -- N6 (72h memory leak) is the only charter success criterion never empirically run as of Phase 7 close. Protocol documented; user-action TODO before v2.0 GA.

3. SC-39 self-evolution loop signal-thin: phase-7-complete.md SC-39 DEFERRED -- Phase 6 rollup signal too thin for actionable proposals (100% success_rate; only RULE-1 fired on unknown-agent sentinel). Charter s2 promises self-loop-upgrade; loop architecturally present but no real upgrade produced.

4. dispatch.jsonl pairing asymmetry (CF-21): phase-7-complete.md B SC-33 PASS_WITH_CONCERN -- 1 DISPATCHED + 19 COMPLETED = asymmetric (PreToolUse(Task) seam not firing reliably). Observability of subagent dispatch incomplete.

5. P7 Phase 5 INV-S9 one-phase violation window: phase-5-complete.md SC-6 -- telemetry hook latency 567ms median vs <50ms target. Drift for one full phase before Phase 6 SC-19 fix (p50=105ms). Latency regressions can slip through a full phase.

6. SC-27 real-world parallelism proxy methodology: phase-6-complete.md SC-27 PARTIAL -- result-file headline 0/3 substages >=35% due to mtime-proxy limitation. 75% wallclock efficiency claim proven on synthetic fixture (SC-18) but real-substage measurement proxy failed. CF-18 deferred to v2.2/v2.3.

7. Architect-spec-vs-reality pattern (7 incidents Phases 5-6): phase-6-complete.md B.1 -- recurring pattern: 5.3.2, 5.3.3, 6.1.2 C.5, 6.1.4 C.2, 6.2.4, 6.3.7, 6.4.2. Mitigation = Mandates A-E in Phase 6/7, but pattern recurred even after Phase 5 retrospective documented it.

8. P4 inject-hooks.ts JSDoc step-numbering inconsistency: phase-4-complete.md Carryforwards -- JSDoc header says backup->validate->atomic; actual impl is validate->backup->atomic; substance correct, doc cosmetic. Minor documentation drift in integration surface.
