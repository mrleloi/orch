# Checkpoint — Phase 12 v2.7 — Session #50 (USER PIVOT to dogfood E2E + user docs)

Created: 2026-04-28 session #50.
Status: **User issued top-priority pivot 2026-04-28: (1) Make Orch ACTUALLY self-apply (12.3 only mechanically met G4 — needs ccs delegation OR ORCH_RUNTIME_MODE=subscription); (2) Author user-guide docs shareable to another dev. Adapter patched + 4 doc files authored inline. E2E verification + remaining docs gated on Anthropic quota reset (6:50pm Asia/Saigon).**

## What landed in Session #50

### Adapter patch (subscription-mode fallback)

- `packages/core/src/modules/sessions/claude-code-adapter.ts`:
  - `spawn()` now branches on `process.env.ORCH_RUNTIME_MODE === 'subscription'`:
    - Subscription mode: `execa('claude', ['--rc', \`orch-${profile||'self'}\`, '-p', prompt, '--output-format', 'stream-json'])` — uses `~/.claude/` credentials directly; no ccs delegation profile required
    - Default (ccs mode): unchanged — `execa('ccs', [profile, '-p', prompt, '--output-format', 'stream-json'])`
  - Module-header comment (line 5-6) updated to reflect both spawn paths
- `resume()` NOT yet patched — subscription-mode resume gated to v2.8 (post-v2.7 carryforward)
- **Tests NOT yet added** — gated on quota reset; spec needs 2-3 new tests covering the subscription branch

### Docs landed

- `docs/README.md` (NEW; ~150 LOC) — landing page + sharing entry point, architecture ASCII diagram, capability status table (stable/scaffolded/gated), index of all docs
- `docs/apply-to-your-project.md` (NEW; ~250 LOC) — the explicit "send to another dev" use case; 10-step migration recipe; reuse-vs-fresh table; runtime-mode picker; common gotchas
- `docs/TROUBLESHOOTING.md` (UPDATED; +180 LOC appended) — new sections: ccs-delegation-not-configured (both fix paths A/B), tsx ESM resolution gap, dogfood-spawn-fails diagnostic, pre-existing hook test failures, trace file leakage, git-stash-incident with real example from 12.1 race, concurrent-subagents-racing
- `docs/configuration.md` (UPDATED; +25 LOC) — new Runtime Mode section documenting `ORCH_RUNTIME_MODE=subscription` and `ORCH_DOGFOOD_EXECUTE`

### Disk-truth verification commands (run anytime to confirm)

```bash
grep -n "ORCH_RUNTIME_MODE" packages/core/src/modules/sessions/claude-code-adapter.ts
# Expect: 1+ matches (line ~287 area, in spawn())

ls docs/README.md docs/apply-to-your-project.md
# Expect: both exist

grep -c "ccs-delegation-not-configured\|git-stash-incident\|ORCH_RUNTIME_MODE" docs/TROUBLESHOOTING.md docs/configuration.md
# Expect: ≥3 (TROUBLESHOOTING) + ≥2 (configuration)
```

## Phase 12 substage status

| Substage | Status | Evidence |
|---|---|---|
| 12.0 master plan + routing brief | ✅ DONE | `phase-12-v2.7-self-application-priority.md` + `phase-12-routing-brief.md` |
| 12.1 step-9 wire | ✅ APPROVED_WITH_CONCERNS | spec PASS_WITH_CONCERNS (1 minor); quality APPROVED_WITH_CONCERNS (0c/2i/2n) |
| 12.2 audit + A.9 wire | ✅ APPROVED_WITH_CONCERNS | quality APPROVED_WITH_CONCERNS (0c/2i/2n) |
| 12.3 dogfood self-application | ⚠️ DONE_WITH_CONCERNS — TRUE E2E PENDING | trace + Decision 041 BINDING (351 LOC) but housekeeping fix landed via orchestrator-fallback (ccs delegation gap); subscription-mode adapter patch lands the code path, true E2E verification gated on quota reset |
| **12.D-1 (NEW)** subscription-mode adapter + true E2E | 🟡 IN PROGRESS | adapter patched; tests + E2E run gated on quota reset 6:50pm Asia/Saigon |
| **12.D-2 (NEW)** user-guide docs | 🟡 IN PROGRESS | 4 files done (README, apply-to-your-project, TROUBLESHOOTING update, configuration update); components.md + glossary.md remaining |
| 12.4 SC-39 W-1 fix | ⏸️ DEFERRED behind 12.D-1/12.D-2 per user pivot |
| 12.5 multi-user namespace | ⏸️ DEFERRED |
| 12.6 community sharing prep | ⏸️ DEFERRED |
| 12.7 mid-verify | ⏸️ DEFERRED |
| 12.8 F-2 disposition | ⏸️ DEFERRED |
| 12.9 housekeeping | ⏸️ DEFERRED — concerns from 12.1/12.2/12.3 already routed |
| 12.10 phase-close + bundled commit | ⏸️ DEFERRED |

