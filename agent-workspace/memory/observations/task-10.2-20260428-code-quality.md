# Code Quality Review — Task 10.2 (CF-25 citation-linter dedup)
## Date: 2026-04-28
## Reviewer: code-quality-reviewer (sonnet, ORCH_SPAWNED)
## Prerequisite: spec-compliance-reviewer returned PASS (observations/task-10.2-20260428-spec-compliance.md)

---

## Verdict
PASS

---

## Invariant Grep

| Invariant | Scope | Check Result | Notes |
|---|---|---|---|
| I-1 no SDK imports in core | `scripts/utilities/`, `tests/scripts/` | PASS | No `@anthropic-ai/sdk`, `claude-agent-sdk`, or `ClaudeSDKClient` found |
| I-2 no project-name hardcoding | both changed files | PASS | Zero occurrences of `stockforge`, `StockForge`, `vnstock`, `VCB` |
| I-3 no `claude-agent-sdk` / `ClaudeSDKClient` in non-test | both changed files | PASS | Confirmed zero occurrences |
| I-5 no `.ccs/` / `.claude/` credential access | `citation-linter.ts` lines 21-22, 63 | PASS (not a violation) | `.claude/skills/` appears as a **resolution path template** for component existence checks, not credential access. I-5 prohibits auth-file reads; these are project-relative filesystem paths for SKILL.md/agents.md lookup. |
| I-14 no module-level `let`/`var` | `citation-linter.ts:69` | PASS (scoped exemption) | `let rollupPath=values['rollup']` at line 69 is in a CLI entrypoint in `scripts/utilities/`, not in `packages/core/src/`. I-14's grep check is explicitly scoped to `packages/core/src/`. This is a CLI script with no NestJS DI container; module-level `let` in this context is standard Node.js entrypoint pattern. No violation. |

All invariants PASS for the diff in scope.

---

## Test Quality

**Count**: 3 new tests added (R7, R8, R9).

### R7 — hook::WebFetch EXEMPT
- Behavior-focused: YES — tests observable exit code + absence of FAIL output, not internal data structures.
- Assertions:
  - `expect(exitCode).toBe(0)` — positive assertion (linter exits clean)
  - `expect(stdout + stderr).not.toMatch(/FAIL.*WebFetch/)` — NEGATIVE assertion present. A regression that re-introduces the FAIL would flip exitCode to 1 AND produce "FAIL.*WebFetch" output; both assertions would catch it.
- Assertion quality: STRONG — the negative assertion is exactly the robustness check required.
- Flake risk: NONE — uses tmpdir, synthetic fixture, deterministic input.

### R8 — hook::TaskList EXEMPT
- Behavior-focused: YES — mirrors R7 pattern.
- Assertions:
  - `expect(exitCode).toBe(0)`
  - `expect(stdout + stderr).not.toMatch(/FAIL.*TaskList/)` — NEGATIVE assertion present.
- Assertion quality: STRONG.
- Flake risk: NONE — same tmpdir/synthetic pattern as R7.

### R9 — Phase 9 rollup smoke (CF-25 regression guard)
- Behavior-focused: YES — tests the real-world rollup file that originally triggered CF-25.
- Assertion: `expect(exitCode).toBe(0)` with detailed error message showing stdout/stderr on failure.
- Fixture type: LIVE — reads `agent-workspace/memory/component-rollup-phase-9.md` from repo. File exists and contains WebFetch (line 23) and TaskList (line 24) rows confirmed.
- Fragility assessment: MODERATE CONCERN (not blocking). The live fixture means:
  - If phase-9 rollup is regenerated and new component rows appear with missing files, R9 would fail for reasons unrelated to CF-25. However, phase rollup files are written once per phase and are effectively immutable after phase completion. The risk is low in practice.
  - The test comment "CF-25 regression guard: contains WebFetch + TaskList" documents the intent, making future breakage diagnosable.
  - There is NO synthetic negative case (a test asserting exit 1 on a gibberish tool name) within R9 specifically — but R2 already provides that general negative case. R9's role is specifically the live smoke gate.

