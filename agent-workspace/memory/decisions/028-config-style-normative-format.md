---
id: 028
title: Config-style normative format for `.claude/{agents,skills,commands,hooks}` artifacts
status: ratified
date: 2026-04-27
phase: 8 (substage 8.0.3)
authoring_agent: master-planner (opus 4.7, /effort max, ORCH_SPAWNED, session #40)
authority: master plan §10 D-I + research outputs 8.0.1 (drift inventory) + 8.0.2 (OSS patterns)
addresses_questions: [Q1, Q2, Q3, Q4, Q6, Q7]
---

# Decision 028 — Config-style normative format

## Context

Phase 8 Dimension 1 (user brief §1.1) names "rules / format / structure unclear in `.claude/`" as the most leveraged drift. Substage 8.0.1 quantified it: project weighted drift score 59/100, with skills directory at 72/100 and commands at 68/100 (drift inventory §1, lines 22-29). Five drift patterns surfaced (drift inventory §1, lines 14-18):

1. Frontmatter key split: agents `tools` vs skills `allowed-tools` across 24 files (CC-1, lines 197-198).
2. `model` field absent in 13 skills + 9 commands; only 11 agents declare it (D-S1, line 87; line 16).
3. Spawned-Session Handling coverage inverted: 9/11 agents, 4/9 commands, 0/13 skills (CC-2, lines 200-201).
4. 5/9 commands have NO YAML frontmatter (D-C1, line 120).
5. Description semantics diverge by artifact type (CC-4, lines 206-207).

Plus two structural pathologies (CC-3, lines 203-204; CC-5, lines 209-210):
- Post-incident bolt-on appended AFTER terminal Spawned section in `sandwich-architect.md` (Mandate A-E, 36 LOC) and `session-end.md` (Step 9 Escalation Sentinel).
- No LOC ceiling discipline anywhere — telemetry-analyst 202 LOC, sandwich-verifier 186 LOC, session-end 180 LOC; files grow by accretion.

Substage 8.1 cannot ship a linter (`scripts/audit/config-style-lint.ts`) until the normative format is ratified. Master plan §10 D-I pre-bound the default; this decision formalizes it with the concrete schema needed by 8.1.1 architect.

## Options considered

### Option A — Per-artifact-type frontmatter schema with one canonical key per concept; mandatory section ordering; LOC ceilings; post-incident integrate-into-Process rule

Pros:
- Eliminates the dual-key drift (CC-1) by picking one key per concept (`tools` for tool-list since it matches the agent-frontmatter convention used by `code-quality-reviewer.md` line 39 and validated by Claude Code native schema).
- Closes the model-field omission (D-S1, D-A1) by extending `model` declaration to skills + commands as a routing source-of-truth.
- Forces Spawned-Session Handling section coverage (CC-2) to follow ORCH_SPAWNED-applicability rules — required where the artifact branches on the env var.
- Caps growth by LOC ceiling (drift inventory §9 Q3 line 236 suggests 200/150/120; we adopt those).
- Makes post-incident additions integrate into Process phases (Q3, line 235), preventing terminal-section drift.
- Linter (8.1.2) has a clear rule set to encode.

Cons:
- Requires migration of 24 files (all agents to keep `tools`, all skills to migrate from `allowed-tools` → `tools`); migration is mechanical and lint-driven (8.1.3 effort=low per master plan §11).
- Adds a `model` field to 22 files (13 skills + 9 commands) that previously had none — small frontmatter addition, no body change required.

ACCEPTED. This is the master plan §10 D-I default extended with concrete details from 8.0.1.

### Option B — Keep two parallel keys (`tools` for agents, `allowed-tools` for skills); leave `model` agent-only; require Spawned-Session Handling on agents only

Pros:
- Zero migration cost.
- Preserves Claude Code's apparent dual convention (agents schemastore uses `tools`; some skill examples use `allowed-tools`).

Cons:
- Drift inventory §1 finding #1 (line 14) explicitly flags this as the #1 pattern to resolve. Keeping it institutionalizes the drift instead of fixing it.
- Linter must encode two parallel schemas → CC-1 (line 198) "any harness automation must handle both keys separately" — exactly what 8.1.2 is meant to prevent.
- Q1 (line 230) requires "the style guide MUST declare ONE canonical key and prohibit the other" — this option violates the brief.

REJECTED. Defers the drift instead of paying it down.

### Option C — Migrate everything to `allowed-tools` instead of `tools`

Pros:
- 11 agent files migrate (less than 13 skills).
- `allowed-tools` is more explicit about semantics ("these are the tools the agent is allowed to use") than `tools` (could be read as "these are the tools the agent uses").

Cons:
- `tools` is the Claude Code native frontmatter key per .claude/agents/*.md schemastore convention (drift inventory §1 line 14; mentioned in Q1 line 230 as "current agent convention, likely matching Claude Code native schema"). Migrating away from the native key risks Claude Code itself silently ignoring our skill frontmatter in a future version.
- All 11 agents currently work; flipping their key invalidates a working surface.

REJECTED. `tools` is the native key.

## Choice

**Option A.** Single normative format per artifact type with canonical keys, mandatory sections, LOC ceilings, and integrate-into-Process rule for post-incident additions.

### Frontmatter shape per artifact type

| Artifact | Required frontmatter keys | Optional |
|---|---|---|
| `.claude/agents/*.md` | `name`, `description`, `model`, `tools` | `archetype` (always = `agent`) |
| `.claude/skills/*/SKILL.md` | `name`, `description`, `tools`, `archetype` (= `discipline` or `reference`), `model` | none |
| `.claude/commands/*.md` | `name`, `description`, `tools` | `model` (only if command directly invokes a model tier; else omit) |
| `.claude/hooks/profiles/*.md` | `name`, `description`, `profile` (= `minimal`/`standard`/`strict`) | none |

Rules:
1. Canonical tool-list key is **`tools`** (agent-native convention; resolves Q1). All 13 skills migrate from `allowed-tools` → `tools` in 8.1.3.
2. `model` field is **required on agents and discipline-skills**, **optional on reference-skills and commands**. Discipline-skills carry behavioral guards that imply tier (e.g., `confusion-protocol` — opus); reference-skills are pure knowledge retrieval (tier-agnostic). Resolves the model-absent anomaly (Q6).
3. `archetype` field is **required on skills** (`discipline` or `reference`) — resolves D-S3 dual-archetype-undeclared finding (drift inventory line 91-94). Establishes first-class taxonomy.
4. **No frontmatter** on a `.claude/commands/*.md` file = lint violation. All 9 commands migrate (D-C1; resolves Q4).
5. Frontmatter `model` value MUST match body text references; if body says "Why opus" the frontmatter MUST be `model: opus`. The harness-audit linter greps `opus` and `sonnet` strings inside any file with a `model:` declaration and flags mismatch as a critical drift violation (resolves Q6, drift inventory line 244-245). This catches the `telemetry-analyst.md` D-A1 contradiction (drift inventory line 53).

### Section ordering (canonical, top-to-bottom)

For agents and discipline-skills:
1. `## Persona` or `## When to use` (1 short paragraph or bullet list)
2. `## Invocation Context` / `## Trigger`
3. `## Process` (numbered steps; bolt-ons integrate HERE, not appended later — resolves Q3 + CC-3)
4. `## Output` (mandatory — closes D-S4 absence in 10/13 skills)
5. `## Constraints` / `## Do NOT`
6. `## Spawned-Session Handling` (terminal — must be the last H2 in the file — resolves Q2)

For reference-skills:
1. `## When to use`
2. `## Reference Index`
3. `## Quick Reference`
4. `## Anti-Patterns`

For commands:
1. (frontmatter — mandatory)
2. `## Steps` (numbered H3 sub-headings; consistent hierarchy — resolves D-C4)
3. `## Spawned-Session Handling` (terminal; full YAML output block — uses context-restore.md / context-save.md / harness-audit.md as exemplars; resolves D-C2)

For hook profiles:
1. `## When to use`
2. `## When NOT to use`
3. `## Events covered`
4. `## Wire example` (jsonc; minimum 1 block)

### LOC budget per file type (body LOC, excludes frontmatter)

| Artifact | Soft target | Hard ceiling |
|---|---|---|
| `.claude/agents/*.md` | 150 | 200 |
| `.claude/skills/*/SKILL.md` (discipline) | 120 | 150 |
| `.claude/skills/*/SKILL.md` (reference) | 80 | 120 |
| `.claude/commands/*.md` | 90 | 120 |
| `.claude/hooks/profiles/*.md` | 50 | 80 |

Source: distribution observed in drift inventory §2-§5 (lines 39-49, 70-83, 107-117, 138-141). Files currently over ceiling (`telemetry-analyst.md` 202, `sandwich-verifier.md` 186, `session-end.md` 180) get split or trimmed in 8.1.3.

### `.test.md` sibling fixtures (D-A4, D-S5)

Canonical location: **same directory as the artifact**, named `<artifact-base>.test.md`. Resolves D-A4 (`telemetry-analyst.test.md` already in `agents/`) — that is the canonical pattern; the 13 skill `.test.md` siblings (drift inventory line 98) are also canonical. The convention is now **documented**, not undocumented; the linter (8.1.2) verifies presence-or-explicit-opt-out via frontmatter `test: none` (no test sibling allowed for self-evident artifacts like simple reference skills).

### Spawned-Session-Handling coverage rule (resolves Q2, D-S2, CC-2)

Required when:
- Artifact body contains the string `ORCH_SPAWNED` (any branching on the env var implies the artifact must declare its spawned behavior).
- Artifact is dispatched by master-planner / sandwich-architect / sandwich-dev / task-implementer (these are the agents that run under spawned mode in the queue dispatcher).

Optional when:
- Pure reference-skill that does not branch on `ORCH_SPAWNED`.

Result: 0/13 skills currently have it, but only 7 (the discipline archetype, drift inventory line 93) plus `spawned-session-mode/SKILL.md` need it. 8 skills + 5 commands need the section added in 8.1.3.

### Post-incident bolt-on rule (resolves Q3, CC-3)

When operational incident produces a new constraint:
1. Identify the canonical `## Process` step where it belongs.
2. INTEGRATE the new constraint into that step (sub-bullet or new numbered step).
3. NEVER append a Mandate / Annotation / Bolt-on block AFTER the terminal `## Spawned-Session Handling` section.

The 36-LOC Mandate A-E block in `sandwich-architect.md` (drift inventory line 42, 55) gets dissolved into Process phases 2 + 4 + 5 in 8.1.3. Same for `session-end.md` Step 9 (drift inventory line 124).

### "Decomposition Cost Model" / Mandate A-E bolt-ons in master-planner.md / sandwich-architect.md

Decision: **fold into normative Process phases**, NOT keep as appendix. Rationale: drift inventory CC-3 (line 203-204) identifies this as a systemic authoring anti-pattern. Keeping it as appendix institutionalizes the bolt-on habit. 8.1.3 dissolves these blocks into the relevant Process phase steps with cross-references back to the originating decision file (021, 026, 027 etc.) for audit trail.

### `Write(.claude/**)` permission (resolves Q7)

NARROW the allow rule. Decision:
- KEEP: `Write(.claude/skills/**)`, `Write(.claude/settings.json)` (skills evolve; settings.json is the wiring source-of-truth).
- ADD DENY: `Write(.claude/agents/**)`, `Write(.claude/commands/**)`, `Write(.claude/hooks/profiles/**)`.
- Self-modification of agent / command / hook profile definitions requires explicit user opt-in via `settings.local.json` per-session override.

This guards against silent self-modification drift (drift inventory line 247-248). 8.1.3 implements the settings.json change.

## Why (Charter rules + Karpathy + Master plan §10)

- **Charter Principle 8 (Reusable without forking)**: a clear normative format is a precondition for community fork-and-extend. Drift score 59/100 today blocks community readiness (DIM 7 / SC-46).
- **Charter §"Craft Philosophy"**: "Production-grade engineering standards from Day 1" — config files are the project's spec; spec drift is craft drift.
- **Karpathy P2 (Simplicity First)**: one canonical key, one section order, one LOC ceiling per type. Two parallel conventions (Option B) is twice the spec for zero added value.
- **Karpathy P3 (Surgical Changes)**: the linter (8.1.2) makes the normative format enforceable surgically — one rule violated = one fix; no "improve everything" rewrites.
- **Master plan §10 D-I**: pre-bound default = "frontmatter-required + section-ordering enforced + max-LOC budget per file type". This decision concretizes that default with the schema details surfaced by 8.0.1.
- **Research output 8.0.1**:
  - line 14 (drift pattern #1, dual-key split) → resolved by canonical `tools`.
  - line 16 (model-field absent) → resolved by required-on-agents+discipline-skills.
  - line 53 (D-A1 telemetry-analyst contradiction) → resolved by linter rule grep.
  - line 89-94 (D-S2, D-S3 archetype) → resolved by mandatory `archetype` frontmatter.
  - line 120 (D-C1 commands no frontmatter) → resolved by frontmatter mandate.
  - line 203 (CC-3 bolt-on pattern) → resolved by integrate-into-Process rule.
  - line 247-248 (Q7 Write permission narrowing) → resolved by deny rule for agents/commands/hooks.
- **Research output 8.0.2**:
  - line 32-39 (Claude Code 4-scope merge) → consistent with our settings.json layering; resolves into 8.7.1's config-layering doc, not this one.
  - line 184 (R-3 Zod schema validation) → adopted as the linter's parser approach in 8.1.2.

## Consequences (binding)

1. **All 13 skills migrate `allowed-tools` → `tools`** in 8.1.3. Mechanical search-and-replace; lint-driven.
2. **`model` field added to 7 discipline-skills** (brainstorming, confusion-protocol, research-first, spawned-session-mode, subagent-driven-development, systematic-debugging, verification-before-completion) per archetype rule. Reference-skills and commands keep `model` optional.
3. **`archetype` frontmatter mandatory on all 13 skills** in 8.1.3. Resolves D-S3 dual-archetype-undeclared (drift inventory line 91-94).
4. **All 9 commands gain frontmatter** (`name`, `description`, `tools` minimum) in 8.1.3. The 5 currently bare commands (budget-check, invariant-check, phase-advance, research-study, session-end, session-start — drift inventory line 120) are migrated.
5. **Section ordering enforced by linter**; the ~5 files with bolt-on blocks AFTER `## Spawned-Session Handling` (sandwich-architect Mandate A-E; session-end Step 9; any others surfaced) are restructured in 8.1.3. Bolt-ons integrate into the canonical Process phase, not appended.
6. **LOC ceiling enforced by linter**; files over ceiling (telemetry-analyst 202, sandwich-verifier 186, session-end 180) split or trim. Hard ceiling = lint error; soft target = lint warning.
7. **Spawned-Session-Handling section coverage**: 8 skills + 5 commands gain the section in 8.1.3 per the applicability rule. Skills that do not branch on `ORCH_SPAWNED` are exempt.
8. **`telemetry-analyst.md` D-A1 contradiction** resolved as part of 8.1.3: frontmatter is the source-of-truth, body matches frontmatter. Cross-references Decision 021 § Action — 021 already specifies `model: sonnet`; body text gets edited to match.
9. **`Write(.claude/agents/**)` etc. denied in settings.json** in 8.1.3 to prevent silent self-modification (resolves Q7).
10. **Linter (8.1.2) becomes the enforcement gate**. SC-40 deterministic check: `node scripts/audit/config-style-lint.ts --strict` exit 0. Enforces 1-9 above.
11. **Migration done in single substage 8.1.3** (effort=low per master plan §11) — file edits are mechanical and lint-driven; no architectural decisions remain after this decision file ratifies.
12. **Zod schemas** (per 8.0.2 R-3, line 184) parse each frontmatter at lint time; type errors fail-fast.

## Cross-references

- Master plan §10 D-I (line 275-276)
- Master plan §3 substage 8.1 (lines 91-99)
- Master plan §11 effort matrix (lines 280-317): 8.1.1 architect=opus/max, 8.1.2 lint impl=sonnet/medium, 8.1.3 remediate=sonnet/low
- Research output `agent-workspace/research/phase-8-config-drift-inventory.md` (cited lines 14-29, 53, 87-99, 120-128, 197-210, 230-248)
- Research output `agent-workspace/research/phase-8-oss-config-patterns.md` (lines 32-39 layering context, 184 Zod adoption)
- Decision 021 (telemetry-analyst tier sonnet — referenced for the D-A1 fix)
- Decision 026 (CF-21 tool_use_id correlation — referenced as carryforward fold-in 8.4.2)
- Decision 027 (Phase 8 strategic redirect — Consequences 1, 6 binding)
- Charter §"Craft Philosophy" (line 39-47)
- Charter Principle 8 "Reusable without forking" (line 67)
- Karpathy P2/P3 (CLAUDE.md Core Principles)

**END Decision 028.**
