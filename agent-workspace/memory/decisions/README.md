# Decisions Log

> Autonomous mode writes one file per non-trivial decision made without user input.
> Format: `NNN-short-slug.md` where NNN is zero-padded sequential.

## Template

```markdown
# Decision NNN: <Short title>

**Date**: YYYY-MM-DD
**Session**: N
**Status**: active / superseded-by-XXX

## Context
<What was the ambiguous situation?>

## Options Considered

### Option A: <name>
- Pros: ...
- Cons: ...

### Option B: <name>
- Pros: ...
- Cons: ...

## Decision
<Chosen option + why>

## Charter Reference
<Which charter principle or rule applied, if any>

## Consequences
<What this enables, what this precludes>

## Reversibility
<Easy / Moderate / Hard to reverse>
```

---

## Index

| # | File | Title | Status |
|---|---|---|---|
| 001 | 001-phase0-execution-adjustments.md | Phase 0 Execution Adjustments | active |
| 002 | 002-task-1.7-sandwich-dev-vs-task-implementer.md | Task 1.7 Subagent Selection | active |
| 003 | 003-task-1.8-sandwich-dev-rationale.md | Task 1.8 Subagent Rationale | active |
| 004 | 004-context-full-ingestion-mode.md | Context-Full Ingestion Mode | active |
| 005 | 005-trace-backend-toggle.md | Trace Backend Toggle | active |
| 006 | 006-handoff-no-llm.md | Handoff No-LLM Design | active |
| 007 | 007-handoff-tx-ordering.md | HandoffContext Transaction Ordering | active |
| 008 | 008-handoff-spawn-locus.md | HandoffOrchestrator Spawn Locus | active |
| 009 | 009-cache-read-attr-name.md | Cache-Read OTEL Attribute Name | active |
| 010 | 010-task-3.10-http-vs-sse-timing.md | Task 3.10 HTTP-as-Proxy vs. SSE-Listener Timing | active |
| 011 | 011-terminal-management-strategy.md | Terminal Management Strategy (SendKeys → tmux v2.x) | open |
| 012 | 012-5.3-module-paths.md | Phase 5.3 Module Paths (`packages/core/src/modules/`) | active |
| 013 | 013-5.3-max-concurrent-scope.md | 5.3.8 Scope (field exists; wire dispatcher + `.max(8)`) | active |
| 014 | 014-5.3-worktree-deferred.md | Worktree Isolation Deferred to v2.1 | active |
| 015 | 015-5.3-claim-service-location.md | QueueClaimService in `queue/` Module | active |
| 016 | 016-5.3-otlp-prefix-glob.md | OTLP Env-Var Propagation = Prefix-Glob | active |
| 017 | 017-6.2-feedback-loop-architecture.md | Phase 6.2 Self-Evolution Feedback Loop (two-stage: rollup + analyst subagent) | active |
| 018 | 018-6.3-worktree-scope.md | Phase 6.3 Worktree Isolation (adapter-owned, opt-in profile field, additive Prisma migration; default false) | active |
| 019 | 019-6.4-real-world-sc18-method.md | Phase 6.4 Real-World SC-18 (production-telemetry replay; threshold ≥35% on ≥2 of 3 substages) | active |
| 020 | 020-6.x-i6-binding.md | Phase 6 I-6 Binding (zero commits across entire phase; v2.0 stays staged; v2.1 also stages-only at 6.5.4) | active |
| 021 | 021-6.2-telemetry-analyst-tier.md | Telemetry-Analyst Tier — Sonnet (downgrade from architect §R-5 opus escalation) | active |
| 022 | 022-7.1-inv10-reporter-approach.md | Phase 7.1 INV-10 Reporter Approach for #11a/#11b — informational reporter (NOT useFakeTimers, NOT process.platform gate) | active |
| 023 | 023-7.2-dispatch-jsonl-schema.md | Phase 7.2 dispatch.jsonl schema for SC-33 (dedicated machine-readable dispatch event log; 9-field schema) | active |
| 024 | 024-7.4-citation-linter-cli.md | Phase 7.4 Citation Linter CLI Shape — `--rollup <path>` flag; CREATE new standalone scripts/utilities/citation-linter.ts | active |
| 025 | 025-7.7-sc39-defer.md | Phase 7.7 SC-39 DEFER to v2.3 (signal-thin: only RULE-1 fires on `unknown-agent` data-capture artifact) | active |
| 026 | 026-cf21-tool-use-id-correlation-defer.md | Phase 7.3 CF-21 Defer tool_use_id Correlation Probe to v2.3 (root causes A/B; sidecar fallback fix-list) | active |
| 027 | 027-phase-8-strategic-redirect.md | Phase 8 Strategic Redirect — invalidate carryforward burndown plan; pivot to drift-audit + self-application + community-readiness; fold CF-21..CF-26 into substage of new plan | active |
| 028 | 028-config-style-normative-format.md | Config-style normative format for `.claude/{agents,skills,commands,hooks}` — canonical `tools` key; `archetype` for skills; LOC ceilings; integrate-into-Process rule; narrow `Write(.claude/**)` permission | ratified |
| 029 | 029-tenancy-model-file-level.md | Tenancy model — file-level workspace separation (`<user-id>/projects/<project>/`); POSIX 0700 ACL + runtime scope-resolver; daemon-level fallback documented for v2.4 | ratified |
| 030 | 030-license-mit.md | LICENSE — MIT (5/5 surveyed reference repos use MIT; DCO sign-off mitigates patent-grant gap; relicensing path documented for v3.0+) | ratified |
| 031 | 031-telemetry-sync-wire-format.md | Telemetry sync wire format — opt-in NDJSON over HTTPS POST; OFF by default; pluggable `ITelemetrySink`; user-scope only; OTEL-coexistent | ratified |
