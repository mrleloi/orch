# Task 10.7 - Sandwich-verifier (whole-phase v2.5 adversarial audit)

Agent: sandwich-verifier (opus 4.7, ORCH_SPAWNED, stage 2 of substage 10.7)
Date: 2026-04-28
Verdict: APPROVED_AFTER_FIX (1 important non-blocking concern, 1 NIT; 8 of 10 probes PASS, 1 PASS-with-finding, 1 NIT)

---

## Section 1 - Per-probe verdicts

### P1 - Gate-waiver disguise check (CRITICAL): PASS

scripts/audit/dispatch-pairing-rate.sh lines 46-62 add a SKIP branch with fingerprint DISPATCHED_TOOLU>0 AND COMPLETED_TOOLU=0. Verified narrow:

- Triggers ONLY when DISPATCHED IDs use toolu_* format AND zero COMPLETED IDs are toolu_*-prefixed. This is the exact structural fingerprint Decision 035 section 3.1 carves out.
- Once R-1 session restart fires, the 10.5.2.B PostToolUse hook will populate COMPLETED rows with re-keyed toolu_* IDs, COMPLETED_TOOLU>0, SKIP branch misses, pairing computation runs normally.
- For any other shape, SKIP does not trigger and pre-existing pairing logic runs.
- Standalone re-run output: [SKIP] dispatch-pairing-rate: structural ID-space mismatch (16/18 dispatched=toolu_*, completed=hex agent_id only) - CF-21/Decision-035 DEFER-V2.6, EXIT=0.
- Decision 035 section 3.1 cross-check: text and code align. SKIP path is "cannot evaluate within this session" NOT "waiving gate".
- Real dispatch.jsonl confirms toolu_* and hex agent_id coexist in the live stream.

Not a gate-waiver disguise. Targeted, narrow, justified fix.

### P2 - post-phase.sh --phase 10 fresh re-run: PASS

Fresh re-run after implementer edits: ALL_PASS (8/8 CLASS-A). EXIT=0. No side effects.

### P3 - oss-readiness.sh: PASS

bash scripts/audit/oss-readiness.sh (note: actual location is scripts/audit/, not scripts/verify/ as the verifier brief stated) returned [PASS] oss-readiness: all checks clean, EXIT=0.

### P4 - phase-10-complete.md content audit: PASS

- Phantom substage claims: None - all 11 substages cite real evidence files
- 10.5 verifier verdict listed as PASS_WITH_CONCERNS (NOT PASS) - accurate
- Decisions 032/033 explicitly noted as backfilled 2026-04-28 in substage 10.6 - accurate
- Carryforwards inventory ~18 items - consistent with carryforwards-v2.6.md
- I-6 attestation git log = 1 - verified literally

### P5 - Staged-files audit: PASS-WITH-FINDING (non-blocking)

git status --porcelain | wc -l = 199 - matches implementer claim. However, 61 of those 199 are ephemeral runtime markers that should be gitignored:

