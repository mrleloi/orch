# Phase 5.2 Turn 3 + Turn 4 Brief Drafts (pre-staged 2026-04-27)

> Pre-written while Turn 2 (5.2.2 || 5.2.3 || 5.2.4) runs in background.
> On Turn 2 all-return + INV-S grep clean + tests:hooks ≥31 + tests baseline + tsc clean →
> dispatch Turn 3 = 5.2.5 || 5.2.6 in parallel using briefs below.
> On Turn 3 return → dispatch Turn 4 = 5.2.7 alone (serializes — depends on validator + refactored tree).
> Architect doc canonical ref: `agent-workspace/session-plans/pending/5.2-skill-evolution-architect.md` §3.4 (5.2.5), §3.5 (5.2.6), §3.6 (5.2.7).

---

## Turn 3 — 5.2.5 brief (parallel with 5.2.6)

**Subagent**: `task-implementer` (sonnet, run_in_background=true)
**Description**: 5.2.5 SKILL.md refactor set #1 (otel/prisma/profile)

```
You are executing Phase 5.2 Task 5.2.5 — Refactor SKILL.md Set #1: otel-tracing, prisma-sqlite, profile-yaml. Closes SC-5 (3/6 oversized skills). Working dir: C:\htdocs\orch-starter.

## Required reading

1. agent-workspace/session-plans/pending/5.2-skill-evolution-architect.md §3.4 (lines 478–542); §6 INV-S1..S10.
2. .claude/skills/otel-tracing/SKILL.md (read fully — current 350L, will trim to ≤150L).
3. .claude/skills/prisma-sqlite/SKILL.md (current 278L → ≤150L).
4. .claude/skills/profile-yaml/SKILL.md (current 270L → ≤150L).
5. CLAUDE.md Hard Rules.

## Deliverables (per architect §3.4.A — 12 NEW reference files + 3 trimmed SKILL.md)

For EACH of the 3 skills (otel-tracing, prisma-sqlite, profile-yaml):
- MODIFY SKILL.md → ≤150 lines. Preserve YAML frontmatter (ADD `allowed-tools` field — see mapping below). Keep `## When to Use`, ## Reference Index TABLE pointing to references/ files, brief ≤30L cheatsheet of most common pattern. Move everything else to references/.
- NEW references/<topic>.md files per architect §3.4.A table:
  - otel-tracing: spans.md, config.md, exporters.md, propagation.md
  - prisma-sqlite: schema-patterns.md, wal.md, repository-pattern.md, migrations.md
  - profile-yaml: parsing.md, cross-field-validation.md, hot-reload.md, secrets-and-interactive.md

ALSO: tests/scripts/skills-refactor-set1.spec.ts — vitest with the 8 cases in architect §3.4.D table.

## allowed-tools mapping (per 5.2.7, add NOW to frontmatter)

- otel-tracing: `[Read, Bash, Grep, Edit]`
- prisma-sqlite: `[Read, Bash, Grep, Edit]`
- profile-yaml: `[Read, Bash, Edit]`

(Architect §3.4.C bullet 5 says otel = `[Read, Bash, Grep]` but §3.6 line 592 — the canonical 5.2.7 mapping — says `[Read, Bash, Grep, Edit]`. Use the §3.6 mapping; document the diff in your session log.)

## Behavior contract (architect §3.4.C — bind)

