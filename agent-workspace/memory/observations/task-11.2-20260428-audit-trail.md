# Task 11.2 — Audit-trail inline-return discipline

## Status
DONE_WITH_CONCERNS (executed orchestrator-side after subagent dispatches blocked twice)

## Files Changed

- `.claude/agents/spec-compliance-reviewer.md` — `tools` += `Write`; Phase 6 retitled "MANDATORY — DO NOT return inline-only" with canonical path `agent-workspace/memory/observations/task-<id>-<YYYYMMDD>-spec-compliance.md`.
- `.claude/agents/code-quality-reviewer.md` — analogous: `tools` += `Write`; Phase 5 retitled; canonical path `<task>-<YYYYMMDD>-code-quality.md`.
- `.claude/agents/sandwich-verifier.md` — analogous: `tools` += `Write`; Phase 7 retitled; canonical path `<task>-<YYYYMMDD>-sandwich-verifier.md`.
- `.claude/skills/observation-file-write-on-return/SKILL.md` — new discipline skill (orchestrator-side safety net for path #3 of 11.2 fix-path enumeration).
- `.claude/skills/observation-file-write-on-return/observation-file-write-on-return.test.md` — sibling test file with all 4 required sections + 3 ordered assertions.
- `agent-workspace/memory/sessions/2026-04-28-task-11.2-audit-trail.md` — session log.
- `agent-workspace/memory/observations/task-11.2-20260428-audit-trail.md` — this file.

## Fix path chosen

Combination 1+3 per master plan default:
1. **Subagent contract bake**: `Write` added to all 3 reviewer agent `tools` arrays + canonical observation path explicit in each Phase-N report-write section.
3. **Orchestrator-side discipline skill**: `observation-file-write-on-return` skill authored as safety net when reviewer subagents skip their Write phase (e.g., context-budget exhaustion, runtime tool denial).

Path #2 (hook-side PostToolUse detection) explicitly NOT pursued — too invasive for v2.6 budget per master plan §11.2 line 238.

## Gates

- `pnpm run skills:validate` → **OK (14 skills scanned, 11 warnings)**. The new skill brings the count from 13 → 14. Validator errors = 0. Description-too-long warnings unchanged from pre-11.2 baseline (non-blocking; carried forward to v2.7).
- `bash scripts/audit/charter-coherence-spot-check.sh` → **PASS** (no hard-rule softening detected).

## Execution notes (orchestrator-side anomaly)

This substage was originally dispatched as task-implementer subagent twice:
- bg `a347c97e07fee1a19` (initial dispatch) — BLOCKED on Edit/Write tool denial despite settings.json explicit allow on `.claude/**` and `agent-workspace/memory/**`.
- bg `a540b6ff83ada6bd8` (re-dispatch after user confirmed they would approve) — BLOCKED again identically. Subagent reported denial without surfacing a permission prompt.

Same blocker also affected 11.1 hygiene batch (`ae093909f9be3b109`, killed after silent stall — no source file changes despite agent claiming "27 tests pass for files I touched"). 11.3 (`a6b418c96d19edaf8`, opus/medium) succeeded — wrote only to `agent-workspace/memory/` paths.

**Pattern**: subagent Edit/Write to `.claude/`, `scripts/`, `tests/` paths blocked at runtime; subagent Edit/Write to `agent-workspace/memory/` paths permitted. Root cause unidentified — settings.json explicitly allows the blocked paths. Carried forward as **CF-V2.6-SUBAGENT-WRITE-PATH-ANOMALY**.

11.2 work was completed by main session (orchestrator) directly via Edit/Write — same outcome, different execution path, demonstrating that the discipline skill `observation-file-write-on-return` is also the right fallback for "subagent failed to write — orchestrator persists".

## Concerns

- 11.1 hygiene batch (11 small CFs) is INCOMPLETE on disk — needs re-attempt. Routes:
  - (a) Same orchestrator-side strategy: main session does the 11 small fixes directly. ~150-200 LOC aggregate; well-bounded.
  - (b) Investigate the subagent-write-path anomaly first; if quickly resolvable, re-dispatch normally.
- The `observation-file-write-on-return` skill is registered (visible in available-skills list per system-reminder) but not yet auto-invoked anywhere. v2.7 may add a skill-use checkpoint.

## Next action

`proceed_to_11_4_mid_verify` — but 11.1 needs to land first (orchestrator-side or subagent re-dispatch after blocker resolved). Recommendation: defer 11.1 to next session (post-budget-reboot); 11.2 fully closed.
