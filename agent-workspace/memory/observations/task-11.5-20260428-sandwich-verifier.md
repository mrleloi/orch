# Sandwich-Verifier Adversarial Review — Substage 11.5 (SC-39 R-1/R-3 Retry Framework)

- Date: 2026-04-28
- Reviewer: sandwich-verifier (opus 4.7, ORCH_SPAWNED=true, effort opus/medium)
- Phase: 11, substage 11.5.3 stage 2 (adversarial whole-substage review)
- Verdict: APPROVED_WITH_MINOR_CONCERN
- Decision: 11.5 substage CLOSED; proceed to 11.6 (F-2 gated; no-op under DEFER_V2.7).

## Scope under review

- Architect spec: agent-workspace/session-plans/pending/11.5-sc39-r1-r3-architect.md (479 LOC)
- D1 R-1 probe artifact: agent-workspace/memory/observations/task-11.5.1-r1-probe-result.md
- D2 production integration test: tests/integration/sc39-production-pairing-rate.spec.ts (242 LOC)
- D3 audit script: scripts/audit/settings-version-check.sh (77 LOC)
- D4 SKILL.md update: .claude/skills/spawned-session-mode/SKILL.md (155 LOC; body 148)
- Implementer report: task-11.5.2-20260428-impl.md
- Spec-compliance review: task-11.5.2-20260428-spec-compliance.md (PASS_WITH_CONCERNS, 14/14 gates)
- Code-quality review: task-11.5.2-20260428-code-quality.md (APPROVED_WITH_CONCERNS, 6 CFs)
- BINDING decision: agent-workspace/memory/decisions/037-sc39-retry-verdict-v2.6.md (748 LOC, DEFER_V2.7)
- Carryforwards: agent-workspace/memory/carryforwards-v2.7.md

## Adversarial Probes (P0-P12)

### P0 — I-6 Binding (Zero git commits) — PASS

git log --oneline | wc -l = 3, equal to pre-substage baseline (init 326ab0c, v2.5 92f50ec, signoff 2a395d5). No new commits authored across the 11.5 substage. Decision 037 section 11 explicitly states: No source code modified by this decision. Decision 037 is a doc-only artifact. I-6 binding (zero commits) maintained. Confirmed.

### P1 — R-1 FAIL Diagnosis Independent Verification — PASS

Sampled agent-workspace/memory/dispatch.jsonl (170 rows total): DISPATCHED rows = 23; COMPLETED rows = 147; rows with tool_use_id null = 17; rows with tool_use_id starting toolu = 19 (all DISPATCHED — no COMPLETED has toolu_* tool_use_id).

Sampled rows 155-169 (session 0c566041-dcaa-4ba4-9607-6a9d41d4e6ba) verbatim. Field comparison: DISPATCHED row 159 has dispatch_id=toolu_01E9zE2egMTnLUCnnXWJKbrZ, tool_use_id=toolu_01E9zE2egMTnLUCnnXWJKbrZ. COMPLETED row 160 has dispatch_id=aaab70d6f388092e4 (hex), tool_use_id=null.

Pairing rate empirically 0/21 = 0.000. Regex inspection at scripts/hooks/dispatch-jsonl-recorder.sh:33 confirmed: const m = resultText.match against agentId hex pattern. The agentId hex field is empirically absent from every real Agent tool result text in dispatch.jsonl. R-1 FAIL diagnosis independently confirmed.

### P2 — Decision 037 Supersession of Decision 035 — PASS

Decision 037 section 1 explicitly cites Decision 035 by ID. Section 10 Supersession Statement provides binding language: This Decision 037 SUPERSEDES Decision 035 DEFER-V2.6 verdict. R-1 FAIL / R-2 INSUFFICIENT_VOLUME / R-3 NOT-COLLECTED verdicts each cite specific evidence references. The W-1/W-2/W-3/W-4 v2.7 prereq framework (section 5) is enumerated without binding on a fix candidate (section 6 lists W-1-A through W-1-D as non-binding alternatives, deferring selection to v2.7 architect).

### P3 — Architect-Spec to IMPL to Verdict Consistency — PASS

Decision 037 section 2.1 cites: probe artifact task-11.5.1-r1-probe-result.md; dispatch.jsonl rows 155-169 (verbatim line 159 + line 160 quoted in 2.1); regex location dispatch-jsonl-recorder.sh:33 cited in 2.1 footer + 3.1 root cause; volume evidence 21 dispatches / 0 paired = 0.000. Cross-check confirms architect spec to IMPL probe to reviewer attestation to Decision 037 evidence chain is consistent.

### P4 — D2 Production Integration Test Viability — PASS

Inspected tests/integration/sc39-production-pairing-rate.spec.ts. Three test cases. Case 1: expect rate >= 0.40 against real spawned claude --print. Under R-1 FAIL would compute dispatched > 0 true (PreToolUse fires) but recs.length = 0 (loadTaskFinishRecordsFromDispatchJsonl groupBy on toolu_* dispatch_id finds zero matches because all COMPLETED rows have hex dispatch_id). Therefore rate = 0/N < 0.40 -> FAIL. Once W-1 is fixed, COMPLETED rows will have toolu_* dispatch_id matching DISPATCHED, recs.length will equal dispatched, rate -> 1.0 -> PASS. Test is asymmetric: would FAIL-on-FAIL, PASS-on-PASS — exactly the regression-detection signature required.