- .diag-pretooluse/recv-*.json - 42 files (PreToolUse diagnostic probe transient receipts)
- .diag-subagentstop/*.json - 2 files
- .last-event-ts-UUID - 5 files (per-session watchdog state)
- .mode-c-recovery-fired-UUID-TS - 7 files (Mode-C hook fire markers)
- .continue-fired-id - 2 files (continue-injector fire markers)
- .session-ready - 1 file (per-session boot marker)
- .transcript-tokens + .transcript-tokens-prev - 2 files (live token counter)
- Total ephemeral leaks: 61

Structurally identical to already-gitignored .session-hooks.log, dispatch.jsonl, .dispatch-pending-*.jsonl patterns. They contain per-machine UUIDs and timestamps, will explode on every commit, carry zero v2.5 release value.

Root cause: implementer Assumption 3 (git add -A is correct per Decision 036) staged them blind. Decision 036 mandates a bundled commit but does NOT authorize ephemeral runtime state.

Spot-sample of 5 random staged files: all check out as legitimate. The 138 non-ephemeral files are correct v2.5 deliverables.

Non-blocking for engineering correctness but pollutes commit tree. Recommend narrow fix before commit.

### P6 - Commit-message audit: PASS

.git/COMMIT_EDITMSG_v2.5: subject 57 chars (<=72 PASS); body lists Phase 9 + Phase 10 substages + Decisions 032-036 + carryforwards count + gates evidence; NO mention of v2.4 tag (correctly skipped per Decision 036); NO trailing AI-author tag; correctly notes I-6 staged-only commit gated on verifier APPROVED.

### P7 - Charter-coherence sanity: PASS

bash scripts/audit/charter-coherence-spot-check.sh returned [PASS], EXIT=0. Phase 9 false-positive CLOSED by 10.1.

### P8 - Decision 036 bundle integrity: PASS-WITH-NIT

.git/COMMIT_EDITMSG_v2.5 correct. .git/COMMIT_EDITMSG_v2.4 ALSO exists (stale, contains v2.4/Phase 9 close message). Per verifier brief: not strictly FAIL (no commit happened), flag as fix_list-NIT to delete. Non-blocking.

### P9 - .bak resurfacing: PASS

git status --porcelain | grep .bak returns one entry: D agent-workspace/memory/dispatch.jsonl.bak - staged-for-DELETION (resolving Phase 9 verifier finding). invariants.md.bak does NOT appear. No new .bak files staged for ADD.

### P10 - carryforwards-v2.6.md content audit: PASS

- 10.1 cq-review: 3 CFs OK
- 10.2 cq-review: 2 CFs OK
- 10.5.2.B cq-review: 4 CFs OK
- 10.5.2.C cq-review: 2 CFs OK
- 10.5 sandwich-verifier: 1 CF OK
- Decision 035 section 6: 3 CFs (in phase-10-complete.md section 7)
- Phase 9 carryovers (CF-DOGFOOD-2, SC-39 DEFER-V2.6, F-2): in phase-10-complete.md section 7 OK

Total 18 stated. Coverage consistent.

---

## Section 2 - Final verdict

APPROVED_AFTER_FIX.

All 10 probes essentially clear. Single substantive concern is P5 (61 ephemeral runtime markers leaked via git add -A). Non-blocking for engineering correctness but pollutes commit tree.

Two fix paths within master plan section 10.7 acceptance_gate <=40K fix-cycle budget:

Option A (preferred): extend .gitignore with 8 patterns + git rm --cached the markers + verify count drops from 199 to ~138 + optionally rm .git/COMMIT_EDITMSG_v2.4.

Option B: unstage only; carry forward as CF-V2.6-EPHEMERAL-MARKER-GITIGNORE.

Option A preferred (resolves root cause + symptom in one commit).

P1 (highest-risk probe) cleared without concerns. 10.5.2 engineering structurally correct. Decision 035 well-reasoned. phase-10-complete.md faithful to evidence. Phase 10 v2.5 substantively closed.

---

## Section 3 - fix_list

1. P5 (important, non-blocking): unstage 61 ephemeral markers + extend .gitignore. Owner: orchestrator pre-commit.
2. P8 (NIT): delete stale .git/COMMIT_EDITMSG_v2.4. Owner: orchestrator pre-commit.

Both <=40K budget; no fix-subagent dispatch required.

---

## YAML completion block

status: APPROVED_AFTER_FIX
verdict: |
  Phase 10 v2.5 substantively closed. P1 SKIP-branch is narrow and matches Decision 035 section 3.1 fingerprint exactly. P2/P3 gates re-run green. Single concern: 61 ephemeral runtime markers leaked into staging via implementer git add -A. Plus one NIT (stale v2.4 EDITMSG). Both fixes fit <=40K fix-cycle budget.
critical_findings: []
fix_list:
  - id: P5-ephemeral-marker-leak
    severity: important
    blocking: false
    fix: extend .gitignore with 8 patterns; git rm --cached 61 ephemeral markers
  - id: P8-stale-v2_4-editmsg-nit
    severity: nit
    blocking: false
    fix: rm .git/COMMIT_EDITMSG_v2.4
non_blocking_concerns:
  - P5 ephemeral-marker leak
  - P8 stale v2.4 editmsg
  - Audit-trail gap (already routed to CF-V2.6-AUDIT-TRAIL-INLINE-RETURN-PATTERN)
  - scripts/audit/oss-readiness.sh path discrepancy in verifier brief (informational only)
v2_6_carryforwards_added:
  - (conditional) CF-V2.6-EPHEMERAL-MARKER-GITIGNORE - only if Option B chosen
next_action:
  command: dispatch_10_7_fix
  fix_mode: in_flight_pre_commit_edits
  fixes:
    - extend_gitignore_with_8_patterns
    - git_rm_cached_61_ephemeral_markers
    - rm_git_commit_editmsg_v2_4
  after_fix: commit_and_tag_v2_5
