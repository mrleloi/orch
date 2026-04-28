---
task: 10.5 (whole substage — SC-39 Structural Unblock)
title: Sandwich-Verifier — Whole-Substage Adversarial Review
date: 2026-04-28
agent: sandwich-verifier (opus 4.7, ORCH_SPAWNED, bg a038e6b7d4204180b)
verdict: PASS_WITH_CONCERNS
critical: 0
important: 1
minor: 9
v2_5_blocking: false
---

# Substage 10.5 — Verifier Report

## Verdict
**PASS_WITH_CONCERNS** — 10.5 substage closes cleanly; no v2.5 remediation required.

## Round 1 — Engineering Chain Trace

### Architect → Implementer
All 8 Part-B contract clauses (B.B.1-4 + B.C.1-4) match implementation. IMP-1 field-name divergence (`agent_type` vs spec's `subagent_type`) is architect-deferred per Decision 023 alignment; routed to CF-V2.6-10.5-AGENT-TYPE-NAMING-DIVERGENCE.

### Probe → Decision (Case γ confirmation)
Independent re-derivation from `recv-20260427T195459820487100.json`:
- `tool_use_id` = `toolu_01C9JDETVxTAmZUMWo3bzKcS` (toolu_*, ~31 chars)
- `agent_id` = `af139d6714b04d90e` (17-char hex)
Different format, different value → **Case γ confirmed**. 10.5.2.B's two-key implementation IS case γ, not case-α-with-γ-labeling.

### Reviewers → Implementer
All BLK + IMP findings accounted for:
- B-spec BLK-1 (PostToolUse wiring) → fixed in B-fix
- B-spec BLK-2 (null on miss) → fixed in B-fix lines 99-108 + H10 test
- 4 B-CQ + 2 C-CQ concerns → all routed to v2.6 carryforwards.md

### Audit-trail gap (the 1 important finding)
The B initial spec-compliance observation file (`task-10.5.2.B-20260428-spec-compliance.md`) and B-fix spec re-review file (`task-10.5.2.B-fix-20260428-spec-compliance.md`) cited in the verifier brief do not exist as standalone artifacts in `observations/`. The reviews demonstrably happened (premises cited downstream in B-CQ + B-fix observation), but the standalone report files are missing. **Non-blocking** — the engineering outcome is correct and the audit chain can be reconstructed from downstream citations.

## Round 2 — Measurement & Verdict Integrity

### Artifact independent re-derivation (5/5 PASS)

| Artifact | Claimed | Re-derived | Verdict |
|---|---|---|---|
| unknown-agent-bucket-prevalence-v2.5.json | total=8031, agent=200, unknown=200, frac=1.000 | total=8107, agent=202, unknown=202, frac=1.000 | ✓ (delta = natural growth; ratio identical) |
| cf21-real-dispatch-sample-v2.5.json | dispatched=12, completed=136, paired=0, rate=0.000 | dispatched=14, completed=138, paired=0, rate=0.000 | ✓ |
| sc39-prereq-volume-v2.5.md | total=8031, shortfall=1969 | 8107 (same FAIL) | ✓ |
| cf33-state-v2.5.md | dir absent, 0 importers | confirmed via fs + grep | ✓ |
| phase-10-rule-eval.md | R3=NO-FIRE, R4=NO-FIRE | confirmed | ✓ |

### Decision 035 verdict integrity
3 PASS / 3 FAIL exactly matches 035 §2 table. §7 supersession statement is materially true: 035 §5 R-1/R-2/R-3/R-4 absorbs Decision 034 §"Re-attempt Prerequisites".

### Root-cause claim cross-check
- B + C unit + integration tests still PASS at expected rates (recorder 11/12 with 1 win32 skip; sc39-pairing-rate 1/1 at rate=1.000; component-telemetry 14/14)
- `.claude/settings.json` PostToolUse[1] = `dispatch-jsonl-recorder.sh` (parsed via jq)
- Engineering-vs-measurement attribution holds.

## Round 3 — Invariants & Scope

| Invariant | Result |
|---|---|
| I-1 (no SDK imports) | PASS — 0 matches in modified hook scripts |
| I-2 (no project-name hardcoding) | PASS |
| I-3 (no claude-agent-sdk) | PASS |
| I-5 (no `~/.ccs/`/`~/.claude/credentials`) | PASS |
| I-14 (no module-level let/var) | PASS |
| I-6 (`git log` = 1 commit) | PASS |

Scope creep: NONE. The one out-of-list file (`autonomous-stop-watchdog.sh`) predates 10.5 by ~4h (mtime 2026-04-27 23:11 vs 10.5.2 dispatch ~03:00 2026-04-28); attributable to earlier mode-c-recovery work.

## Round 4 — Hidden Risks

### Production-vs-fixture gap severity
Decision 035 §6 logs `CF-V2.6-10.5.3-PRODUCTION-VS-FIXTURE-GAP` calling for an integration test that spawns a CHILD claude process to verify end-to-end pairing across a fresh session boundary. **Severity correctly stays at v2.6 task** — this would have caught the settings.json read-once gap before measurement burned the v2.5 retry cycle.

### Decision 035 supersession
§7 verified materially true. Future v2.6 SC-39 retries cite 035 §5, not 034.

## Karpathy P1-P4
All four PASS. Diagnostic probe (10.5.2.A) ratified Case γ before lock; single shared sidecar (D1) + additive schema (D2); ~70 LOC production delta; binary verdict (DEFER-V2.6) with explicit prerequisites.

## Findings Summary

| Severity | Count | Status |
|---|---|---|
| Critical (block v2.5) | 0 | — |
| Important (route to v2.6) | 1 | audit-trail gap on missing B-spec observation files |
| Minor (already in carryforwards-v2.6.md) | 9 | all routed |

## Recommendation
**MERGE** — 10.5 substage closes cleanly. Phase 10 progression continues to **10.6 (decision-doc backfill + F-2 self-evolution gating)**. F-2 defers to v2.6 alongside SC-39 per Decision 035 §8.4.