Cases 2+3: fixture-mode baseline + corrupted-settings fixture. Demonstrates the production-vs-fixture gap by exhibiting fixture immunity to harness corruption. All three cases skip on Windows (current platform); Cases 2+3 also skip on no-bash. Skipping does NOT mean always-pass — vitest it.skipIf records skips, not pseudo-PASS. Test wired correctly for Decision 037 section 6 W-1-VERIFY (V1a) once a Linux/CI session runs it post-W-1 fix.

### P5 — D3 settings-version-check Real-Problem Solving — PARTIAL_PASS

Script implements baseline-vs-current sha256 comparison correctly. The settings.json read-once problem (Decision 035 section 3.1) is genuine — the script detects mid-session edits that would be silently inert. However, three quality concerns from code-quality review are acknowledged: HASH-CRLF-UNSTABLE (line 65 reads baseline w/ tr trim but line 66 hashes file directly — Windows CRLF in settings.json produces different sha256 than LF); BASH-STRICT-MODE-INCOMPLETE (line 18 set -uo pipefail missing -e; ERR trap incomplete); HASH-UNAVAILABLE-FALSE-PASS (line 35 returns sentinel string that compares equal in both --init and audit modes). All three are tracked in carryforwards-v2.7.md section CF-V2.7-SC39-SETTINGS-VERSION-CHECK-HASH-FIXES with explicit fix actions. Script is deferred-deploy (Decision 035 section 6 DR4 — wiring inert in current session) so the bugs are non-blocking for v2.6 close.

### P6 — D4 SKILL.md Trim (LR-04 ceiling) — PASS

wc -l .claude/skills/spawned-session-mode/SKILL.md = 155. Body LOC (lines 8-155 after frontmatter) = 148. LR-04 ceiling is 150. Body is 148 <= 150 — under ceiling. The orchestrator mid-substage trim addressed CF-V2.6-11.5.2-SKILL-LOC-CEILING-BREACH from code-quality review. Cross-references preserved: line 130 cites decisions/035-sc39-retry-verdict-v2.5.md, line 132 cites scripts/audit/settings-version-check.sh. G12 cross-reference preservation confirmed. (Note: config-style-lint reports body LOC=149 against LR-20 soft target 120; the skill-discipline archetype ceiling enforcement is at LR-04=150 per current lint config. Both 148 and 149 are under the hard ceiling.)

### P7 — Audit Trail Completeness (observation-file-write-on-return) — PASS

ls agent-workspace/memory/observations/ | grep task-11.5 returns: task-11.5.1-r1-probe-result.md, task-11.5.2-20260428-code-quality.md, task-11.5.2-20260428-impl.md, task-11.5.2-20260428-spec-compliance.md. Every reviewer + implementer + probe-runner subagent in this substage produced a canonical observation file. No inline-only returns. The new observation-file-write-on-return skill (11.2 deliverable) discipline is honored throughout 11.5.

### P8 — Code-Quality Carryforwards in v2.7 List — MINOR_CONCERN

Of the 4 v2.7 CFs flagged in the prompt: HASH-CRLF present in CF-V2.7-SC39-SETTINGS-VERSION-CHECK-HASH-FIXES (carryforwards-v2.7.md line 164); BASH-STRICT-MODE present (line 166); HASH-UNAVAILABLE-FALSE-PASS present (line 168); POLL-LINES-TIMEOUT-FLAKE NOT in carryforwards-v2.7.md but IS documented in Decision 037 section 7.6 with severity nitpick and v2.7 action (Consider increasing timeout to 30s or making it configurable via ORCH_SC39_POLL_TIMEOUT_MS env var). Severity: minor. Decision 037 captures the CF; the working list omission means it will not surface during v2.7 carryforward burndown unless v2.7 architect re-reads Decision 037 section 7. Recommend appending to carryforwards-v2.7.md as CF-V2.7-SC39-POLL-LINES-TIMEOUT-FLAKE for completeness. Non-blocking.

### P9 — Charter Coherence — PASS

bash scripts/audit/charter-coherence-spot-check.sh -> [PASS] charter-coherence-spot-check: no hard-rule softening detected. Decision 037 contains zero references to anthropic, openai, anthropic-ai sdk, claude-agent-sdk, ClaudeSDKClient, or stockforge. No LLM-in-daemon, no hardcoded project name, no cross-feature import drift introduced by this decision.

### P10 — Determinism Gates — PASS (1512 PASS / threshold 1302)

