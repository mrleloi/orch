---
title: Phase 9 Master Plan — v2.4 Carryforward Closure
phase: 9
version: v2.4
status: RATIFIED
ratified_by: sandwich-architect (opus/medium, ORCH_SPAWNED, 2026-04-27)
ratified_date: 2026-04-27
ratification_session: session #43
ratification_verdict: PASS (all 7 spot-checks A-G green; zero surgical fixes needed)
ratification_notes: |
  Spot-check evidence:
    A. §3 budget sum: 60+90+80+80+100+130+110+120+80 = 850K ≤ 850K claim ✓
    B. §4 concurrency: 9.1∥9.2∥9.3∥9.4 = 4 sonnet/medium; 0 opus/max; 0 opus/* concurrent. Decision 032 D4 (≤4 / ≤1 opus-max / ≤2 opus-*) respected ✓
    C. §11 has two opus/medium rows (9.5 Decision 034; 9.6 SC-28 design); both carry D2 justifications inline ✓
    D. §9 v2.5 deferrals (decision-doc-lag.sh, CF-DOGFOOD-5/7, SC-39 loop execution, CF-25, F-2 signal-extension, CF-DOGFOOD-2) — each charter-coherent: scaffold-now-execute-later (Decision 027 §C-8) and dogfood-craft pattern; no charter clause violated ✓
    E. Each §3 substage carries a deterministic boolean acceptance gate (file-exists / exit-0 / counter-threshold) ✓
    F. CF coverage: all 18 OPEN-V2.4 CFs from phase-8-complete.md §4 land in at least one §3 substage or §9 deferral-candidate list — CF-25→9.6, CF-27→9.5(art5), CF-28→9.6, CF-29→9.1, CF-30→9.3, CF-31→9.3, CF-32→9.5, CF-33→9.5(art5), CF-34→9.5(art1), CF-DOGFOOD-2→§9 deferral, CF-DOGFOOD-4→9.3, CF-DOGFOOD-5/7→§9 deferral, M1/M2→9.2, MAJ-1→9.2, MAJ-2→9.1, T11→9.1 ✓
    G. SC-39 6-artifact gate (§3 9.5) maps verbatim to Decision 033 §Deliberation E artifacts 1-6; §3 9.5 explicitly forbids pre-commitment to ENABLE; supports verdict ENABLE_RETRY | DEFER_AGAIN | DEFER-V2.5 ✓
prior: agent-workspace/session-plans/pending/phase-8-v2.3-strategic-pivot.md
date: 2026-04-27
authoring_agent: master-planner (opus 4.7, /effort medium, ORCH_SPAWNED, post-Phase-8 close)
authority: Decision 027 §"Consequences" 8 (scaffold-now-execute-later); Decision 032 (effort routing); Decision 033 (SC-39 DEFER + 6-artifact gate)
inputs_consumed:
  - agent-workspace/memory/phase-8-complete.md (§4 carryforward register; §8 v2.4 outstanding work)
  - agent-workspace/memory/decisions/{027,032,033}-*.md (binding strategic decisions)
  - agent-workspace/session-plans/pending/phase-8-v2.3-strategic-pivot.md (template + §11 routing matrix)
  - agent-workspace/memory/agent-notes.md (CF-27..CF-31 register)
  - agent-workspace/constitution/task-partition-matrix.md (§7 19-script backlog)
  - PROJECT_CHARTER.md (immutable invariants)
  - agent-workspace/memory/audits/phase-0-7-charter-drift-audit.md (F-1..F-5 routing)
i6_compliance: zero git commits across all 9 substages; v2.4 stages at 9.8 close
budget_estimate_tokens: 850000
expected_sessions: 11
expected_calendar_days: 4
substage_9_0_spec: agent-workspace/session-plans/pending/phase-9-substage-9.0-routing-spec.md
---

# Phase 9 Master Plan — v2.4 Carryforward Closure

> Phase 9 is a CLOSURE phase. It drains the v2.4 backlog accumulated through
> Phase 8 (14 OPEN-V2.4 carryforwards + SC-39 retry path + Phase 7 PARTIAL items
> + 19-script planned-8.4.7 backlog), then stages v2.4. NO new feature work;
> new features land in v2.5+. I-6 ABSOLUTE preserved (Decision 020). v2.0/v2.1/
> v2.2/v2.3 staged baseline persists.

## §0 Why Phase 9 Exists

Phase 8 closed v2.3 with PASS verdict, ATTESTED, but explicitly deferred 14
carryforwards (CF-25, CF-27..CF-34, CF-DOGFOOD-2/4/5/7, M1, M2, T11) plus the
SC-39 retry execution (Decision 033's 6-artifact prerequisite gate) plus 18 of
19 planned-8.4.7 scripts (charter-coherence-spot-check, hook-latency-budget,
hook-coverage, etc.) plus three Phase 7 PARTIAL items (SC-20 worktree
benchmark; SC-27-B graceful-degradation; SC-28 mtime-proxy). Decision 027's
8-dimension agenda is structurally complete in v2.3 scaffolding; v2.4
discharges the residue and re-attempts SC-39 if (and only if) the 6-artifact
gate flips green. Skipping Phase 9 leaves 14 carryforwards open into v2.5,
which compounds drift cost (each open CF accumulates context-tax across every
later read of agent-notes.md). Phase 9 is the last cleanup pass before any
future feature phase.

## §1 Inputs from Phase 8

### 1.1 Open carryforwards (14 entries; per phase-8-complete.md §4)

| ID | Severity | Origin | v2.4 disposition | SC-39 prereq? |
|---|---|---|---|---|
| CF-25 | LOW | Phase 7 | Citation-linter dedup (full sandwich) | No |
| CF-27 | LOW | Phase 8.4.2 | Dual-impl cleanup; dead-code removal | YES (CF-33 promotes) |
| CF-28 | MEDIUM | Phase 8.7.6 | Spawned-session session-note write protocol | No |
| CF-29 | MEDIUM | Phase 8.7.6 | layered-resolver.ts 569 LOC → split layer-builder.ts | No |
| CF-30 | MEDIUM | Phase 8.7.6 | dry-run.sh tarball minimum-size + file-count guard | No |
| CF-31 | MEDIUM | Phase 8.7.6 | HttpsNdjsonSink real-fetch + startup banner | No |
| CF-32 | MEDIUM | Phase 8.8.1 | SC-39 retry 6-artifact gate (this phase's gate) | YES (gate) |
| CF-33 | HIGH | Phase 8.8.1 | CF-27 promoted: dead-code blocker for SC-39 retry | YES |
| CF-34 | LOW | Phase 8.8.1 | Phase 8 RULE re-eval on component-telemetry.jsonl | YES |
| CF-DOGFOOD-2 | MEDIUM | Phase 8.5.4 | SC-39 prereq #3 structural gap; dogfood path | No (informs 9.5) |
| CF-DOGFOOD-4 | LOW | Phase 8.5.4 | autonomous-stop-watchdog.sh stale-marker visibility | No |
| CF-DOGFOOD-5 | LOW | Phase 8.5.4 | minor adversarial finding | No |
| CF-DOGFOOD-7 | LOW | Phase 8.5.4 | minor adversarial finding | No |
| M1 | MEDIUM | Phase 8.1.4b | config-style-lint.spec.ts LR-23 + LR-28 test gap | No |
| M2 | MEDIUM | Phase 8.1.4b | config-style-lint.spec.ts LR-05 ordering test gap | No |
| MAJ-1 | (Phase 8.4) | Phase 8.4.8 | H7 dispatch-recorder.spec.ts Windows skip guard | No |
| MAJ-2 | (Phase 8.4) | Phase 8.4.8 | INV-10 cross-ref typo INV-S9 | No |
| T11 | LOW | Phase 8.5.2 | Brittleness flag in dogfood harness | No |

### 1.2 Phase 7 PARTIAL items still open

- **SC-20** worktree-isolation benchmark — proxy-based; needs real measurement.
- **SC-27-B** graceful-degradation path — Decision 019; needs re-attestation if CF-21 upgrades.
- **SC-28** event-rate measurement — currently mtime-proxy; needs real counter.

### 1.3 Planned-8.4.7 §7 unbuilt scripts (19 entries; 1 of 20 shipped)

Per task-partition-matrix.md §7 (T-030..T-050 row range). 18 deferred to v2.4.
**High priority** (single-script, drift-detection): charter-coherence-spot-check.sh
(Drift C gap from 8.2.3 adversarial), hook-latency-budget.sh (F-5), hook-coverage.sh.
**Medium priority**: dispatch-pairing-rate.sh (F-4 follow-up), dependency-freshness.sh,
oss-readiness.sh, npm-pack-check.sh, profile-vs-settings-diff.sh, concrete-adapter-import-lint.sh,
n6-72h-launcher.sh + n6-72h-status.sh, architect-spec-vs-reality-loc.sh,
substage-parallelism-flag.sh, effort-prepend.sh, emit-spec-opt-out.sh.
**Low priority** (deferral candidate to v2.5): decision-doc-lag.sh.

### 1.4 8.7.6 triple-review MAJOR concerns

- CF-28 (session-note protocol gap) — see 1.1.
- CF-29 (layered-resolver LOC overage) — see 1.1.
- CF-30 (dry-run min-size guard) — see 1.1.
- CF-31 (HttpsNdjsonSink real-fetch banner) — see 1.1.

All four MEDIUM; all v2.4-deferred per Phase 8 close.

### 1.5 DIM 1 drift audit follow-ups

F-1..F-5 from `audits/phase-0-7-charter-drift-audit.md`:
- **F-1** N6 72h RSS — needs n6-72h-launcher.sh + n6-72h-status.sh (planned-8.4.7).
- **F-2** Self-evolution signal-extension — input to SC-39 retry path; gates 9.4.
- **F-3** Mandate F architect LOC reality check — closed in 8.4.6 (CF-26).
- **F-4** dispatch.jsonl pairing — partial via CF-21 closure; needs pairing-rate.sh.
- **F-5** Hook-latency budget — needs hook-latency-budget.sh (planned-8.4.7).

## §2 Substage Catalogue

| # | Scope | Depends-on | Model/effort | Budget K | Acceptance gate |
|---|---|---|---|---|---|
| 9.0 | Phase entry: read 8 close, partition CF backlog by family, ratify routing | — | sonnet/medium | 60 | `phase-9-routing.md` exists; ≥6 CF families identified; per-substage budgets sum ≤900K |
| 9.1 | Code-quality CF batch: CF-29 (resolver split), MAJ-2 (INV typo), T11 fix | 9.0 | sonnet/medium | 90 | typecheck + lint + 1153+ tests PASS; layered-resolver.ts ≤500 LOC; INV-S9 cross-ref correct; T11 brittleness mitigated |
| 9.2 | Test-coverage CF batch: M1 + M2 (config-style-lint LR-23/28/05), MAJ-1 (Windows skip guard) | 9.0 | sonnet/medium | 80 | config-style-lint.spec.ts gains ≥3 new test cases; H7 spec skipIf wired; vitest exit 0 |
| 9.3 | Safety CF batch: CF-30 (dry-run guard), CF-31 (HttpsNdjsonSink banner), CF-DOGFOOD-4 | 9.0 | sonnet/medium | 80 | dry-run.sh fails if tarball <2KB; sync-seam emits banner when enabled; watchdog stale-marker visible in log |
| 9.4 | Drift-detection scripts (planned-8.4.7 high priority): charter-coherence-spot-check.sh, hook-latency-budget.sh, hook-coverage.sh, dispatch-pairing-rate.sh, concrete-adapter-import-lint.sh | 9.0 | sonnet/medium | 100 | each script exit 0 in dry-run; charter-coherence detects Drift C planted-test from 8.2.3 |
| 9.5 | SC-39 retry artifacts (Decision 033 gate, artifacts 1-5): CF-33 (CF-27 dead-code removal), CF-34 (Phase 8 RULE re-eval), real-dispatch re-sample, unknown-agent prevalence audit, event volume target | 9.1 (if resolver split breaks dispatch path) | sonnet/medium + sonnet/high (re-sample) | 130 | `decisions/034-sc39-{enable,defer-again}.md` authored OR explicit DEFER-V2.5 attestation; all 6 artifacts produced |
| 9.6 | Phase 7 PARTIAL closure: SC-20 worktree real benchmark, SC-27-B re-attest, SC-28 real event-rate counter; CF-25 citation-linter dedup; CF-28 spawned-session-mode skill update | 9.0 | mix (sonnet/medium + opus/medium for SC-28 design) | 110 | each PARTIAL flips to PASS or explicit DEFER-V2.5; CF-25 dedup demonstrated; spawned-session-mode SKILL.md updated |
| 9.7 | Planned-8.4.7 medium-priority scripts: oss-readiness.sh, npm-pack-check.sh, profile-vs-settings-diff.sh, dependency-freshness.sh, n6-72h-launcher.sh + n6-72h-status.sh, architect-spec-vs-reality-loc.sh, substage-parallelism-flag.sh, effort-prepend.sh, emit-spec-opt-out.sh | 9.4 | sonnet/medium | 120 | each script exit 0 in dry-run; ≥9 scripts shipped; v2.5 deferral list captured |
| 9.8 | Phase-close: post-phase verify Phase 9; OSS readiness re-run; v2.4 staging; phase-9-complete.md attestation | 9.1..9.7 | sonnet/high | 80 | `bash scripts/verify/post-phase.sh 9` exit 0; `git log --oneline \| wc -l` = 1 (init only); phase-9-complete.md exists with closure verdict |

**Total mid-budget**: 850K tokens across 11 sessions × ~77K avg/session. Wind-down at 200K real per session ⇒ comfortable headroom.

## §3 Substage Specs

### 9.0 Phase entry: routing ratification

**Part A — Motivation**: Phase 8 left 30+ residue items spread across 6 distinct families (code-quality, test-coverage, safety, drift-detection, SC-39 path, Phase-7 PARTIAL). Naively dispatching them in original-order produces unrelated context-switches every substage. Family-grouping reduces context-tax across reviewers. Plus: the routing must respect Decision 032 D4 concurrency caps (≤4 concurrent; ≤1 opus/max; ≤2 opus/*) which means the SC-39 path (likely opus/medium for the synthesis decision) cannot run in parallel with another opus/* substage.

**Part B — Contract**:
- Author `agent-workspace/memory/phase-9-routing.md` listing the 6 substage families with: items_in_family, depends-on, model/effort default, budget envelope, parallelism flag.
- Confirm budget sum ≤900K (LOC budget for plan; budget envelope for tokens).
- Identify 1-2 v2.5 deferral candidates explicitly (low-priority planned-8.4.7 scripts; CF-DOGFOOD-5/7 if analysis shows they're cosmetic).
- I-6 check: zero git operations.

**Acceptance gate**: file exists; ≥6 families enumerated; budget sums verified; ≤2 v2.5 deferrals named.

> **Architect ratification note (2026-04-27)**: The full Part A + Part B contract for substage 9.0 is expanded in `agent-workspace/session-plans/pending/phase-9-substage-9.0-routing-spec.md`. The expansion is normative; this stub remains as plan-level summary.

### 9.1 Code-quality CF batch

**Part A**: CF-29 (layered-resolver.ts 569 LOC → split layer-builder.ts ~91 LOC); MAJ-2 (INV-10 cross-ref typo references INV-S9); T11 (dogfood harness brittleness, identified at 8.5.2/8.5.4). All three are surgical edits in production code; risk of cross-test breakage low because layered-resolver.ts has 14 existing tests. CF-29 must preserve the existing 14 tests verbatim (only the import path changes).

**Part B**:
- Edit `packages/core/src/config/layered-resolver.ts`: extract `resolveUserHome` + `resolveUserConfigPath` + `buildDefaultLayers` (lines 478-569 per agent-notes:746) to new `packages/core/src/config/layer-builder.ts`. Re-export from index. 14 tests still pass.
- Edit `agent-workspace/constitution/invariants.md`: fix INV-10 cross-ref to INV-S9 (typo per agent-notes Phase 8.4.8 MAJ-2).
- Address T11 brittleness in `scripts/dogfood/run-self-task.ts` (or its tests) — likely a tighter assertion or environment guard.
- All deterministic gates pass: `pnpm typecheck && pnpm lint && pnpm test` exit 0.

**Acceptance gate**: layered-resolver.ts ≤500 LOC; layer-builder.ts ~91 LOC + module-level tests; INV-S9 cross-ref correct; T11 mitigation documented; full test suite PASS (≥1153 tests; +0 regressions).

### 9.2 Test-coverage CF batch

**Part A**: M1 (config-style-lint LR-23 + LR-28 zero tests); M2 (LR-05 section-ordering zero tests); MAJ-1 (H7 dispatch-recorder.spec.ts lacks Windows skip guard, fails on Git Bash w/o `chmod`). All three are test-only changes; production code unchanged.

**Part B**:
- Add `tests/audit/config-style-lint.spec.ts` cases: 1 for LR-23, 1 for LR-28, 1 for LR-05. Each tests both PASS and FAIL paths (rule fires on violation; rule does not fire on conformant input). Total 6 new test cases.
- Add `skipIf(process.platform === 'win32')` guard to H7 in `tests/hooks/dispatch-recorder.spec.ts` (per Phase 8.4.5 Win+Git-Bash pattern from CF-24 closure).
- All deterministic gates pass.

**Acceptance gate**: ≥6 new test cases land; H7 SKIPS on Windows (verified by running on Git Bash if available, else by code-review of skipIf wiring); vitest exit 0.

### 9.3 Safety CF batch

**Part A**: CF-30 (dry-run.sh tarball 659 bytes is too small — need minimum-size guard); CF-31 (when v2.4 wires real fetch in HttpsNdjsonSink, add startup banner to defend against accidental enablement); CF-DOGFOOD-4 (autonomous-stop-watchdog.sh stale-marker not visible in log → debugging is hard).

**Part B**:
- Edit `scripts/publish/dry-run.sh`: add `[ "$tarball_size" -ge 2000 ] || fail "tarball <2KB suggests missing dist content"`. Also assert `[ "$file_count" -ge 1 ]`.
- Edit `packages/core/src/telemetry/sync-seam.ts` HttpsNdjsonSink: add stderr banner `[orch] telemetry sync ENABLED → <url>` when `ORCH_TELEMETRY_SYNC=true`. Default-OFF behavior unchanged.
- Edit `scripts/hooks/autonomous-stop-watchdog.sh`: log stale-marker presence/absence at INFO level; format `[stale-marker-check] present=<true|false> path=<...>`.
- All deterministic gates pass.

**Acceptance gate**: dry-run.sh fails fast with synthetic 600-byte tarball; HttpsNdjsonSink banner emitted on opt-in; watchdog log shows stale-marker line.

### 9.4 Drift-detection scripts (high priority)

**Part A**: 5 scripts from planned-8.4.7 §7 backlog. Each closes a known drift-detection gap:
- `charter-coherence-spot-check.sh` (T-036) — closes Drift C gap from 8.2.3 adversarial probe.
- `hook-latency-budget.sh` (T-033) — closes F-5 (regression-prevention).
- `hook-coverage.sh` (T-039) — enumerates events vs settings.json entries.
- `dispatch-pairing-rate.sh` (T-042) — F-4 follow-up; computes (DISPATCHED ∩ COMPLETED)/total.
- `concrete-adapter-import-lint.sh` (T-040) — F-6 mitigation; greps `new ClaudeCodeAdapter` in domain layer.

LOC budget per script: 25-60 (per task-partition-matrix.md §7).

**Part B**:
- Implement 5 scripts; each `exit 0` on a clean repo and `exit 1` on a planted defect.
- Wire `charter-coherence-spot-check.sh` into `scripts/verify/post-phase.sh` (filling the A.6 gap from Phase 8 verify).
- Plant a synthetic Drift C in scratch branch; verify charter-coherence detects it.
- All deterministic gates pass.

**Acceptance gate**: 5 scripts exist + executable; each exit 0 on current repo; charter-coherence detects synthetic drift; A.6 gate in post-phase.sh now wired.

### 9.5 SC-39 retry artifacts (Decision 033 6-artifact gate)

**Part A**: Decision 033 §"Deliberation E" lists 6 artifacts that gate any future 034-sc39-enable-retry decision:
1. Phase 8 RULE re-evaluation (CF-34, ≤20K).
2. unknown-agent bucket prevalence audit (<0.30 ratio target).
3. Real-dispatch correlation re-sample (≥50 pairs; match_rate_with_fallback ≥0.85, match_rate_direct ≥0.40).
4. Event volume target (component-telemetry.jsonl ≥10,000 events; currently 7,425).
5. CF-27 dual-implementation cleanup (CF-33; either delete `packages/core/src/dispatch/recorder.ts` or wire as canonical).
6. Loop dry-run on real Phase 8 telemetry + reviewer ACK.

**Decision-binding constraint**: Decision 033 explicitly forbids re-litigating SC-39. If the gate flips green on all 6, author Decision 034 with verdict ENABLE_RETRY (separate substage, opus/medium, with D2 justification per Decision 032). If any artifact FAILs (e.g., event volume <10K because dogfood velocity didn't accumulate enough events), author 034 with verdict DEFER-V2.5 — DO NOT pre-commit to ENABLE.

**Part B**:
- Artifact 1: `agent-workspace/memory/phase-8-rule-eval.md` — re-run 4-RULE table from `phase-7-routing-recommendations.md:19-25` against post-Phase-8 component-telemetry.jsonl.
- Artifact 2: `agent-workspace/memory/audits/unknown-agent-bucket-prevalence.json` — count `agent_type == "unknown-agent"` events; emit ratio.
- Artifact 3: `agent-workspace/memory/audits/cf21-real-dispatch-sample.json` — drain ≥50 real (non-synthetic) dispatch.jsonl pairs from Phase 9 dogfooding (this phase's substages 9.4 + 9.7 generate ≥50 pairs naturally if dispatch goes through queue; if not, run a 50-dispatch synthetic batch in dry-mode).
- Artifact 4: `agent-workspace/memory/audits/sc39-prereq-volume.md` — `wc -l component-telemetry.jsonl`; assert ≥10,000.
- Artifact 5 (CF-33 cleanup): delete `packages/core/src/dispatch/recorder.ts` + `tests/dispatch/recorder.spec.ts` (Approach A is dead code per CF-27/Decision 033 §"Deliberation B"). Verify no production import path imports it (grep first; if any call sites exist outside the spec, escalate).
- Artifact 6: `agent-workspace/memory/sc39-dry-run-output.md` — dispatch the self-evolution loop in DRY mode; reviewer ACK or REJECT.
- Synthesize at end of substage: author `agent-workspace/memory/decisions/034-sc39-retry-or-defer-v2.4.md` with verdict ENABLE_RETRY, DEFER_AGAIN, or DEFER-V2.5. Decision authored by master-planner-revision (opus/medium with D2 justification: "telemetry-driven judgment over 6 independent artifacts; supersedes Decision 033 narrow gate").

**Acceptance gate**: 6 artifacts exist; Decision 034 authored with binding verdict; if ENABLE_RETRY, the actual loop execution is OUT-OF-SCOPE for 9.5 (it would dispatch as a separate task in 9.7+ or v2.4.x mid-phase). If DEFER (V2.4 or V2.5), explicit attestation file at `agent-workspace/memory/sc39-defer-attestation-v2.4.md` referencing 034.

**Constraint reminder**: Decision 033 §"Consequences" 1 explicitly subordinates the master-plan §10 D-G narrow gate to the broader 6-artifact gate. v2.4 honors this — no shortcut paths.

### 9.6 Phase 7 PARTIAL closure + CF-25 + CF-28

**Part A**: Three Phase 7 PARTIAL items have lingered through Phase 8: SC-20 (worktree benchmark uses mtime proxy, not real I/O measurement); SC-27-B (graceful-degradation per Decision 019; needs re-attestation if CF-21/CF-33 closure changes the path); SC-28 (event-rate counter is mtime proxy). Plus CF-25 (citation-linter dedup; full sandwich required per Phase 8.4.6 deferral) and CF-28 (spawned-session-mode skill needs protocol for large-output verifiers).

**Part B**:
- SC-20: Replace mtime proxy in worktree-isolation.spec.ts with real-IO measurement (read N files, time delta). Re-attest at `agent-workspace/memory/attestations/sc-20-real-measurement.md`.
- SC-27-B: Re-evaluate graceful-degradation path post-CF-33 cleanup. If CF-33 removes Approach A, the SC-27-B narrative changes — re-attest at `agent-workspace/memory/attestations/sc-27-b-post-cf33.md`. If unchanged, document NO_CHANGE.
- SC-28: Replace mtime proxy with real event-rate counter (a counter file or in-process metric exported via OTEL). Re-attest at `agent-workspace/memory/attestations/sc-28-real-counter.md`.
- CF-25: Use `scripts/utilities/citation-linter.ts` dedup logic per Phase 8.4.6 deferred design. Architect this as a small sandwich (sandwich-architect → task-implementer → reviewer); ~80K total.
- CF-28: Update `.claude/skills/spawned-session-mode/SKILL.md` with protocol for large-output verifiers (when system-reminder forbids summary file writes, return findings inline; cite the protocol).
- All deterministic gates pass.

**Acceptance gate**: 3 PARTIAL items each PASS or explicit DEFER-V2.5 attestation; CF-25 dedup landed (or DEFER-V2.5); spawned-session-mode SKILL.md updated.

### 9.7 Planned-8.4.7 medium-priority scripts

**Part A**: 9 remaining planned-8.4.7 scripts (per task-partition-matrix.md §7). Each is small (25-110 LOC); collectively they close the deterministic-gate coverage holes that v2.3 deferred. Order of build (least-dependency first):
1. `oss-readiness.sh` (T-043, ~45 LOC)
2. `npm-pack-check.sh` (T-044, ~30 LOC)
3. `profile-vs-settings-diff.sh` (T-038, ~80 LOC)
4. `dependency-freshness.sh` (T-037, ~50 LOC)
5. `n6-72h-launcher.sh` (T-034, ~30 LOC)
6. `n6-72h-status.sh` (T-035, ~35 LOC)
7. `architect-spec-vs-reality-loc.sh` (T-050 hybrid script-side, ~45 LOC)
8. `substage-parallelism-flag.sh` (T-047, ~35 LOC)
9. `effort-prepend.sh` (T-048, ~30 LOC)
10. `emit-spec-opt-out.sh` (T-046, ~25 LOC)

**Part B**:
- Implement 9-10 scripts; each `exit 0` in dry-run on current repo.
- `n6-72h-launcher.sh` registers a detached background job (nohup-pattern); does NOT actually run 72h in this substage (the empirical run is user-action; per F-1 routing).
- Update `agent-workspace/constitution/task-partition-matrix.md` §7 to flip `existing_status` from `planned-8.4.7` to `exists` for each shipped row.
- All deterministic gates pass.

**Acceptance gate**: ≥9 of 10 scripts shipped; partition-matrix.md §7 updated; v2.5 deferral list captured for any unshipped script (decision-doc-lag.sh is acceptable v2.5 deferral).

### 9.8 Phase-close: post-phase verify + v2.4 staging

**Part A**: Mirror 8.8.3 closure pattern. Run post-phase verify with newly-shipped scripts; produce phase-9-complete.md attestation; stage v2.4 (no commit).

**Part B**:
- Run `bash scripts/verify/post-phase.sh 9` — should exit 0 with all A.* gates green (A.6 charter-coherence newly wired in 9.4; A.7 hook-latency newly wired in 9.4; A.8 hook-coverage newly wired in 9.4).
- Run `bash scripts/audit/oss-readiness.sh` — should exit 0 (re-verify post-Phase-9 changes; CF-30/CF-31 changes preserve OSS readiness).
- Run `bash scripts/audit/npm-pack-check.sh` — should exit 0; tarball ≥2KB (CF-30 guard active).
- Author `agent-workspace/memory/phase-9-complete.md` with sections matching 8-complete: §1 outcome summary, §2 substage closure ledger, §3 SC scorecard, §4 carryforward register disposition (target: 14 → ≤3 OPEN-V2.5), §5 determinism evidence, §6 I-6 evidence, §7 decisions ratified, §8 outstanding work for v2.5.
- Stage v2.4 across changed files: `git add -A`. Verify `git log --oneline | wc -l` = 1 (init only; zero agent commits).

**Acceptance gate**: post-phase.sh exit 0; oss-readiness.sh exit 0; phase-9-complete.md exists; `git log --oneline | wc -l` = 1; v2.4 fully staged-but-uncommitted.

## §4 Concurrency Plan

Per Decision 032 D4 caps:
- ≤4 concurrent subagents
- ≤1 opus/max in flight
- ≤2 opus/* in flight
- sonnet/* fills remaining slots

**Sequential / parallel layout**:

```
9.0 (sonnet/medium, blocking)
   |
   +------------------+------------------+----------------+
   |                  |                  |                |
 9.1 (sonnet/med)   9.2 (sonnet/med)   9.3 (sonnet/med)  9.4 (sonnet/med)
   [code-quality]    [test-coverage]   [safety]          [drift scripts]
   |                  |                  |                |
   +-------- gate (all 4 PASS) ----------+----------------+
                         |
                       9.5 (sonnet/medium + sonnet/high re-sample)
                       [SC-39 6-artifact gate]
                         |
                       9.6 (mix sonnet/medium + opus/medium for SC-28 design)
                       [Phase 7 PARTIAL + CF-25 + CF-28]
                         |
                       9.7 (sonnet/medium)
                       [planned-8.4.7 scripts]
                         |
                       9.8 (sonnet/high)
                       [phase close]
```

**Parallel opportunities**: 9.1 ∥ 9.2 ∥ 9.3 ∥ 9.4 — all 4 are sonnet/medium, surgical, no shared file edits. Concurrency cap respected (4 concurrent, 0 opus/max, 0 opus/*). Expected wall-time savings: ~30-40% over sequential.

**Forbidden parallelism**: 9.5 (SC-39 path) sequenced AFTER 9.1 because CF-33 dead-code removal happens in 9.5 itself — but 9.1 (CF-29 resolver split) touches the same package directory; serialize to avoid edit conflicts. 9.6 sequenced AFTER 9.5 because SC-27-B re-attestation depends on CF-33 outcome.

**Decision 032 D2 max-effort gate**: NO substage in this phase requires opus/max. Justification: every substage is well-bounded (5-10 carryforwards each, no charter-binding decision). The only opus/* candidate is 9.5's Decision 034 authoring (opus/medium), and that's bounded by the 6-artifact evidence pile, not multi-hop strategic synthesis. opus/medium D2 justification: "supersedes Decision 033 narrow gate; cross-references 6 independent artifacts; verdict binds future SC-39 attempts" — but NOT max because the alternatives are pre-defined (ENABLE/DEFER/DEFER-V2.5).

## §5 Phase-Close Gates

**`phase-9-complete.md` shape** (mirror 8-complete §1-§9):

- §1 Phase 9 v2.4 Outcome Summary (1 paragraph; carryforward closure rate; SC-39 verdict).
- §2 Substage Closure Ledger (table of 9.0..9.8 with verdicts).
- §3 SC Scorecard — Phase 9 introduces SC-49..SC-52 (see below).
- §4 Carryforward Register Disposition — target: 14 OPEN-V2.4 → ≤3 OPEN-V2.5 (CF-25 if dedup defers; SC-39 if Decision 034 verdict = DEFER-V2.5; CF-DOGFOOD-2 if structural).
- §5 Determinism Evidence — post-phase.sh exit 0; oss-readiness.sh exit 0; npm-pack-check.sh exit 0.
- §6 I-6 Evidence — `git log --oneline | wc -l` = 1.
- §7 Decisions Ratified — Decision 034 (SC-39 retry verdict).
- §8 Outstanding Work for v2.5.
- §9 Operator Handoff Notes.

**v2.4 staging step**: `git add -A` after 9.8 attestation written. The operator (human) decides on the eventual commit. I-6 ABSOLUTE preserved.

**SC numbering for Phase 9**:

| SC# | Title | Substage | Verification |
|---|---|---|---|
| SC-49 | Carryforward closure rate ≥80% | 9.0..9.7 | (closed_count / 14) ≥ 0.80 in §4 of phase-9-complete.md |
| SC-50 | SC-39 retry verdict authored | 9.5 | `decisions/034-sc39-*.md` exists with status BINDING |
| SC-51 | Phase 7 PARTIAL items closed or DEFER-V2.5 attested | 9.6 | 3 attestation files exist (SC-20, SC-27-B, SC-28) |
| SC-52 | planned-8.4.7 high+medium-priority scripts shipped | 9.4 + 9.7 | ≥14 of 19 scripts exist + executable; partition-matrix.md §7 updated |

## §6 Risk Register

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| SC-39 6-artifact gate fails (e.g., event volume <10K) | MED-HIGH | LOW | Author Decision 034 = DEFER-V2.5; do NOT pre-commit ENABLE. Decision 033 §"Deliberation E" already authorizes this path. |
| CF-33 dead-code removal breaks an unexpected import | LOW | HIGH | Pre-flight grep (Decision 033 §"Deliberation B" confirmed no production imports); if grep finds a call site, escalate via decisions/035-*.md instead of forcing removal |
| 9.1 resolver split breaks 14 existing tests | LOW-MED | MED | Tests pin the public API; layer-builder.ts re-export from index preserves all imports. If tests fail, downshift split to a DEFER-V2.5 with rationale. |
| 9.4 charter-coherence-spot-check.sh produces too many false positives | MED | LOW | Tune the grep heuristic with a 2-pass calibration on Phase 7+8 evidence; threshold-tunable via env var. |
| 9.5 unknown-agent prevalence ≥0.30 (gate fail) | MED | LOW | Already a documented gate-fail path (artifact 2); Decision 034 = DEFER. |
| 9.7 9-script batch exceeds budget (120K) | LOW-MED | LOW | Split into 9.7a + 9.7b at script #5 if mid-batch budget hit. |
| 9.8 post-phase.sh new gates (A.6/A.7/A.8) fail on first real run | MED | MED | Iterate: fix the gate, not the script; if gate is correctly catching a real defect, route to 9.x-fix substage. |
| Wind-down mid-9.5 (SC-39 path is the longest substage) | MED | MED | Checkpoint after each artifact (1-6); resume on next session if needed. |
| New CF discovered mid-Phase-9 (e.g., 9.1 surfaces a layer-builder bug) | MED | LOW | Add to CF-35+ slot; if blocking, sub-task within current substage; if not blocking, defer to v2.5. |
| Concurrent 9.1∥9.2∥9.3∥9.4 hits Anthropic rate limit | LOW | LOW | Decision 032 D4 cap respected (4 sonnet/medium); if rate-limited, fall back to sequential. |

## §7 New Carryforward Slots (CF-35+)

Phase 9 itself may surface new carryforwards. Slot allocation:

- **CF-35**: reserved for any new finding from 9.5 SC-39 artifacts (e.g., loop dry-run reviewer REJECT).
- **CF-36**: reserved for any 9.6 PARTIAL re-attestation that requires architecture change (e.g., SC-28 real counter requires new metrics seam).
- **CF-37**: reserved for 9.7 script discoveries (e.g., dependency-freshness reveals stale dep that blocks publish).
- **CF-38..40**: open slots for late-phase findings.

If Phase 9 closes with ZERO new carryforwards beyond the slot reservations, this is a strong drift-cleanup signal — record it in phase-9-complete.md §1.

## §8 Effort-routing telemetry expectations (Decision 032 D3)

Per Decision 032 D3, every subagent return logs a row in `agent-workspace/memory/budget-tracker.md`:

```
| substage | model | effort | planned_K | actual_K | wall_min | verdict | rationale |
```

Expected rows by Phase 9 close (~11 rows minimum, one per substage 9.0..9.8 plus 2-3 reviewer dispatches):

| substage | model | effort | planned_K | typical_actual_K |
|---|---|---|---|---|
| 9.0 | sonnet | medium | 60 | 30-50 |
| 9.1 | sonnet | medium | 90 | 60-90 |
| 9.2 | sonnet | medium | 80 | 50-80 |
| 9.3 | sonnet | medium | 80 | 50-80 |
| 9.4 | sonnet | medium | 100 | 70-100 |
| 9.5 | sonnet | medium + opus | medium (Dec 034) | 130 | 100-130 |
| 9.6 | sonnet | medium + opus | medium (SC-28) | 110 | 80-110 |
| 9.7 | sonnet | medium | 120 | 80-120 |
| 9.8 | sonnet | high | 80 | 50-80 |

**After Phase 9 close**, run the D3 self-learning loop: compute per-(model × effort) median actual_K from the new 11+ rows; compare to master plan column; downshift assignments where actual ≤0.6× planned (e.g., 9.0 may be sonnet/low if actual is consistently 30-40K).

**Effort-routing skill check**: at 9.7 ship-time, `scripts/effort-routing/recommend.ts` should be re-tested against the post-Phase-9 budget-tracker.md rows; if recommendations contradict actuals consistently, file CF-35 for skill calibration.

## §9 v2.5 deferral candidates

Pre-authorized v2.5 deferrals (orchestrator may defer without re-asking):

- **decision-doc-lag.sh** (T-NN low-priority planned-8.4.7) — speculative; defer.
- **CF-DOGFOOD-5** + **CF-DOGFOOD-7** if 9.0 routing classifies as cosmetic.
- **SC-39 retry execution** if Decision 034 = DEFER (the loop run itself, separate from the 6-artifact gate).
- **CF-25 citation-linter dedup** if 9.6 sandwich exceeds 80K budget.
- **F-2 self-evolution signal-extension** if 9.5 SC-39 verdict = DEFER (the rollup-telemetry.ts schema extension is most useful when the loop is enabled; deferring the loop also defers signal-extension).
- **CF-DOGFOOD-2** structural gap if no clean fix lands inside 9.6 budget — Decision 033 §"Deliberation E" explicitly notes CF-DOGFOOD-2 may be structurally deferred.

## §10 Master plan amendments (Decision 032 D6 application)

Decision 032 D6 amended Phase 8 §11 by downshifting 8.4.1 + 8.6.1 from opus/max to opus/high; 8.5.1 borderline. For Phase 9, no substage requests opus/max; the highest tier is opus/medium (9.5 Decision 034 authoring; 9.6 SC-28 design). D6 is therefore satisfied by construction — Phase 9 §11 routing matrix below contains zero opus/max rows.

If post-9.0 routing review (per 9.0 substage) surfaces a need for opus/max on any sub-task (e.g., a complex SC-28 metrics design), the D2 justification gate must be invoked at dispatch-time and logged in `decisions/035-opus-max-9x.md`.

## §11 Routing Matrix

| Substage | Model | Effort | Rationale | D2 needed? |
|---|---|---|---|---|
| 9.0 | sonnet | medium | routing-doc authoring; mechanical synthesis over phase-8-complete §4 | No |
| 9.1 | sonnet | medium | code edit ~100 LOC across 3 files; 14 existing tests pin contract | No |
| 9.2 | sonnet | medium | test-only edits; 6 new test cases | No |
| 9.3 | sonnet | medium | small edits across 3 files; banner + guard logic | No |
| 9.4 | sonnet | medium | shell scripts 25-60 LOC each; pattern is well-established | No |
| 9.5 (artifacts 1-6) | sonnet | medium | telemetry parse + JSON emit + dead-code removal | No |
| 9.5 (Decision 034 authoring) | opus | medium | telemetry-driven judgment over 6 artifacts; binding decision | YES — "supersedes Decision 033 narrow gate; 6-artifact synthesis; binds future SC-39 attempts. NOT max because alternatives are pre-defined." |
| 9.6 (SC-20, SC-28 real-measurement) | sonnet | medium | replace mtime proxy with real I/O / counter; ~50 LOC each | No |
| 9.6 (SC-28 design) | opus | medium | metrics-seam architectural choice; affects telemetry schema | YES — "metrics seam binds OTEL emit shape; downstream sync-seam consumes. NOT max because constrained by existing seam pattern." |
| 9.6 (CF-25 dedup sandwich) | sonnet | medium | small sandwich (architect signature → impl → review) | No |
| 9.6 (CF-28 SKILL.md update) | sonnet | medium | doc edit | No |
| 9.7 | sonnet | medium | shell scripts 25-110 LOC each; pattern repeated | No |
| 9.8 | sonnet | high | post-phase verify + attestation authoring; mirrors 8.8.3 closure | No |
| reviewers (post-9.1, post-9.5, post-9.8) | sonnet | medium | spec-compliance / code-quality reviews | No |

**Coverage**: 100% of substages annotated. Default subagent dispatch tooling reads `effort` column at dispatch-time. Two opus/medium dispatches in this phase, both with D2 justifications.

**Concurrency cross-check**: 9.1∥9.2∥9.3∥9.4 are all sonnet/medium → 4 concurrent sonnet → respects D4 (≤4 concurrent; 0 opus/* in flight; ≤4 sonnet/* permitted).

## §12 Final YAML completion block

```yaml
phase: 9
version: v2.4
status: RATIFIED
substages: [9.0, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8]
sc_numbering: [SC-49, SC-50, SC-51, SC-52]
total_budget_estimate_K: 850
i6_commits: 0
v2_4_release: STAGE_AT_9.8_NO_COMMIT
carryforwards_addressed: [CF-25, CF-27, CF-28, CF-29, CF-30, CF-31, CF-32, CF-33, CF-34, CF-DOGFOOD-2, CF-DOGFOOD-4, CF-DOGFOOD-5, CF-DOGFOOD-7, M1, M2, MAJ-1, MAJ-2, T11]
sc39_path: 6_artifact_gate_per_decision_033
phase_7_partial_closure: [SC-20, SC-27-B, SC-28]
planned_8_4_7_scripts_shipped: 14_to_19
parallel_opportunities: [9.1 || 9.2 || 9.3 || 9.4]
critical_path: [9.0 -> {9.1,9.2,9.3,9.4} -> 9.5 -> 9.6 -> 9.7 -> 9.8]
expected_sessions: 11
expected_calendar_days: 4
opus_medium_dispatches: 2
opus_max_dispatches: 0
v2_5_deferral_candidates: [decision-doc-lag.sh, CF-DOGFOOD-5, CF-DOGFOOD-7, SC-39-loop-execution, CF-25, F-2-signal-extension, CF-DOGFOOD-2]
charter_coherence_verified: true
new_features_added: 0_closure_phase
ratified_by: sandwich-architect (opus/medium, ORCH_SPAWNED, 2026-04-27)
ratification_session: session_43
substage_9_0_spec_path: agent-workspace/session-plans/pending/phase-9-substage-9.0-routing-spec.md
```

**END Phase 9 Master Plan v2.4 Carryforward Closure.**
