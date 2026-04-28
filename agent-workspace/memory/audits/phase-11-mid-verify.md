# Phase 11 mid-verify — substage 11.4

Date: 2026-04-28 session #46
Run by: orchestrator-side inline (10.4 precedent permitted)

## Verdict

**ALL_PASS 8/8 CLASS-A.** Phase 11 mid-verify gate GREEN. 11.5.1 unblocked.

## Pre-substage state

- 11.0 routing brief: DONE (`agent-workspace/memory/phase-11-routing-brief.md`).
- 11.1 hygiene batch: DONE (verification dispatch confirmed 11/11 CFs already
  applied in commit `92f50ec` v2.5; canary write to `scripts/` succeeded post-
  rename; all gates pass).
- 11.2 audit-trail discipline: DONE_WITH_CONCERNS (orchestrator-side; observation
  file `task-11.2-20260428-audit-trail.md`; new skill
  `.claude/skills/observation-file-write-on-return/`).
- 11.3 CF-DOGFOOD-2 disposition: DONE (DEFER_V2.7 per Decision 039;
  `carryforwards-v2.7.md`).

## CF-V2.6-SUBAGENT-WRITE-PATH-ANOMALY — RESOLVED (this session)

**Root cause confirmed**: post-Claude-Code-5.2.7 harness contract changed
agent/skill/command frontmatter `tools:` → `allowed-tools:` AND test-fixture
H2 sections `## Expected Behavior` → `## Expected behavior (PASS)` and
`## Failure Modes` → `## Named failure modes`. Session #45 batch-renamed all
26 SKILL/test files to satisfy the **runtime** contract but the project's
`scripts/audit/config-style-lint.ts` (LR-02 + LR-19) still enforced the
**legacy** contract. The pre-commit hook A.5 was bypassed at v2.5 commit
(user `!` prefix) so the drift was masked.

**This session's fix** (orchestrator-side):
1. Renamed `tools:` → `allowed-tools:` in all 10 `.claude/agents/*.md` (probe
   of hypothesis 3; canary `Write` to `scripts/.canary-11.1-allowed-tools-test.txt`
   from subagent succeeded — confirmed runtime needs `allowed-tools:`).
2. Renamed `tools:` → `allowed-tools:` in all 9 `.claude/commands/*.md`.
3. Inverted `config-style-lint.ts` LR-02 (forbid legacy `tools`, require
   `allowed-tools`) and LR-19 (require new H2 names).
4. Updated 24 inline test fixtures in `config-style-lint.spec.ts`.
5. Fixed 2 stragglers: `telemetry-analyst.test.md` H2 names + added `## Metrics`
   to `observation-file-write-on-return.test.md`.

Spec test result: 58/58 PASS. On-disk lint result: 0 errors, 14 warnings
(all non-blocking LR-20 / LR-23 / LR-28).

## Gate run results

| Gate | Verdict | Duration |
|------|---------|----------|
| A.1 Lint (eslint) | PASS | 8219ms |
| A.2 Typecheck (tsc --noEmit) | PASS | 3565ms |
| A.3 Vitest suite | PASS | 22218ms |
| A.4 Invariant grep sweep (I-1..I-15) | PASS | 1823ms |
| A.5 Config-style lint | PASS | 936ms |
| A.6 Charter-coherence spot-check | PASS | 113ms |
| A.7 Hook-latency budget | PASS | 731ms |
| A.8 Hook-coverage + dispatch-pairing + adapter-import lint | PASS | 26553ms |

`oss-readiness.sh`: PASS (exit 0, all checks clean).
`drift-check.sh`: PASS (0 violations across 5 categories: project_name_leakage,
nestjs_in_domain, hardcoded_paths, llm_in_daemon, cross_feature_imports).
`dispatch-pairing-rate.sh`: SKIP (structural ID-space mismatch 21/23
toolu_*-vs-hex per Decision 035 / CF-21 — re-evaluate at v2.6 close after
R-1 session restart). **This SKIP is Phase-11 evidence for 11.5.1 R-1 probe.**

## Test counts

`pnpm test` aggregate: PASS (counts via subagent-reported 11.1 verification:
1302/1302; this session's spec-only runs match — config-style-lint.spec.ts
58/58, full A.3 PASS).

## 11.5.1 unblocked

All 11.4 acceptance criteria met. Next: dispatch **11.5.1 sandwich-architect**
(opus/medium, ~80K) to author `session-plans/pending/11.5-sc39-r1-r3-architect.md`
covering R-1 verification probe + production-vs-fixture-gap integration test
per Decision 035 §6.

## New v2.6 carryforward

**CF-V2.6-LR02-LR19-CONTRACT-DRIFT** — Add CI-level guard preventing future
silent drift between Claude Code runtime contract and project `config-style-lint.ts`
rules. Recommended action items:
1. Pre-commit hook re-enable (was bypassed at v2.5 commit via `!` prefix).
2. Document the runtime contract in `agent-workspace/constitution/architecture.md`
   citing Claude Code 5.2.7+ specifically (allowed-tools / Expected behavior (PASS)
   / Named failure modes).
3. Schedule periodic harness-audit run with explicit LR-02/LR-19 spot-checks.
