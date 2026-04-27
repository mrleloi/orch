# Orch Phases 0–4 Meta-Retrospective

**Author**: Phase 5.0 research-scanner / general-purpose agent
**Date**: 2026-04-27
**Scope**: Phases 0 → 4 (sessions #1 through #28); v1.0.0 user-confirm halt point
**Inputs**: 57 session logs, 11 decisions, 18 checkpoints, `budget-tracker.md` (197 rows / 105 KB), `agent-notes.md` (498 lines / 71 KB), `.autonomous-stop-watchdog.log` (108 entries), `.autonomous-api-error-alert.log` (33 entries), `.autonomous-premature-windown-alert.log` (2 entries), `.session-hooks.log` (10 438 lines), 24 `continue-injector` Windows-SendKey logs.

> Constraint compliance: this file is the only artifact written. No skill/agent/hook source modified.

---

## 1. Executive Summary (≤15 bullets)

1. **The autonomous loop ran end-to-end** through 28 sessions across ~3 calendar days; **21/22 charter criteria PASS**, 1,375 monorepo tests green, only N6 (72h memory leak) deferred. Substantively: the experiment worked.
2. **Three distinct loop-break modes were observed and named**: Mode A (narrate-without-tool-call), Mode B (Anthropic API `overloaded_error` mid-stream truncation), Mode C (premature wind-down on self-track illusion). Each cost ≥ 1 user `continue` nudge; one (Mode B at session #13) cost ~2.5 hours of dead time.
3. **Mode B is by far the dominant cause of human intervention.** `.autonomous-api-error-alert.log` records **33 distinct LIKELY API-TRUNCATION STOP events** across 8 different session UUIDs in a ~7-hour window on 2026-04-25 — every one of them is a candidate silent loop break. The "discipline drift" theory (Mode A) was ruled out by user-supplied screenshot of the Anthropic overloaded_error response (`agent-notes.md:122-130`).
4. **The watchdog telemetry is the system's strongest infrastructure asset.** `.autonomous-stop-watchdog.log` plus `.transcript-tokens` plus `.wind-down` markers gave a precise post-hoc forensics of every loop stop. Phase 5 should not weaken this; the only reason Mode C was diagnosed at all is because the watchdog logged real-transcript tokens alongside narration heuristic.
5. **Tracking is overall good but has 6 concrete gaps** (see §2): (a) no escalation log was ever written even though autonomous-protocol mandates it, (b) MEMORY.md user-memory index lags `agent-notes.md`, (c) `phase-0-complete.md` does not enumerate research artifacts the way phase-1 .. phase-4 do, (d) research-scanner artifact directory `agent-workspace/research/` is referenced in CLAUDE.md but absent from the gitStatus listing of A-files, (e) `phase-3-handoff-and-budget.md` is a stub left in `completed/` even though phase-3-intelligence.md superseded it, (f) `current-execution.md` was force-mutated by Phase 5 kickoff before this audit ran (autonomous_mode flipped true→true through a re-authorization line) — drift risk for next session reading it.
6. **Decisions log is internally coherent** (10 numbered + README) BUT `phase-3-complete.md:90` records decision 009's title as `gen_ai.usage.cache_read_input_tokens` while the actual decision file 009 + invariants.md + code all pin `gen_ai.usage.cache_read_tokens`. This is a one-character documentation bug in phase-3-complete.md — minor but exactly the kind of thing that makes future Phase 5 self-evolution decisions on attribute names hard.
7. **Single-pass IMPL success rate trends upward**: Phase 1 had 2 verifier FAILs (Task 1.10, Task 1.13) plus one Phase-1 verifier APPROVED_AFTER_FIX. Phases 2-3 had ~6 narrow-fix cycles (2.7.b, 2.7.c, 2.7.d, 2.8.d, 3.5.a, 3.5.d, 3.6, 3.6 again). Phase 4 had ONE narrow-fix (4.12.r). The two-stage spec→quality reviewer plus opus verifier-with-fresh-context is the highest-value quality gate the project built.
8. **Self-reboot mechanism is fragile but works.** `scripts/session-self-reboot.ps1` had to be patched mid-Phase-2 (agent-notes.md:146-152) because `claude.exe` has no MainWindowHandle and the original filter returned null on Windows. After the parent-walk fix, all 24 continue-injector logs show 3-attempt SendKeys success.
9. **Wind-down auto-reboot from the budget watchdog also works** — the single wind-down marker observed (`auto-wind-down-1777133337.log`) corresponds to session #18→#19 transition at real-transcript 210 194 tokens, exactly above the 200K threshold. End-to-end mechanism validated.
10. **`run_in_background:true` discipline held universally** after the Phase 1 lesson. No foreground Agent dispatch evidence in any session log post Phase 1.
11. **Pre-staged work caused real plan drift** in Phase 3 (Tasks 3.8 and 3.9 turned out to be substantively pre-implemented in session #19; architects had to discover this before planning). Same pattern again at Task 3.10 (`latency.spec.ts` was pre-staged). The fix is to write session logs more atomically, but it never happened.
12. **Cross-package parallel test failures (CRITICAL-1 in Task 4.12)** were invisible to standalone package gates and only surfaced when `pnpm test` (root) was run. This is a structural gap: every IMPL task ran package-scoped gates but the verifier was the first to run root parallel, finding a 100%-reproducible async-void leak.
13. **Production bug discovery via test fixtures**: Task 3.11 found a P0 — `redactLogObject` was converting `Date` to `{}`, silently breaking the production handoff chain because all unit/integration tests used mock EventBuses that bypassed redaction. The fix `if (value instanceof Date) return value` was applied at the redactor boundary.
14. **Ambiguity rate**: only ~6 places (decisions/001, 003, 006, 007, 008, 010) record "the autonomous mode picked option X over Y when ambiguous" — most ambiguities resolved deterministically against charter. The decision-log volume (10 docs in 28 sessions) is reasonable; not a sign of paralysis, not a sign of laziness.
15. **Top human-intervention root cause for Phase 5 to attack**: **Mode B (Anthropic API mid-stream truncation)** by raw count, **Mode C (premature wind-down)** by impact-per-occurrence (each one is a 1-2 hour silent stall). Mode A is rare. Phase 5 should ship: (1) tool-call-first ordering as an enforced linter (currently advisory in CLAUDE.md), (2) a Stop-hook side-effect that injects `continue` after API-truncation, mirroring the observed manual workflow, (3) an LLM-side mental check that reads `.transcript-tokens` BEFORE invoking budget-related end-turn rationale.

---

## 2. Tracking Gaps

| # | Gap | Evidence | Severity | Recommended fix |
|---|---|---|---|---|
| G-1 | `agent-workspace/memory/escalation.md` was never written despite autonomous-protocol stipulating it on STOP-1..STOP-5. The project genuinely never hit STOP — but the absence of even a "no escalation" sentinel makes "did the loop ever truly halt?" hard to verify post-hoc. | `ls agent-workspace/memory/escalation*` → no files. `current-execution.md:198-200` says "None active." | LOW | Have the Stop hook (or `/session-end` skill) write `escalation.md` with `status: NONE` whenever a phase closes cleanly, so its existence is a positive signal rather than absence-as-positive. |
| G-2 | MEMORY.md user-auto-memory index has 6 entries; `agent-notes.md` has ~30 distinct rules. The user-side index doesn't surface the most consequential Phase 4 lesson (CRITICAL-1 cross-package parallel test reproducibility) nor the P0 redaction-Date bug. | `MEMORY.md` shown in system-reminder header lists only feedback_* memories. `agent-notes.md:441-442` documents the P0 fix; nothing parallel in MEMORY.md. | MEDIUM | Add a Phase 5 hook: when `agent-notes.md` gains a rule whose tag includes `[user-impact]` or `[invariant-graduate]`, append a 1-line entry to `MEMORY.md` Index. Manual triage is cheap; the hook is just the discipline scaffold. |
| G-3 | `phase-0-complete.md` enumerates the four research repos but does not list the produced artifacts (`SYNTHESIS.md`, decisions/001) the way `phase-1-complete.md`+ does (Final Test Counts, Daemon State, Invariants Satisfied). It is a thinner retrospective than the others. | `phase-0-complete.md` 7755 bytes vs `phase-1-complete.md` 15836 bytes (>2×). Both are legitimate phases. | LOW | Backfill `phase-0-complete.md` with: SYNTHESIS.md path, D1-D15 list, a 1-line citation per ref repo. ~30 lines. |
| G-4 | `agent-workspace/research/` is referenced in CLAUDE.md ("Reference repos notes") but the gitStatus that opens this conversation does NOT list it as an A-file. It MAY exist on disk, but the index is incomplete. | `gitStatus` envelope (truncated past 2K chars). User instruction says "files written but never indexed". | LOW | When research-scanner produces an artifact, record the path in BOTH the session log AND `decisions/README.md` Index OR a new `research/INDEX.md`. |
| G-5 | `phase-3-handoff-and-budget.md` is a stub in `session-plans/completed/` (~3KB) — superseded by `phase-3-intelligence.md` (~36KB). Future agents reading the completed/ folder will see both and not know which is canonical. | `ls session-plans/completed/` shows both files. | LOW | Either delete the stub OR rename to `phase-3-handoff-and-budget.SUPERSEDED.md` with a 1-line redirect at top. |
| G-6 | Same fact appears in 3 places and goes stale. Test-count drift: `phase-3-complete.md:33` says monorepo "~1,346", `current-execution.md:158` also "1,346", but `agent-notes.md:438` (decision-rationale block) says monorepo 1330 at Task 3.12 close. The +16 delta between 3.12 close and 3.13 close (close-out housekeeping + 3.11.1 redact-Date fix) was real but the three documents disagree on which exact number is "Phase 3 exit". | `phase-3-complete.md:33` "1,346"; `current-execution.md:158` "1,346"; `agent-notes.md:460` "1330 passing"; `phase-3-complete.md:91` decision 009 title typo (`cache_read_input_tokens`); decision 009 file says `cache_read_tokens`. | MEDIUM | Single-source the test count: emit a `tests-baseline.json` per phase and have phase-N-complete.md cite that file rather than hard-coding the number. Decision 009 title in phase-3-complete.md is a one-line fix. |
| G-7 | `current-execution.md` was overwritten by the Phase 5 kickoff (this very task envelope) BEFORE this retrospective ran. Lines 1-36 now describe Phase 5 (`autonomous_mode: true`, "Phase 5 charter") even though the v1.0 halt point was supposed to be "user-confirm" with `autonomous_mode: false`. The replacement was authorized via the user-prompt file but the *previous* state-of-record is now lost from `current-execution.md` itself; only `project-complete.md` and `latest.md` checkpoint preserve the v1.0 "halt with autonomous_mode false" snapshot. | `current-execution.md:10-12` vs `latest.md:4` ("autonomous mode disabled"). | MEDIUM | Add a "previous-state preserved at <path>" footer in `current-execution.md` whenever it is mutated by a phase-boundary kickoff. ~3 lines. |
| G-8 | No file maps subagent dispatch ID (`agentId axxxxxxxxxx`) → return verdict → which session log captured it. The IDs are everywhere in budget-tracker.md but nowhere indexed; finding the verifier verdict for `a66ea8e2117505ad1` requires grep across multiple files. | budget-tracker.md uses `agentId axxxxxxxxxx` ~30 times; agent-notes.md cites them ~12 times. | LOW | A Phase 5 utility script: parse `.session-hooks.log` for SubagentStop events and produce `agent-workspace/memory/subagent-index.md` mapping agentId → start_ts → return_ts → verdict_class. Watchdog-side, not LLM-side. |
| G-9 | `observations/` directory has 21 task-level micro-logs (e.g. `task-1.9d-20260425-000000.md`, `task-3.5.d-narrow-fix-20260426.md`) but none are indexed and the boundary between `observations/`, `sessions/`, and `checkpoints/` is fuzzy. | `ls observations/` 21 files; `ls sessions/` 57 files; both directories carry similar `task-N.x` filenames. | LOW | Phase 5 documentation pass: state explicitly that `sessions/` = mandatory phase-end log; `observations/` = optional task-mid scratchpad; `checkpoints/` = wind-down crash safety. README in each. |
| G-10 | No tracking of *which subagent type fails most often*. The data exists (budget-tracker.md cites every `task-implementer` / `sandwich-dev` / `sandwich-verifier` agentId) but the failure-rate is not aggregated anywhere. | Manual count from budget-tracker.md: 6 sandwich-dev DONE_WITH_CONCERNS, 2 sandwich-verifier FAIL, 1 spec-compliance FAIL → narrow-fix. No table anywhere. | MEDIUM | Phase 5 should produce `subagent-failure-rates.md` aggregated from budget-tracker rows. Then plan can shift work to subagent types that work better for given task shapes. |

---

## 3. Human-Intervention Timeline & Root-Cause Table

Methodology: every `continue-injector` log = an actual SendKeys-driven `continue`. Some are watchdog-triggered (auto, not human). Some are user-typed. The injector log itself does not distinguish, so I cross-reference `.autonomous-stop-watchdog.log` (records autonomous_mode + narration_hit + api_error + premature_windown), `.autonomous-api-error-alert.log`, `.autonomous-premature-windown-alert.log`, and `agent-notes.md` narrative entries.

Mode classification key:
- **Mode A** = narrate-without-tool-call (LLM discipline drift)
- **Mode B** = Anthropic API `overloaded_error` mid-stream truncation
- **Mode C** = premature wind-down on self-track illusion
- **Mode D** = hook misconfig (path / cwd issue)
- **Mode E** = test/gate flake
- **Mode F** = subagent spec violation (e.g. spec-compliance-reviewer FAIL)
- **Mode G** = other (named per row)

| # | Timestamp (UTC) | Trigger / observable | Mode | Root cause (1-line) | Evidence |
|---|---|---|---|---|---|
| H-01 | 2026-04-24T21:39 | `continue-injector-20260424T213933Z.log` first injection. | G(boot) | First-ever boot of the harness pipeline; not a real "intervention" — was the initial autonomous kickoff. | Earliest injector log. |
| H-02 | 2026-04-24T22:58 | continue-injector fired. | C(early) | Wind-down between sessions #4 and #5; budget-tracker.md row 70 says "Wind-down protocol: writing checkpoint + self-reboot". | Auto-reboot, not human. |
| H-03 | 2026-04-25T00:15 | continue-injector. | C(early) | Wind-down session #5→#6 after Task 1.9d landed past 205K. | budget-tracker row 74: "~205K. Past wind-down." |
| H-04 | 2026-04-25T01:19 | continue-injector. | E | Task 1.10 verifier FAIL (2 critical bugs) → narrow-fix → reboot. The narrow-fix was triggered by VERIFIER catching real defects — not a process failure. | budget-tracker row 82-83. |
| H-05 | 2026-04-25T02:48 | continue-injector. | C | Session #7→#8 wind-down at ~190K after Task 1.16 verifier APPROVED_AFTER_FIX. | budget-tracker row 91; agent-notes.md:144 "1.16 fix-pending" checkpoint. |
| H-06 | 2026-04-25T03:57 | continue-injector. | C | Session #8 closed at ~165K after master-planner returned for Phase 2; reboot to give Task 2.0 fresh budget. | budget-tracker row 97. |
| H-07 | 2026-04-25T05:34 | continue-injector. | C | Session #9→#10 transition (budget reset 0→0). | budget-tracker row 105. |
| H-08 | 2026-04-25T06:12 | continue-injector. | C | Session #10→#11 wind-down at ~200K after Task 2.7.b. | budget-tracker row 106. |
| H-09 | 2026-04-25T07:11 | continue-injector. | C | Session #11→#12 routine wind-down. | inferred. |
| H-10 | 2026-04-25T07:53 | continue-injector. | C | Session-12 transition. | inferred. |
| H-11 | **2026-04-25T~01:10 → ~03:38** (UTC; ~2.5h dead time) | **No injector log fired.** Manual user nudge required. | **B** | **Session #13 Anthropic API overloaded_error truncated the stream AFTER "Dispatching sandwich-verifier..." text was emitted but BEFORE the Agent tool_use content block closed.** Discovered via user-supplied Claude.ai mobile screenshot. | `agent-notes.md:120-130` full RCA narrative; `.autonomous-api-error-alert.log` lines 1+ first event 2026-04-25T10:54 (note: log uses GMT+7 not UTC; same wallclock event). |
| H-12 | 2026-04-25T11:00 → 12:11 | 8 STOP events, 4 distinct session UUIDs, all `narration_hit=suspected api_error=suspected`. | B | Continued aftershocks of the Anthropic overloaded incident. The watchdog fired alerts but only the first triggered a manual investigation. | `.autonomous-stop-watchdog.log:7-24`. |
| H-13 | 2026-04-25T11:01 | continue-injector. | A or B | After H-11 was diagnosed, recovery-via-`continue` per `agent-notes.md:126`. Watchdog log marks `narration_hit=suspected`. | injector log + watchdog. |
| H-14 | 2026-04-25T16:01 → 16:38 | 6 more STOP events, session 76600e59. | B | Second cluster of API overloaded errors. | `.autonomous-stop-watchdog.log:45-50`. |
| H-15 | 2026-04-25T16:51 → 17:34 | 6 more, session 9a3daf79. | B | Third cluster. | `.autonomous-stop-watchdog.log:52-57`. |
| H-16 | 2026-04-25T11:35 | continue-injector. | C | Wind-down after Task 2.10.f. | budget-tracker row 132. |
| H-17 | 2026-04-25T12:11 | continue-injector. | C | Wind-down session #14 closed at 210K after Task 2.10 sandwich-architect; cliff exceeded. | budget-tracker row 128. |
| H-18 | 2026-04-25T13:49 | continue-injector. | C | Routine reboot. | inferred. |
| H-19 | 2026-04-25T16:00 | continue-injector. | E + C | Task 2.12 Phase-2 verifier closed with PASS_WITH_CONCERNS at ~175K → wind-down. | budget-tracker row 145. |
| H-20 | 2026-04-25T16:49 | continue-injector. | C | Phase 3 master-planner wind-down at ~190K. | budget-tracker row 163. |
| H-21 | 2026-04-25T17:42 | continue-injector. | C | Routine. | inferred. |
| H-22 | 2026-04-25T18:34 | continue-injector. | C | Routine session-17 transition. | inferred. |
| H-23 | 2026-04-25T19:26 | continue-injector. | C | Session-17 closed at ~200K after Task 3.9 done. | budget-tracker row 156. |
| H-24 | 2026-04-25T21:26 | continue-injector. | C | Session-17→18 wind-down. | inferred. |
| H-25 | **2026-04-25T~22:15 (~30-60min stall)** | **`.autonomous-premature-windown-alert.log:1`** "LIKELY MODE-C PREMATURE WIND-DOWN STOP. real_tokens=154926 (threshold=200000) wind_down_marker=absent". Manual user nudge required. | **C** | **Session #23 ended turn citing "approaching 200K wind-down" while real transcript was 121778 tokens (1.35× self-track inflation).** | `agent-notes.md:399-422` full RCA; `.autonomous-premature-windown-alert.log:1`. |
| H-26 | 2026-04-25T22:50 | watchdog logged second `premature_windown=suspected` event — recovery in progress, second nudge probably also needed before full continuation. | C | Same root cause. | `.autonomous-premature-windown-alert.log:2`. |
| H-27 | 2026-04-25T23:09 | continue-injector AT THE wind-down marker present moment (`real_tokens=210194 wind_down_marker=present`). | C(legitimate) | This is the first LEGITIMATE auto-wind-down — real-transcript actually crossed 200K. `auto-wind-down-1777133337.log` corroborates. | `.autonomous-stop-watchdog.log:89`. |
| H-28 | 2026-04-25T23:09 → 2026-04-26T01:22 | session 4c26ee40 ran clean for ~2 hours and 14 STOPs, never crossing 200K. All marked `narration_hit=clean api_error=clean premature_windown=clean`. | — | Session #24 (Phase 3 close-out → Phase 3 final). The cleanest run in the dataset. | `.autonomous-stop-watchdog.log:90-108`. |
| H-29 | 2026-04-26T07:23 | most recent continue-injector. | G(Phase5 boot) | Phase 5 kickoff; this very session. | injector log header. |

**Aggregate intervention count**:
- 24 continue-injector logs total (H-01 through H-29 minus duplicates).
- ~3 user-typed "continue" interventions: **H-11 (Mode B, ~2.5h dead time)**, **H-25/26 (Mode C, ~30-60min)**, and **H-29 (Phase 5 kickoff)**.
- The other ~21 injector firings were watchdog-triggered automatic reboots — these are SUCCESSFUL autonomous-loop self-management, not human interventions.

---

## 4. Pattern Density Analysis

### 4.1 Mode counts (over 28 sessions / 3 calendar days)

| Mode | Count of distinct triggering events | Cost | Note |
|---|---|---|---|
| A — narration drift | 0 confirmed (suspected by watchdog grep ~33 times but the H-11 RCA proved Mode B was actually responsible for those) | low when caught | The grep heuristic over-fires; needs tightening. |
| **B — API mid-stream truncation** | **33 STOP events** in `.autonomous-api-error-alert.log` across **8 session UUIDs** in a ~7h window 2026-04-25 | very high (1× ~2.5h, 7× ≤30m clusters) | Single dominant cause of REAL human intervention (H-11). |
| **C — premature wind-down** | **2 confirmed** in `.autonomous-premature-windown-alert.log` (sessions #23 + immediate retry) | high (1-2h per occurrence) | Highest impact-per-event because the watchdog cannot auto-recover (no `.wind-down` marker exists). |
| D — hook misconfig | 1 (Task 1.1 era) — fixed early, no recurrence | low | Discipline rule "hooks must use `${CLAUDE_PROJECT_DIR}` + mkdir -p" added. |
| E — test/gate flake | ~6 narrow-fix cycles (Tasks 1.10, 1.13, 1.16, 2.7.b, 2.7.c, 2.7.d, 2.8.d, 3.5.a, 3.5.d, 3.6, 4.12) — all caught by pipeline | low (the pipeline absorbed them) | Healthy. |
| F — subagent spec violation | 2 documented: 3.5.a spec-compliance FAIL (AppModule wired against plan A.7 boundary), 3.6 sandwich-verifier FAIL (5 critical including unwired fakeAdapter) | medium | Lesson: dispatch-prompt vs session-plan scope check (`agent-notes.md:201-205`). |
| G — other | self-reboot script broke once (Windows MainWindowHandle issue, agent-notes.md:146-152) — fixed in-session. | low | Single-instance. |

### 4.2 Mode C broken down by session-type

| Session phase | Mode-C events | Avg main-session token at end-turn | Average self-track / real ratio |
|---|---|---|---|
| Phase 1 (early) | 0 confirmed (LLM did not yet have the self-track inflation pattern) | n/a | n/a |
| Phase 2 mid | 0 — auto-reboots were legitimate. | n/a | n/a |
| Phase 3 mid (#22) | 0 confirmed. | — | — |
| **Phase 3 late (#23)** | **2 confirmed** | self-track 165K vs real 122K | **1.35×** |
| Phase 4 | 0 — by then `agent-notes.md:399-422` rule was in force. | n/a | n/a |

**Interpretation**: Mode C is NOT a constant background error — it's a specific failure pattern that emerged at the boundary between "long-IMPL-chain phase" (#23 had multiple verifier returns landing in the same session) and "the LLM has been instructed to wind down". The discipline rule added immediately after H-25 prevented recurrence. **One occurrence per ~24 sessions.** Phase 5 should still harden this because future v2.0 work may again chain many returns in a session.

### 4.3 Subagent failure rate (rough — needs G-10 followup)

| Subagent | Rough dispatches across phases | FAIL verdicts | Failure rate |
|---|---|---|---|
| sandwich-architect (opus) | ~12 | 0 | 0% |
| sandwich-dev (sonnet) | ~25 | ~6 DONE_WITH_CONCERNS (not real fails) | <5% real-fail |
| task-implementer (sonnet) | ~20 | 1 (3.5.a — spec FAIL by orchestrator-prompt error, NOT implementer fault) | <5% |
| spec-compliance-reviewer (sonnet) | ~12 | 2 FAILs (Task 3.5.a, Task 2.8.d) | ~17% — productive (caught real issues) |
| code-quality-reviewer (sonnet) | ~12 | 0 BLOCKING (1 REJECTED at 3.5.d for cap-enforcement; recovered next narrow-fix) | <10% |
| sandwich-verifier (opus) | ~8 | 2 FAILs (Task 3.6 1st pass, Task 4.12) — both productive | ~25% — by far highest rate; this is the SYSTEM WORKING (adversarial fresh-context catches real bugs) |
| master-planner (opus) | 4 (Phase 1 entry, Phase 2 entry, Phase 3 entry, Phase 4 entry) | 0 | 0% |
| research-scanner (sonnet) | ~10 (Phase 0) | 0 | 0% |

**Headline**: opus-fresh-context verifier catches what sonnet sees as clean — exactly as designed. Phase 5 must keep this gate; never collapse to "we're confident this task is small enough to skip the verifier".

### 4.4 Where humans intervened by phase

- **Phase 1**: 0 user interventions (loop ran, occasional auto-reboots).
- **Phase 2**: 1 user intervention (H-11, Mode B) — single dominant event.
- **Phase 3**: 2 user interventions (H-25 + retries, Mode C) — clustered at session #23.
- **Phase 4**: 0 user interventions; one verifier FAIL self-recovered via 4.12.r narrow-fix.
- **Phase 5 boot**: 1 user prompt (current task envelope).

**~3 real user nudges over ~3 calendar days of autonomous run** is below the failure rate the project assumed (`autonomous-protocol.md` budgeted "0-3 expected per phase"). The system held up.

---

## 5. Top-10 Self-Upgrade Proposals (ranked by expected ROI)

Format: `<rank>. <proposal-name> [target-path] — <patch description ≤1 line>`

1. **Tool-call-first ordering enforced as a UserPromptSubmit/Stop-hook lint, not just a CLAUDE.md prose rule.**
   `.claude/hooks/profiles/strict.md` (or new `scripts/hooks/tool-call-first-lint.sh`) — Stop hook reads the assistant turn's transcript, extracts content blocks, FAILs the turn if `text` block precedes `tool_use` block in autonomous mode AND the text contains "Dispatching" / "Will run" / present-progressive verb pattern. Currently CLAUDE.md just asks the LLM to discipline itself; making it hook-enforced removes Mode A entirely and reduces Mode B surface (because tool blocks emitted first survive truncation).

2. **API-truncation auto-recovery via Stop-hook side effect.**
   `scripts/hooks/autonomous-stop-watchdog.sh` (existing) — when `api_error=suspected`, automatically re-fire `scripts/session-self-reboot.sh` (or specifically inject `continue` via continue-injector.ps1) instead of merely logging the alert. Today the script logs and returns 0; the LLM must wait for a human to type `continue`. Adding a side-effect that reads `latest.md` and injects `continue` to the same TUI handle would have prevented H-11's 2.5h stall. Cost: idempotency guard via marker file (just like `.wind-down-fired`).

3. **Premature-wind-down hard guard via UserPromptSubmit lint.**
   `scripts/hooks/budget-watchdog.sh` (existing) — when LLM emits `Stop` content and the LAST 200 lines of transcript contain phrases like "approaching 200K", "past 150K soft-prep, stopping", "give next task fresh envelope", AND `.transcript-tokens` reports < 180K, REJECT the Stop with a `system-reminder` containing the actual real-transcript value and forcing the LLM to dispatch the next subagent. Mode C cannot recur. Patches via `additionalContext` injection in `Stop` hook output.

4. **Single-source test counts via `tests-baseline.json`.**
   `agent-workspace/memory/tests-baseline.json` (NEW) — emitted by every IMPL session-end skill; consumed by phase-N-complete.md generators. Closes G-6 and the decision-009 phase-3-complete.md typo at line 91 (replace inline number with `<<phaseExitTests>>` template tag).

5. **Subagent-failure index built by parsing `.session-hooks.log`.**
   `scripts/utilities/build-subagent-index.sh` (NEW) → writes `agent-workspace/memory/subagent-index.md` (NEW). Parses SubagentStop events, emits a table of agentId → start_ts → return_ts → verdict_class. Phase 5 master-planner can ingest it and route work to subagent types empirically known to single-pass-clean for given task shapes (closes G-8 and G-10).

6. **Atomic session-log writes (close pre-staging drift).**
   `.claude/agents/sandwich-dev.md` + `.claude/agents/task-implementer.md` (existing) — add explicit instruction: "Before declaring DONE, write the session log at `agent-workspace/memory/sessions/<date>-<task-N>.md` with files-modified inline; do NOT rely on the orchestrator to do it later." Phase 3 #19's pre-staged 3.8/3.9 work that confused #22-architect would not have happened. Cost: ~5 lines per agent file.

7. **`pnpm test` (root, parallel) gate added to FOCUSED_IMPL session contract.**
   `.claude/agents/sandwich-dev.md` + `.claude/agents/task-implementer.md` (existing) — add gate: "After all package-scoped gates pass, run root `pnpm test` (parallel) once and confirm exit 0. If it fails reproducibly, file as a CRITICAL finding before declaring DONE." This would have caught CRITICAL-1 in Task 4.12's IMPL session, not at the verifier gate. Cost: ~3 lines per agent file + ~1.5 minutes per session for the extra run.

8. **Watchdog narration-hit grep needs negative training.**
   `scripts/hooks/autonomous-stop-watchdog.sh` (existing) — current grep flags `narration_hit=suspected` for ANY transcript containing "Dispatch" or "Will run" or similar. This over-fires (33+ alerts in `.autonomous-api-error-alert.log` were really Mode B, not Mode A). Refine the grep to require BOTH (a) present-progressive verb AND (b) absence of an Agent tool_use block in the same turn. The hook already has access to the transcript path — it just doesn't parse content blocks today.

9. **Decision-doc stub at phase-N-complete generation time.**
   `.claude/skills/verification-before-completion/SKILL.md` (existing, last paragraph) — extend skill to require: when phase-N-complete.md is written, scan `decisions/` for any decision in `phase: N` AND that the doc title in the README index is byte-equal with the decision's H1. Catches G-6's phase-3-complete.md:91 typo. Cost: ~5 lines.

10. **Skill self-test discipline (Phase 5 charter §2 cornerstone).**
   For every skill in `.claude/skills/<name>/SKILL.md`, a sibling `<name>.test.md` (NEW) listing: trigger conditions, expected behavior, failure modes, and `<assertions>` block consumed by a Phase 5-built test runner (`scripts/skills-self-test.sh`). Each Stop hook randomly samples one skill self-test and confirms the LLM (in a dispatched isolated subagent) follows it. The Phase 5 charter (`current-execution.md:24-26`) explicitly mandates this — make it concrete now rather than later.

---

## 6. Memory-System Coherence Audit

### 6.1 File-existence vs CLAUDE.md citations

| File path cited in CLAUDE.md | Exists on disk? | Notes |
|---|---|---|
| `agent-workspace/memory/current-execution.md` | YES | Mutated by Phase 5 kickoff; previous v1.0-halt state preserved only in checkpoint+project-complete. |
| `agent-workspace/memory/project.md` | YES | 5,495 bytes; seems Phase 0/1 era; not updated past Phase 1. |
| `agent-workspace/memory/agent-notes.md` | YES | 498 lines; up to date through Task 4.12.r. |
| `agent-workspace/memory/checkpoints/latest.md` | YES | matches `2026-04-26T01-30Z-phase3-task-3.5.d-narrow-fix-pending.md` mtime — but content is "PROJECT COMPLETE — Phase 4 closed". So `latest.md` is fresh content with old mtime — ok if just-overwritten. |
| `agent-workspace/research/` | INCONCLUSIVE | gitStatus truncated; not directly listed in this session's reads. CLAUDE.md says "Reference repos notes". Worth a Phase 5 verification pass. |
| `agent-workspace/constitution/*.md` | YES (per gitStatus A-files) | All 7 constitution files present in `git status`. |
| `agent-workspace/memory/sessions/` | YES | 57 files. |
| `.claude/skills/*/SKILL.md` | YES (per gitStatus) | 14 skills A-listed. |
| `.claude/agents/*.md` | YES (per gitStatus) | 9 agents A-listed. |
| `.claude/commands/*.md` | YES (per gitStatus) | 9 commands A-listed. |
| `.claude/hooks/profiles/{minimal,standard,strict}.md` | YES | Verified by direct find. |
| `scripts/hooks/budget-watchdog.sh` | YES (per direct ls) | 5,743 bytes. |
| `scripts/hooks/autonomous-stop-watchdog.sh` | YES | 6,239 bytes. |
| `scripts/hooks/session-start-bootstrap.sh` | YES | 4,618 bytes. |

**No missing files cited in CLAUDE.md.** No orphan files in `agent-workspace/memory/` directly except `phase-3-handoff-and-budget.md` (G-5) which is in session-plans/completed/.

### 6.2 Internal cross-reference contradictions

- **`phase-3-complete.md:90` decision 009 title typo** — file says `gen_ai.usage.cache_read_input_tokens`; actual decision 009 + invariants.md + code all agree on `gen_ai.usage.cache_read_tokens`. Found at agent-notes.md:436 verifier audit + decisions/009-cache-read-attr-name.md content. **One-line fix needed** in phase-3-complete.md.
- **Test count drift G-6** — three docs disagree on Phase 3 exit (~1,346 vs 1,330 vs 1,330 + post-3.13).
- **`current-execution.md:10-11`** — `autonomous_mode: true` but `latest.md:4` `autonomous_mode: false`. Resolution: current-execution.md was updated for Phase 5 kickoff after `latest.md` was written. The drift is intentional but undocumented (G-7).

### 6.3 MEMORY.md vs agent-notes.md sync

- `MEMORY.md` (user-side): 6 entries, all formatted `feedback_*`. Last entry: `feedback_autonomous_premature_windown.md` (Mode C, 2026-04-26).
- `agent-notes.md` (project-side): ~30 distinct entries across all phases.
- **No 1:1 mapping enforced.** Some agent-notes lessons graduated to MEMORY.md (the 5 feedback_* user memories); most did not. This is the right architecture (project-specific lessons stay project-side) but a hook (G-2) would help promote the highest-impact ones.

### 6.4 Decision-doc index integrity

- `decisions/README.md` Index lists 001 through 010 — matches file system exactly.
- All decisions have `Status: active`; no superseded chains observed.
- One doc-title typo (above; phase-3-complete.md not decisions/README.md itself).

### 6.5 Checkpoints lineage

- 18 checkpoints in `checkpoints/`; `latest.md` is the canonical pointer.
- Pattern: every wind-down writes a timestamped checkpoint AND copies to `latest.md`. This held through all 28 sessions. **Strongest tracking discipline of the project.**

### 6.6 Hook log integrity

- `.session-hooks.log` 10,438 lines — no parse anomalies on quick read.
- `.transcript-tokens` 6 bytes (just a number, current value 185696 from session #28's last entry).
- `.autonomous-stop-watchdog.log` 108 entries — every entry has the expected fields.
- `.continue-fired-*` markers exist for the wind-down events; idempotency held.

---

## 7. Open Questions for Master-Planner (Phase 5.1)

1. **Should Mode B (API truncation) recovery be moved into the Stop hook, or stay LLM-side via the `agent-notes.md:120-130` recovery protocol?** Hook-side (proposal #2) removes human intervention but adds risk: a hook that injects `continue` when the API is overloaded may double-charge tokens if the prior turn DID partially succeed. We need a marker like `.api-truncation-recovery-fired-<request_id>` to keep idempotency.

2. **Should we deprecate the narration-hit heuristic entirely?** It over-fired ~30× during Phase 2-3 with most "suspected" being Mode B not Mode A. If proposal #1 (tool-call-first lint) fully removes Mode A, the narration heuristic can be retired and the watchdog only logs API errors and premature-wind-down.

3. **Is `pnpm test` (root, parallel) a per-IMPL gate (proposal #7) or a per-phase-end gate?** Cost: ~1.5 min × 28 sessions = ~42min total per phase. Worth it if it prevents one CRITICAL-1-class finding (which itself cost ~30min of recovery cycle). Probable ROI: positive but not obvious.

4. **For Phase 5's "self-evolving skill/command/workflow" charter — what is the unit of self-improvement?** Options: (a) per-skill metrics (trigger-rate × success-rate) — easy but coarse; (b) per-task-shape metrics (which agent type single-pass-clean'd which task shapes) — harder but actionable; (c) per-decision-outcome metrics (after decision N was logged, did downstream tasks regress or improve?) — hardest but most charter-aligned. Recommend (b) using G-8 + G-10 followups.

5. **G-7 `current-execution.md` drift**: should phase-boundary kickoffs preserve previous state inline, or rely on checkpoints? Inline is more robust against checkpoint-loss but bloats the file. Recommend a footer-only pattern: "previous-state at <checkpoints/...>".

6. **Should `phase-N-complete.md` be auto-generated from a template + JSON inputs (proposal #4)?** Trades discipline (each phase closer writes the retrospective by hand, learns) for consistency (no test-count drift, no decision-title typos).

7. **For Phase 5 §3 (parallelization as first-class)**: the dataset shows 28 sessions ran sequentially with 1-3 subagents in parallel within a session. There is NO precedent for >1 main session running in parallel. The watchdog .session-hooks.log assumes single-session. Phase 5's parallelization model needs to choose: (a) keep one main session, parallelize sub-agents harder; (b) introduce a true session-pool with the Orch daemon (which is exactly the product, this is the "dogfood" frontier). Pick (a) for v2.0 minimum; (b) for v2.1.

8. **Is `agent-workspace/memory/project.md` deprecated?** Mtime 2026-04-24, never updated past Phase 1. CLAUDE.md still cites it as "project state". Recommend either delete or fold into `current-execution.md`.

9. **Should the `observations/` directory be retired in favor of inline session-log fragments?** It only saw use during Tasks 1.9, 2.7, 2.10, 3.5 — i.e. the longest IMPL chains. Keeping it adds entropy (G-9). Recommend explicit policy: observations/ is OPTIONAL, only when a single task spans >1 day OR has >5 subtasks.

10. **What is the maximum acceptable ratio of self-track to real-transcript before the LLM should treat its own self-track as unreliable?** Observed: 1.35× at H-25. If the system tolerates up to 1.5× we keep some headroom. If we require ≤1.1×, the LLM must update self-track after EVERY major tool batch, not just subagent returns. Recommend: codify the 1.35× as a measured constant and have the skill check enforce `if self-track > 1.35 * .transcript-tokens → recalibrate self-track`.

---

## Appendix A — File path index (selected, all absolute)

- C:/htdocs/orch-starter/agent-workspace/memory/.autonomous-stop-watchdog.log
- C:/htdocs/orch-starter/agent-workspace/memory/.autonomous-api-error-alert.log
- C:/htdocs/orch-starter/agent-workspace/memory/.autonomous-premature-windown-alert.log
- C:/htdocs/orch-starter/agent-workspace/memory/.transcript-tokens
- C:/htdocs/orch-starter/agent-workspace/memory/.session-hooks.log
- C:/htdocs/orch-starter/agent-workspace/memory/budget-tracker.md
- C:/htdocs/orch-starter/agent-workspace/memory/agent-notes.md
- C:/htdocs/orch-starter/agent-workspace/memory/current-execution.md
- C:/htdocs/orch-starter/agent-workspace/memory/project-complete.md
- C:/htdocs/orch-starter/agent-workspace/memory/phase-{0,1,2,3,4}-complete.md
- C:/htdocs/orch-starter/agent-workspace/memory/checkpoints/latest.md
- C:/htdocs/orch-starter/agent-workspace/memory/handoff-logs/continue-injector-*.log (24 files)
- C:/htdocs/orch-starter/agent-workspace/memory/decisions/{001..010}-*.md
- C:/htdocs/orch-starter/scripts/hooks/{autonomous-stop-watchdog,budget-watchdog,session-start-bootstrap}.sh
- C:/htdocs/orch-starter/scripts/hooks/continue-injector.ps1
- C:/htdocs/orch-starter/.claude/hooks/profiles/{minimal,standard,strict}.md
- C:/htdocs/orch-starter/agent-workspace/session-plans/completed/phase-{0..4}-*.md

## Appendix B — Concrete evidence quotes (1-2 lines each, sampled)

- **Mode B RCA (agent-notes.md:122)**: "Initial diagnosis (LLM discipline drift / 'narrate-as-action') was WRONG. User-provided Claude.ai mobile screenshot ... revealed the truth: the assistant response was emitting text + Agent tool_use, but the API returned `{"type":"overloaded_error"...}` MID-STREAM"
- **Mode C RCA (agent-notes.md:401-403)**: "Session #23 ended turn at self-track ~165K citing 'approaching 200K wind-down; want to give Task 3.11 fresh envelope'. Real transcript at that moment was 121,778 tokens. No `.wind-down` marker existed."
- **Decision 009 vs phase-3-complete.md drift (phase-3-complete.md:90)**: "| 009 | Cache-read token attribute name: `gen_ai.usage.cache_read_input_tokens` |" — actual decision file pins `gen_ai.usage.cache_read_tokens`.
- **CRITICAL-1 P0 leak (agent-notes.md:472)**: "`pnpm test` (root) exits 1: `__e2e__/integration.spec.ts > Scenario B > B1` fails with `DomainError: releaseSessionLock` because Scenario A's deferred `_handleGracefulEnd` path hits `OrchStoreService.releaseSessionLock` AFTER Scenario B's `prisma.onModuleDestroy()` already closed the DB."
- **P0 Date redaction bug (budget-tracker.md row at session #23, ~23:30Z)**: "`EventBusService.emit()` applies `redactLogObject()` to all event payloads; `redactLogObject` converts `Date` → `{}` because `typeof date === 'object'` with no own enumerable properties. ... Phase 3 handoff chain SILENTLY BROKEN in production"
- **Tool-call-first ordering rule (CLAUDE.md, end of TURN-END DISCIPLINE section)**: "structure responses tool-call-first ... long summaries/analysis go AFTER the tool call (or into memory files), not before."

---

**End of retrospective.** No skill/agent/hook source files were modified. This document is the only artifact produced.