## NEXT ACTION (Session #51 — post-quota-reset)

### Priority 1 — Verify subscription-mode E2E

```bash
cd C:/htdocs/orch-starter
ORCH_RUNTIME_MODE=subscription ORCH_DOGFOOD_EXECUTE=true \
  npx tsx scripts/dogfood/run-self-task.ts \
  --envelope agent-workspace/queue/self-tasks/phase-12-12.3-housekeeping.yaml \
  2>&1 | tee agent-workspace/traces/dogfood-phase-12-12.3-real-e2e.log

# Verify trace file
cat agent-workspace/traces/dogfood-phase-12-12.3-real-e2e.jsonl | head
# Look for: dogfood.subprocess_spawn span with NON-EMPTY session_id, flag_off=false
# AND status: ended/complete (NOT status: error)
# AND the housekeeping fix is observable in `git diff` (NOT applied by orchestrator)
```

If npx tsx still hits the ESM resolution gap (CF-V2.7-12.3-TSX-ESM-RESOLUTION),
fall back to vitest driver:

```bash
ORCH_RUNTIME_MODE=subscription ORCH_DOGFOOD_EXECUTE=true \
  npx vitest run --config vitest.config.ts \
  tests/dogfood/12.3-real-dispatch.spec.ts
```

### Priority 2 — Add adapter tests

`packages/core/src/modules/sessions/claude-code-adapter.spec.ts` — add 2-3 tests:
- `spawn() with ORCH_RUNTIME_MODE=subscription invokes 'claude' with --rc args`
- `spawn() without ORCH_RUNTIME_MODE invokes 'ccs' with profile`
- `spawn() with ORCH_RUNTIME_MODE=other-value falls back to ccs`

Mock `execa` to assert the command + args; existing test patterns in the same
file are good templates.

### Priority 3 — Update Decision 041 §8 with TRUE E2E attestation

Append to `agent-workspace/memory/decisions/041-cf-dogfood-2-closure-attestation.md`:
- §8 cite the E2E trace path
- Confirm session_id non-empty, flag_off=false
- Confirm housekeeping fix landed via dogfood-spawned subagent (NOT orchestrator-fallback)
- Upgrade verdict §1 from "DONE_WITH_CONCERNS" hint to clean DONE if applicable

### Priority 4 — Author remaining docs (optional)

- `docs/components.md` — subagents/skills/hooks reference table (existing
  architecture.md partially covers; this would be the explicit dev-onboarding
  reference)
- `docs/glossary.md` — short-form vocabulary
- `docs/install.md` — currently DAY_1_CHECKLIST.md serves; could rename + extend

These are nice-to-haves; the docs/ tree as of Session #50 is already
shareable to another dev per user request.

## Wind-down state

Real transcript at Session #50 close: ~70K (Session #50 began at 41K post-restart).
Wind-down at 200K. Cliff at 230K. Session #50 deliberately stayed lean since
both subagents quota-failed and inline-work-only was the path forward.

**Quota reset**: 6:50pm Asia/Saigon (~4 hours from session #50 start).
Session #51 should resume with quota available.

## v2.7 carryforwards (unchanged from prior checkpoint)

All 9 carryforwards still queued for 12.9 housekeeping batch. The 3
12.3 carryforwards (CCS-DELEGATION-ENV, TSX-ESM-RESOLUTION, DOGFOOD-FALLBACK-CAVEAT)
are partially addressed by the subscription-mode adapter patch — but remain
open until E2E verification confirms the fallback caveat is dissolved.

## I-6 status

Zero `git commit` invocations across Phase 12. All staged in index. Next commit
gated on 12.10 sandwich-verifier APPROVED per autonomous standing grant
2026-04-28. The user-pivot work (12.D-1/12.D-2) bundles into the same v2.7
release commit at 12.10.
