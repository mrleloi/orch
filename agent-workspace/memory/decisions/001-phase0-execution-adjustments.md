# Decision 001 — Phase 0 Execution Adjustments

**Date**: 2026-04-24
**Author**: Claude Opus 4.7 (autonomous session #1)
**Context**: Phase 0 re-evaluation after feat_01_upgrade_agent_configs completed

---

## Context

The Phase 0 master plan in `session-plans/pending/phase-0-research.md` was authored before the agent-config upgrade in feat_01. That upgrade introduced:

- `research-scanner` subagent (sonnet) — purpose-built for studying one reference repo
- Model routing constitution (opus for planning/review, sonnet for execution)
- Subagent-driven development discipline (parallel per-task subagents)
- New `task-implementer` / `spec-compliance-reviewer` / `code-quality-reviewer` pair pattern
- Hook profiles (minimal/standard/strict) switchable via `ORCH_HOOK_PROFILE`

Phase 0 needs no structural changes (the task list is still correct), but execution strategy adapts.

---

## Decision

**Phase 0 plan stays.** No task additions or removals. Execution adapts as follows:

### Tasks 0.6–0.8 (study reference repos) → dispatch in parallel batches

Instead of sequential RESEARCH sessions, each target repo is delegated to a fresh-context `research-scanner` subagent (sonnet, ~20-25K per invocation). Dispatch in parallel batches up to 3-4 scanners at a time. Main session aggregates the markdown notes. Budget savings: ~30-40K vs. serial reads in one session.

### Tasks 0.2–0.5 (primitive verification) → mixed execution

I'm running INSIDE Claude Code RIGHT NOW. I cannot cleanly spawn a second Claude Code session to test hooks without environment conflicts. Reality check:

- **0.2 (hooks roundtrip)**: Document via context7 docs fetch (authoritative Claude Code hook payload schema). Write `research/verification/hooks.md` as a specification note with example payloads. Flag as "user to run end-to-end test when daemon skeleton exists in Phase 1". Do NOT block Phase 1.
- **0.3 (ccs + resume)**: Document `ccs --help` surface + cross-account behavior from kaitranntt/ccs README. Flag continuity as assumption pending user test with 2 accounts.
- **0.4 (OTEL Langfuse)**: Document docker-compose snippet from ColeMurray/claude-code-otel. Actual "docker compose up" deferred — running Langfuse inside this session is out-of-scope (adds 10+ min setup, not required for Phase 1 code). Flag as Phase 3 work.
- **0.5 (TRACEPARENT)**: Document the format (W3C Trace Context) + Claude Code's `CLAUDE_CODE_ENABLE_TELEMETRY=1` env vars. Actual verification pushed to Phase 1 when daemon wires up OTEL.

This is consistent with autonomous-protocol Rule 5 ("If SPEC is silent, document AS ASSUMPTIONS and flag for user verification; do NOT block").

### Task 0.1 (scaffold) → skip pnpm-install step

`pnpm` is not installed on user's PATH (`which pnpm` → not found). Create config files (package.json, pnpm-workspace.yaml, tsconfig.base.json, .gitignore) but do NOT run `pnpm install`. Phase 1 first task will install pnpm.

### Task 0.10 (synthesis) → use extended thinking

Synthesis is the one cross-cutting reasoning step. Performed in the main (opus) session with careful framing. No subagent — synthesis requires reading all notes in context.

### Task 0.11 (refine Phase 1 plan) → dispatch master-planner subagent

Per model-routing constitution: phase decomposition = opus = master-planner. Fresh context preserves main-session budget.

---

## Why

1. **Simplicity First (P2)**: no need to re-architect the plan; the plan is good. Adapt execution only.
2. **Budget discipline (session-budgets.md)**: Phase 0 serial estimation was 300-400K across sessions. Parallel subagents cut main-session consumption by ~60%.
3. **Charter Principle "daemon is dumb, workers are smart"**: research-scanner per-repo mirrors this pattern at the planning layer.
4. **Pragmatism**: primitive verification that requires side-effects (Docker, 2nd Claude account, live hooks) is better done once the daemon skeleton exists and can be the verification harness itself. Phase 1 end-state is a minimal daemon; verifying against it is more useful than verifying against ad-hoc throwaway scripts.

---

## Risks

- If reference repo clones fail (github rate limit, network), parallel scanner dispatch is wasted. Mitigation: clone serially first, then dispatch scanners on already-local copies.
- If a scanner goes >25K tokens per repo, budget discipline slips. Mitigation: enforce budget cap in scanner prompt.
- If I skip too many primitive verifications, Phase 1 may hit an assumption that's wrong. Mitigation: clearly list assumptions in each `verification/*.md` file so they're testable later.

---

## Outcome

Proceeding with this adjusted execution. No changes to `session-plans/pending/phase-0-research.md` (it's still the spec). This decision doc is the execution strategy overlay.