pnpm typecheck -> all 5 packages PASS (cli, shared, core, web-ui, telegram). pnpm lint -> 0 errors, 4 warnings (web-ui react-refresh, pre-existing). pnpm tsx scripts/audit/config-style-lint.ts -> 0 errors, 15 warnings (LR-08/LR-20/LR-23/LR-28; all pre-existing soft warnings, none blocking). pnpm test -> exit 0; aggregate 1512 PASS across 120 test files (1139 core + 40 shared + 45 cli + 125 telegram + 163 web-ui). Threshold >=1302 cleared by +210.

### P11 — Phase 11 Baseline (post-phase.sh fallback) — PASS

scripts/audit/post-phase.sh does not exist; per prompt fallback, referenced agent-workspace/memory/audits/phase-11-mid-verify.md. Mid-verify reports ALL_PASS 8/8 CLASS-A. Phase 11 mid-verify gate GREEN. 11.5.1 unblocked. A.5 spot-check (pre-commit hook contract; CF-V2.6-LR02-LR19-CONTRACT-DRIFT) was RESOLVED in Session #46 mid-verify (per audit sections 22-30) — contract enforcement and runtime contract are now aligned post tools-to-allowed-tools rename.

### P12 — P3 Surgical Scope — PASS

git status --short reports 30 modified files + 16 untracked. Trace audit: 11 agent + 8 command + scripts/audit/config-style-lint.ts + .spec.ts trace to orchestrator-side mid-verify rename for CF-V2.6-LR02-LR19-CONTRACT-DRIFT (documented in Decision 037 section 7.4 OUT-OF-SCOPE-LINTER-REFACTOR retiring the false flag against 11.5.2 IMPL). .claude/skills/spawned-session-mode/SKILL.md = D4 IMPL deliverable + orchestrator post-trim. agent-workspace/memory/checkpoints/latest.md, component-telemetry.jsonl, subagent-index.md, parallel-benchmark-result.md, verify-fallback.jsonl = routine telemetry/checkpoint progression (autonomous-protocol Session Protocol End). carryforwards-v2.7.md = Decision 037 section 8 mandated additions. Untracked: .claude/skills/observation-file-write-on-return/ (11.2 deliverable), agent-workspace/memory/.settings-loaded-hash (D3 baseline init), audits + decisions + observations + sessions + session-plans + D2 spec + D3 script — all trace to documented 11.x substages. No drift detected. IMPL touched only the 4 deliverable files + observations.

## Findings

### Minor (non-blocking; track in v2.7)

1. CF-V2.7-SC39-POLL-LINES-TIMEOUT-FLAKE not promoted to carryforwards-v2.7.md — captured in Decision 037 section 7.6 but not echoed into the working v2.7 carryforward list. Recommend adding CF-V2.7-SC39-POLL-LINES-TIMEOUT-FLAKE entry to carryforwards-v2.7.md so v2.7 burndown reviews surface it. Severity: nitpick (CF is preserved in Decision 037; only the surfacing channel is incomplete).

### No Critical Findings

P0/P1/P2/P3/P9/P10/P11 all PASS. R-1 FAIL diagnosis is independently verified. Decision 037 supersession is correctly authored. Determinism gates green. Charter coherence intact.

## Karpathy P1-P4 Audit

- P1 Think Before Coding: Decision 037 section 6 mandates empirical format discovery BEFORE selecting fix candidate (W-1-A through W-1-D). Architect spec + IMPL ran the R-1 probe option (c) before any code change. Compliant.
- P2 Simplicity First: section 3.2 explicitly avoids R-2/R-3 measurement under R-1 FAIL because it would produce failure-confirming artifacts. The decision rejects DEFER_AGAIN (section 9 Alt 2) and ENABLE_RETRY (section 9 Alt 1) in favor of the simplest charter-coherent verdict. Compliant.
- P3 Surgical Changes: IMPL touched only 4 deliverable files. Orchestrator-side touches trace to documented mid-verify rename (CF-V2.6-LR02-LR19-CONTRACT-DRIFT). Decision 037 section 7.4 explicitly retires false-flagged scope creep CF. Compliant.
- P4 Goal-Driven Execution: W-1/W-2/W-3/W-4 prereqs (section 5) are falsifiable and specific. (V1a)/(V1b) verification criteria are concrete. Compliant.

## Decision Matrix Resolution

Per the prompt matrix: APPROVED requires P0/P1/P2/P3/P9/P10/P11 all PASS plus <=2 minor concerns elsewhere -> CONDITION MET. 1 minor concern (P8 — POLL-LINES-TIMEOUT-FLAKE not in working CF list).

Outcome: APPROVED. 11.5 substage CLOSED.

## Recommendation

MERGE the 11.5 substage into the Phase 11 phase-close trail. Proceed to 11.6 (F-2 self-evolution signal-extension) which per Decision 037 section 11.3 is gated alongside SC-39 — F-2 is no-op under DEFER_V2.7 and defers to v2.7+ alongside the W-1 fix.

Recommended optional follow-up (non-blocking, ~1K budget): append CF-V2.7-SC39-POLL-LINES-TIMEOUT-FLAKE entry to carryforwards-v2.7.md for working-list completeness. The CF is preserved in Decision 037 section 7.6 regardless.