1. New SKILL.md preserves: frontmatter (with allowed-tools added), ## When to Use, ## Reference Index TABLE pointing to references/, brief ≤30L cheatsheet. Everything else moves to references/.
2. Each references/<topic>.md starts with H1 `# <Topic Title>` and contains lifted content verbatim — NO semantic loss.
3. Content-preservation check: `wc -l` of (new SKILL.md + all new references/*.md) ≥ ORIGINAL SKILL.md `wc -l`.
4. SKILL.md table format MUST be:
   ```
   ## Reference Index
   | Topic | File | When to read |
   |-------|------|--------------|
   | <Topic> | `references/<file>.md` | <when> |
   ```

## INV bindings

- INV-S4: Refactored SKILL.md ≤150 lines AND keeps all original semantic content (moved to references/). Verify per skill.
- INV-S6: NO `git commit`.
- INV-S8: NO `.claude/agents/` edits.

## Acceptance harness

1. `wc -l .claude/skills/{otel-tracing,prisma-sqlite,profile-yaml}/SKILL.md` → all ≤150.
2. Content-preservation: sum new files ≥ original line counts (350, 278, 270).
3. Each table reference file exists: `for r in $(grep references/ SKILL.md | awk -F'`' '{print $2}'); do test -f $r; done` per skill.
4. `pnpm skills:validate --root .claude/skills` exit 0 (oversize-body errors === 0 for these 3).
5. `pnpm vitest run tests/scripts/skills-refactor-set1.spec.ts` all 8 cases pass.
6. `pnpm test:hooks` baseline preserved (still 31+).

## Atomic session log

Path: `agent-workspace/memory/sessions/2026-04-27-task-5.2.5-skill-refactor-set1.md`. Include: line counts before/after per skill, allowed-tools mapping diff vs §3.4.C, INV-S4 verification.

## Output — structured YAML completion block

```yaml
---
status: DONE | DONE_WITH_CONCERNS | BLOCKED
produced_files: [...]
line_counts:
  otel-tracing: { before: 350, after: <N> }
  prisma-sqlite: { before: 278, after: <N> }
  profile-yaml: { before: 270, after: <N> }
content_preservation:
  otel-tracing: { sum: <N>, baseline: 350, pass: true|false }
  prisma-sqlite: ...
  profile-yaml: ...
gate_results:
  validator_exit: <0|1>
  vitest: PASS|FAIL
inv_check:
  INV-S4: PASS
  INV-S6: PASS
  INV-S8: PASS
session_log: ...
deviations: <or "none">
next_action: { command: "ready for 5.2.7 allowed-tools serialization", args: {} }
---
```

Hard constraints: cannot ask user; I-6 NO git commit; pnpm pkg set for any package.json mutations.
```

---

## Turn 3 — 5.2.6 brief (parallel with 5.2.5)

Same shape as 5.2.5 but for 3 different skills:
- grammy-bot: 275L → ≤150L; refs = bot-setup.md, middleware.md, handlers.md, notifications-and-testing.md
- nestjs-module: 249L → ≤150L; refs = module-template.md, adapter-pattern.md, cross-module-comm.md, lifecycle-and-testing.md
- claude-code-hooks: 251L → ≤150L; refs = hook-types.md, settings-snippets.md, payload-handling.md, testing-and-failures.md

allowed-tools (per §3.6 line 590–591, 595):
- grammy-bot: `[Read, Bash, Grep, Edit]`
- nestjs-module: `[Read, Bash, Grep, Edit]`
- claude-code-hooks: `[Read, Bash, Grep, Edit]`

Tests file: `tests/scripts/skills-refactor-set2.spec.ts` (mirror of set1 with 275/249/251 baselines).

Session log: `agent-workspace/memory/sessions/2026-04-27-task-5.2.6-skill-refactor-set2.md`.

(Otherwise identical brief — copy 5.2.5 brief, swap skill names, refs list, and baselines.)

---

## Turn 4 — 5.2.7 brief (alone, after Turn 3 returns)

**Subagent**: `task-implementer` (sonnet, run_in_background=true)

Reads §3.6 (lines 575–642). Adds `allowed-tools` to frontmatter of remaining 7 skills (brainstorming, confusion-protocol, research-first, spawned-session-mode, subagent-driven-development, systematic-debugging, verification-before-completion); the other 6 get it via Turn 3 refactors.

Mapping (§3.6 verbatim):
- brainstorming: `[Read]`
- confusion-protocol: `[Read, Write]`
- research-first: `[Read, Bash, WebFetch, Glob, Grep]`
- spawned-session-mode: `[Read, Write]`
- subagent-driven-development: `[Read, Task, Bash]`
- systematic-debugging: `[Read, Bash, Grep, Edit]`
- verification-before-completion: `[Bash, Read, Grep]`

ALSO modifies:
- `scripts/skills-validate.ts` flip `requireAllowedTools: true` (now mandatory)
- `tests/scripts/skills-validate.spec.ts` test #7 → ERROR (was WARNING)

Acceptance:
- All 13 skills have `allowed-tools` field.
- `pnpm skills:validate` exits 0 with `requireAllowedTools: true`.
- `requireSiblingTest: false` STILL (5.2.8 flips it).

INV: S6, S8 hold.

---

## Turn 5 — 5.2.8 MULTI_TASK_IMPL preview

13 fresh-context dispatches per skill, batched per architect §8 (4 discipline + 3 workflow + 3 refactored + 3 integration). Each produces ONE `<name>.test.md` per architect §3.7.B template. Final flip: `requireSiblingTest: true`. Will sandwich-architect this when Turn 4 returns.