**Gap identified (non-blocking)**: R9 does not contain an explicit `expect(stdout + stderr).toMatch(/WebFetch/)` or similar assertion verifying the file actually covers CF-25 names. If the phase-9 rollup were somehow updated to remove those rows, R9 would still pass (trivially — fewer rows = fewer checks) without catching the regression. This is a minor test coverage gap, not a blocking issue.

**Overall test quality**: ACCEPTABLE. R7 and R8 are textbook robust regression tests with both positive and negative assertions. R9 is the expected live smoke gate; its fragility is bounded and documented.

---

## Layering

Not applicable. `scripts/utilities/citation-linter.ts` is a CLI utility, not a domain/adapter module. No NestJS imports, no `packages/core/` imports. Clean.

---

## Style & Idioms

### CF-25 inline comment (citation-linter.ts lines 9-13)
The comment block is:
```
// Claude Code built-in tool/event names — not custom scripts; exempt from missing-file check.
// Includes both hook event lifecycle names (PreToolUse, PostToolUse, SessionStart, etc.) and
// tool names that appear as the `name` field within those events (Bash, Read, WebFetch, etc.).
// CF-25 dedup: WebFetch and TaskList added v2.5 (Phase 10.2) — these are built-in Claude Code
// tool names that appear in component-rollup telemetry as hook rows but have no scripts/hooks/ file.
```
Assessment: APPROPRIATE. Four lines explain WHY (the distinction between hook-lifecycle names and tool names appearing in telemetry, and the specific CF root cause). This is exactly the kind of comment coding-principles endorses — explains the non-obvious invariant, not the trivial "what". Not bloated.

### BUILTIN_HOOK_EVENTS Set ordering
Existing entries are on two lines (line 15-17). New entries `WebFetch` and `TaskList` are appended on a separate line 17, after `PreToolUse` and `PostToolUse`. The set has no explicit declared ordering requirement, but the grouping slightly breaks the implicit pattern where PostToolUse ended the event-lifecycle section. Minor cosmetic inconsistency — the old entries mix tool names (`Bash`, `Read`, `Write`, etc.) and lifecycle names (`SessionStart`, `SessionEnd`, `Stop`, `PreToolUse`, `PostToolUse`) with no clear internal sort; `WebFetch` and `TaskList` at the end is no worse than the existing unsorted mix. Nitpick only.

---

## Attestation Quality (cf-dogfood-5-7-elided.md)

- Concrete search performed: YES. Five distinct search operations are enumerated with explicit file patterns and results: `sessions/2026-04-27-task-8.5.4-*.md` (zero files), `phase-9-complete.md §4`, `phase-9-routing-brief.md §4`, `phase-8-complete.md`, plus a grep for "DOGFOOD-5"/"DOGFOOD-7" across all observations/sessions returning 9 files. This satisfies the "concrete search" bar.
- DEFER-V2.6 disposition: UNAMBIGUOUS. The table is explicit; the pre-authorization chain cites four distinct authorizing documents with verbatim section references. No hedge wording beyond "if" in conditional clauses that correctly describe the decision tree ("if concrete description NOT found; deferral is correct").
- Escalation check: PRESENT and reasoned. All surviving records use "minor/cosmetic"; no escalation is warranted.

Attestation quality: ADEQUATE. The document does what the task spec requires.

---

## Findings

### Blocking (must fix)
None.

### Important (should fix)
None.

### Nitpicks (document, not blocking)

1. **R9 missing pin assertion** — `tests/scripts/citation-linter-rollup.spec.ts:146` — R9 asserts `exitCode === 0` against the live phase-9 rollup but does not assert that WebFetch or TaskList actually appear in the tested file. If the rollup is ever regenerated without those rows, R9 silently loses its CF-25 regression value. Suggested (not required): add `expect(readFileSync(phase9Path,'utf8')).toMatch(/WebFetch/)` precondition guard.

2. **BUILTIN_HOOK_EVENTS ordering cosmetic** — `scripts/utilities/citation-linter.ts:17` — `WebFetch` and `TaskList` land after `PostToolUse` on a separate line with no grouping comment. Not wrong, but mildly inconsistent with an implicit "lifecycle names" cluster. Future maintainers may not immediately see why WebFetch appears after event-lifecycle names.

---

## Next Action
APPROVED → merge (orchestrator proceeds)

