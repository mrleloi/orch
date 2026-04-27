---
title: Config Style Guide
status: normative
ratified_by: Decision 028 (2026-04-27)
applies_to: .claude/{agents,skills,commands,hooks/profiles}, .claude/settings.json
linter: scripts/audit/config-style-lint.ts
phase: 8 (substage 8.1.1)
authoring_agent: sandwich-architect (opus, /effort max, ORCH_SPAWNED)
---

# Config Style Guide

> Normative format for `.claude/*` configuration files. Linter at `scripts/audit/config-style-lint.ts` enforces this guide. Decision 028 binds this document; line-level citations into `agent-workspace/memory/decisions/028-config-style-normative-format.md` anchor each rule.

## §1 Purpose & Scope

This guide governs the format, frontmatter schema, section ordering, naming conventions, and LOC budgets for every file under `.claude/agents/`, `.claude/skills/*/`, `.claude/commands/`, `.claude/hooks/profiles/`, plus `.claude/settings.json`. Sibling `.test.md` fixtures (e.g., `telemetry-analyst.test.md`) are also in scope.

This guide does NOT govern: `agent-workspace/**` (memory, decisions, research, traces — those have their own conventions), `packages/**` source code, project-level docs (`README.md`, `CHANGELOG.md`, etc.), or hooks `.sh` scripts at `scripts/hooks/` (separate scope; behavior governed by hook profile docs).

Conformance levels:

- **REQUIRED** — Linter exit code is non-zero on violation. Blocks merge.
- **RECOMMENDED** — Linter emits a warning; non-blocking but tracked.
- **OPTIONAL** — Author discretion; not lint-checked.

Per Decision 028 §"Choice" (line 75) the canonical normative format is single-shape-per-artifact; parallel conventions are explicitly rejected (Option B REJECTED, line 59).

## §2 File-type taxonomy

Five normative file-types under this guide, plus one sibling fixture type:

| # | File-type | Glob | Example | Decision-028 anchor |
|---|---|---|---|---|
| 1 | `agent` | `.claude/agents/*.md` (excluding `*.test.md`) | `master-planner.md` | line 81 |
| 2 | `skill` | `.claude/skills/*/SKILL.md` | `confusion-protocol/SKILL.md` | line 82 |
| 3 | `command` | `.claude/commands/*.md` | `context-save.md` | line 83 |
| 4 | `hook-profile` | `.claude/hooks/profiles/*.md` (excluding `README.md`) | `strict.md` | line 84 |
| 5 | `settings` | `.claude/settings.json` | (single canonical file) | (settings.json — implements all hook wiring) |
| 6 | `test-fixture` | `.claude/{agents,skills/*}/*.test.md` | `telemetry-analyst.test.md` | line 132-134 |

Skills additionally split into two `archetype` sub-types per Decision 028 line 89:

- `discipline` — behavioral skills with Red Flags + Rationalization Counters + Spawned-session-mode (e.g., `confusion-protocol`, `brainstorming`, `verification-before-completion`).
- `reference` — pure technical knowledge retrieval with Reference Index + Quick Reference + Anti-Patterns (e.g., `grammy-bot`, `prisma-sqlite`, `otel-tracing`).

The seven discipline-skills and six reference-skills are enumerated in Decision 028 Consequences §2 (line 191).

## §3 Frontmatter schema (per file-type)

Frontmatter is a YAML block delimited by `---` at the top of the file. Field order within the block is OPTIONAL but RECOMMENDED to follow the order in each table below. All keys MUST be kebab-case (per §6).

### §3.1 Agent (.claude/agents/*.md)

Anchored in Decision 028 line 81 (frontmatter shape table) and lines 87-92 (rules 1-5).

| Field | Required | Type | Example | Validator (LR-NN) |
|---|---|---|---|---|
| `name` | YES | kebab-case string | `master-planner` | matches filename stem; LR-07 |
| `description` | YES | single-line string ≤300 char | `Use when ...` | starts with imperative verb or "Use when"; LR-12 |
| `model` | YES | enum {`opus`, `sonnet`, `haiku`} | `opus` | one of allowed values; LR-01 |
| `tools` | YES | YAML array of tool names | `[Read, Glob, Grep, Write]` | non-empty; valid Claude Code tool names; LR-02 |
| `archetype` | OPTIONAL | const `agent` | `agent` | if present, MUST equal `agent`; LR-13 |
| `proactive` | OPTIONAL | boolean | `true` | — |

Forbidden keys: `allowed-tools` (use `tools` per Decision 028 line 87 — Option C REJECTED line 71). LR-02 fires.

Body-vs-frontmatter contradiction guard (Decision 028 line 91, resolves D-A1 telemetry-analyst contradiction): if body contains literal text `Why opus` or `Why sonnet`, the frontmatter `model` MUST match. LR-09.

### §3.2 Skill — discipline (.claude/skills/*/SKILL.md, archetype: discipline)

Anchored in Decision 028 line 82 + line 88 (model required on discipline-skills) + line 89 (archetype required) + line 134 (test-sibling convention).

| Field | Required | Type | Example | Validator |
|---|---|---|---|---|
| `name` | YES | kebab-case string | `confusion-protocol` | matches parent dirname; LR-07 |
| `description` | YES | single-line string ≤300 char | `Use the moment ...` | starts with imperative verb or "Use ..."; LR-12 |
| `tools` | YES | YAML array | `[Read, Write]` | LR-02 |
| `archetype` | YES | const `discipline` | `discipline` | one of {discipline, reference}; LR-13 |
| `model` | YES | enum {`opus`, `sonnet`, `haiku`} | `opus` | LR-01 |
| `test` | OPTIONAL | const `none` or path | `none` | if absent, sibling `<name>.test.md` SHOULD exist (LR-14 WARN) |

Forbidden keys: `allowed-tools` (LR-02; Decision 028 line 87 — all 13 skills migrate from `allowed-tools` to `tools` per Consequences §1 line 190).

The seven discipline-skills enumerated by Decision 028 line 191: `brainstorming`, `confusion-protocol`, `research-first`, `spawned-session-mode`, `subagent-driven-development`, `systematic-debugging`, `verification-before-completion`.

### §3.3 Skill — reference (.claude/skills/*/SKILL.md, archetype: reference)

Anchored in Decision 028 line 88 (model OPTIONAL on reference-skills — tier-agnostic knowledge retrieval).

| Field | Required | Type | Example | Validator |
|---|---|---|---|---|
| `name` | YES | kebab-case string | `grammy-bot` | matches parent dirname; LR-07 |
| `description` | YES | single-line string ≤300 char | `Use when creating ...` | LR-12 |
| `tools` | YES | YAML array | `[Read, Bash, Grep, Edit]` | LR-02 |
| `archetype` | YES | const `reference` | `reference` | LR-13 |
| `model` | OPTIONAL | enum | (omit) | tier-agnostic; if present, must be valid enum (LR-01) |
| `test` | OPTIONAL | `none` \| path | `none` | LR-14 |

The six reference-skills enumerated by drift inventory §3 (lines 122-126): `grammy-bot`, `nestjs-module`, `otel-tracing`, `prisma-sqlite`, `profile-yaml`, `claude-code-hooks`.

### §3.4 Command (.claude/commands/*.md)

Anchored in Decision 028 line 83 (frontmatter shape) + line 90 (NO-frontmatter is lint violation; resolves Q4) + Consequences §4 line 193 (5 currently-bare commands migrate).

| Field | Required | Type | Example | Validator |
|---|---|---|---|---|
| `name` | YES | kebab-case string | `context-save` | matches filename stem; LR-07 |
| `description` | YES | single-line string ≤300 char | `Save a mid-session checkpoint ...` | LR-12 |
| `tools` | YES | YAML array | `[Read, Write, Bash]` | LR-02 |
| `model` | OPTIONAL | enum | `sonnet` | only if command directly invokes a tier (Decision 028 line 83); else omit |

The five bare commands requiring frontmatter migration (drift inventory §4 line 165-175): `session-start`, `session-end`, `phase-advance`, `budget-check`, `invariant-check`, `research-study`. The three commands with description-only frontmatter (`context-save`, `context-restore`, `harness-audit`) gain `name` + `tools`.

### §3.5 Hook-profile (.claude/hooks/profiles/*.md)

Anchored in Decision 028 line 84.

| Field | Required | Type | Example | Validator |
|---|---|---|---|---|
| `name` | YES | kebab-case string | `strict` | matches filename stem; LR-07 |
| `description` | YES | single-line string ≤300 char | `Strict profile for autonomous mode ...` | LR-12 |
| `profile` | YES | enum {`minimal`, `standard`, `strict`} | `strict` | one of three canonical values; LR-15 |

Profile docs currently have NO frontmatter (drift inventory §5 line 212). Migration in 8.1.3 adds the three fields above.

### §3.6 Settings (.claude/settings.json)

The settings file is JSON, not Markdown. Frontmatter is N/A; conventions covered in §9.

### §3.7 Test-fixture (sibling .test.md)

Anchored in Decision 028 line 132-134. Test fixtures are documentation of expected behavior, not executable.

| Field | Required | Type | Example | Validator |
|---|---|---|---|---|
| (none) | — | — | — | frontmatter OPTIONAL on `.test.md`; body MUST follow §4.6 ordering |

Frontmatter is OPTIONAL on `.test.md`. If absent, the body MUST contain H2 sections per §4.6.

## §4 Section ordering (canonical H2 sequence per file-type)

H2 ordering is REQUIRED. Linter rule LR-05 fires when the order in a file does not match the canonical sequence below.

### §4.1 Agent (.claude/agents/*.md)

Per Decision 028 lines 95-101 (canonical agent + discipline-skill section ordering):

1. `## Persona` OR `## When to use` (1 short paragraph or bullet list — establishes mindset/identity)
2. `## Invocation Context` OR `## Trigger` OR `## Responsibility` OR `## Scope Contract` (when invoked, by whom)
3. `## Input` (what the invoker supplies)
4. `## Process` — REQUIRED — numbered phases as `### Phase N:` H3s; **post-incident bolt-ons integrate HERE per Decision 028 line 98 + §10 below**
5. `## Output` — REQUIRED — what the agent returns to invoker
6. `## Constraints` (do/MUST list) — REQUIRED
7. `## Do NOT` (forbidden actions) — RECOMMENDED
8. `## Spawned Session Handling` — TERMINAL — REQUIRED if §4.5 applicability rule fires; MUST be the last H2 in the file (Decision 028 line 101)

Forbidden: any H2 AFTER `## Spawned Session Handling` (LR-06). The 36-LOC `## Mandates A/B/C/D/E` block in `sandwich-architect.md` (lines 122-157, drift inventory line 42 + 55, CC-3 systemic anti-pattern) is the canonical violation example. Remediation per Decision 028 line 154-158: bolt-ons dissolve into Process phases with cross-references to originating decision file (§10 below).

### §4.2 Skill — discipline (archetype: discipline)

Per Decision 028 lines 95-101 (shared with agents). Discipline-specific H2s appear inside Process or as standalone sections AFTER Persona, BEFORE Process:

1. `## When to invoke` (or `## When to use`)
2. `## Red Flags — STOP` — REQUIRED on discipline-skills (drift inventory line 132 — 7/7 discipline-skills have this)
3. `## Process` OR `## The Protocol` OR `## The Ritual` (numbered steps; bolt-ons integrate here)
4. `## Rationalization Counters` — REQUIRED on discipline-skills (drift inventory line 133)
5. `## Output`
6. `## Do NOT`
7. `## Spawned-session mode` — REQUIRED — TERMINAL (Decision 028 line 145 — `spawned-session-mode/SKILL.md` PLUS the 6 other discipline-skills branching on `ORCH_SPAWNED`)

H2 heading-style for spawned section on skills: `## Spawned-session mode` (lowercase, hyphen) per existing skill convention (drift inventory line 148 — `brainstorming/SKILL.md:98`). Linter normalizes to this form for skills (LR-16). Agents use `## Spawned Session Handling` (Title Case, no hyphen). The two forms are not interchangeable; LR-16 fires on cross-form usage.

### §4.3 Skill — reference (archetype: reference)

Per Decision 028 lines 103-108:

1. `## When to use` — REQUIRED
2. `## Reference Index` — REQUIRED — table mapping topic → file → "when to read" (drift inventory line 135)
3. `## Quick Reference` — REQUIRED — code snippets, templates (drift inventory line 136)
4. `## Anti-Patterns` — REQUIRED — bullet list (drift inventory line 137)

Reference-skills do NOT carry Red Flags, Rationalization Counters, or Spawned-session sections (drift inventory line 132-134). LR-17 fires if a reference-skill includes those.

### §4.4 Command (.claude/commands/*.md)

Per Decision 028 lines 110-113:

1. (frontmatter — REQUIRED per §3.4)
2. `## Purpose` OR `## When to use` OR `## When to Use` — REQUIRED
3. `## Steps` OR `## Process` — REQUIRED — numbered H3 sub-headings `### N. Step name` (drift inventory D-C4 — consistent hierarchy)
4. `## Spawned Session Handling` — TERMINAL — REQUIRED — full YAML output block per `context-save.md`/`context-restore.md`/`harness-audit.md` exemplars (Decision 028 line 113; drift inventory line 181-183)

Variants observed: `## Autonomous Mode`, `## Autonomous Usage`, `## Autonomous Mode Behavior`, `## Autonomous Mode: Proceed` (drift inventory §4 lines 184-188; 5/9 variant). All NORMALIZE to `## Spawned Session Handling` (LR-18 fires on variants).

### §4.5 Hook-profile (.claude/hooks/profiles/*.md)

Per Decision 028 lines 115-118:

1. `## When to use` — REQUIRED
2. `## When NOT to use` — REQUIRED (only `minimal.md` currently has it; drift inventory §5 line 218)
3. `## Events covered` OR `## Events handled` — REQUIRED — table format
4. `## Wire example` OR `## Wire examples` — REQUIRED — at least one `jsonc` block

Hook-profile docs MAY include `## Costs` and `## When to upgrade to <other profile>` as RECOMMENDED additions (per `strict.md` lines 53-58).

### §4.6 Test-fixture (sibling .test.md)

Per `telemetry-analyst.test.md` exemplar (lines 1-54). REQUIRED H2 sequence:

1. `## Trigger` — when this fixture applies
2. `## Expected Behavior` — what the parent artifact must do
3. `## Failure Modes` — enumerated MODE-N entries (e.g., `MODE-1: Hallucinated proposal`)
4. `## Metrics` — observable counters
5. `## Assertions` — numbered assertions, each with a deterministic check command

LR-19 fires on missing required H2.

## §5 LOC budget per file-type

LOC budgets are enforced by linter (LR-04 ERROR on hard ceiling, LR-20 WARN on soft target). LOC measured as **body LOC** — frontmatter excluded. Anchored in Decision 028 lines 122-130.

| File-type | Soft target | Hard ceiling | Rationale |
|---|---|---|---|
| `agent` | 150 | 200 | sandwich-verifier 186 LOC reference; Decision 028 line 124 |
| `skill` (discipline) | 120 | 150 | confusion-protocol 134 LOC reference; line 125 |
| `skill` (reference) | 80 | 120 | brevity over completeness; line 126 |
| `command` | 90 | 120 | invocation + brief description; line 127 |
| `hook-profile` | 50 | 80 | profile is decisive, not exhaustive; line 128 |
| `test-fixture` | 60 | 100 | (telemetry-analyst.test.md = 54 LOC reference) |

Files currently over hard ceiling (Decision 028 line 130; drift inventory §S2 line 95 + §S4 line 204):

- `telemetry-analyst.md` — 202 LOC (over 200 ceiling by 2 LOC) → trim to ≤200 in 8.1.3.
- `sandwich-verifier.md` — 186 LOC (under ceiling but at soft-target +36) → leave; under hard.
- `session-end.md` — 180 LOC (over 120 ceiling by 60 LOC) → split or trim aggressively in 8.1.3.
- `sandwich-architect.md` — currently exceeds via Mandate A-E block; remediation §10 dissolves it into Process phases, projected new LOC ≈ 175.

LOC budget rationalization counter: brevity is RECOMMENDED, but the budget exists primarily to detect **growth-by-accretion** (Decision 028 Context line 26-27 — "files grow by accretion"), not to mechanically truncate substantive content. Authors who genuinely need >hard-ceiling MUST split into a sibling file, NOT collapse content.

## §6 Naming conventions

| Surface | Rule | Example | LR |
|---|---|---|---|
| Filenames | kebab-case + `.md` | `master-planner.md`, `confusion-protocol/SKILL.md` | LR-07 |
| Sibling test fixtures | `<base>.test.md` (same dir) | `telemetry-analyst.test.md`, `confusion-protocol/SKILL.test.md` | Decision 028 line 134 |
| Frontmatter keys | kebab-case (NOT snake_case, NOT camelCase) | `archetype:` (correct), `archetypeName:` (forbidden) | LR-21 |
| Section headers | Title Case (Markdown convention) | `## Spawned Session Handling` | (style; not lint-checked) |
| Tool names in `tools:` | Match Claude Code native casing exactly | `Read`, `Glob`, `Grep`, `Write`, `Edit`, `Bash` | LR-02 |
| Internal references | relative path from repo root, optionally `:line` | `agent-workspace/constitution/architecture.md:178` | LR-08 |

## §7 Cross-references & links

| Reference type | Format | Validator |
|---|---|---|
| File reference | relative path from repo root | LR-08 — path MUST resolve to existing file |
| Symbol/line reference | backticked `path:line` | path resolves; line number numeric |
| Decision-file citation | `decisions/NNN-<slug>.md` or absolute | LR-22 — referenced decision file must exist |
| External URL | only Anthropic docs, charter, GitHub, schema.org | LR-23 WARN — links to other domains warned |
| Charter citation | `PROJECT_CHARTER.md` + section name (`§"Craft Philosophy"`) | (style; not lint-checked) |
| Self-reference within file | none required (Markdown anchors not linted) | — |

Broken cross-references are LR-08 ERROR. The linter parses Markdown link `[text](path)` and bareword `path:line` patterns inside backticks.

## §8 .test.md sibling fixtures

Anchored in Decision 028 line 132-134. Resolves D-A4 (`telemetry-analyst.test.md` already canonical) and D-S5 (skill `.test.md` siblings).

Rules:

1. **Location**: alongside the parent file, NOT in a `tests/` subdir.
   - For agents: `.claude/agents/<name>.test.md` (sibling to `.claude/agents/<name>.md`)
   - For skills: `.claude/skills/<name>/SKILL.test.md` OR `.claude/skills/<name>/<name>.test.md`
2. **Purpose**: documents trigger, expected behavior, failure modes, metrics, assertions per §4.6 H2 ordering. Consumed by `subagent-driven-development` skill and adversarial verifiers.
3. **Required structure**: §4.6 H2 sequence enforced by LR-19.
4. **Opt-out**: parent artifact MAY declare `test: none` in frontmatter (§3.2 / §3.3 / §3.4) when no behavioral test fixture is meaningful (e.g., simple reference-skills). LR-14 WARN fires when no `.test.md` sibling exists AND `test: none` is absent.
5. **Naming**: `.test.md` suffix is REQUIRED — fixtures are NOT executable Markdown; they are normative documentation. Distinct from `.spec.ts` Vitest test files.

Anti-pattern: a `.test.md` file MUST NOT contain frontmatter `model`, `tools`, etc. — it is documentation, not an agent. The current `telemetry-analyst.test.md` (drift inventory §S2 line 24, line 52) has zero frontmatter; that is the canonical pattern.

## §9 settings.json conventions

`.claude/settings.json` is the authoritative wiring source for hook events. Conventions:

### §9.1 Schema declaration (REQUIRED)

The first key MUST be `$schema` pointing to `https://json.schemastore.org/claude-code-settings.json` (current settings.json line 2). Linter LR-24 fires if absent.

### §9.2 Hook entries grouped by event (REQUIRED)

Hook entries MUST be grouped under the `hooks` object by event name: `SessionStart`, `SessionEnd`, `Stop`, `PreToolUse`, `PostToolUse`, `SubagentStop`, `PreCompact`. Within each event, entries are arrays. Each array entry MAY include a `matcher` field; entries without `matcher` are universal.

### §9.3 Comments via `_comment_*` keys

JSON does not allow `//` comments. To document a hook entry's intent inline, use a sibling key prefixed `_comment_` (or `_doc_`). Linter does not require comments but LR-25 WARNs if a hook entry has neither `_comment_*` nor a corresponding hook-profile doc reference.

### §9.4 Stale entries removal (REQUIRED)

No commented-out blocks (e.g., entries duplicated under `// disabled` keys). Stale = LR-26 ERROR.

### §9.5 SubagentStop deduplication (RECOMMENDED)

Drift inventory §S6 line 258: two `SubagentStop` entries with `matcher: ".*"` running different scripts can be consolidated into a single entry with multiple `hooks` array members. LR-27 WARN.

### §9.6 settings.local.json — machine-local overrides

`.claude/settings.local.json` overrides `settings.json` per-machine. MUST NOT contain Windows-style absolute paths in committed form (drift inventory §S6 line 261). LR-28 WARN.

### §9.7 Q5 RESOLUTION — settings.json vs hook-profile docs (canonical authority)

Drift inventory §6 Q5 left this open: which is canonical, settings.json or hook-profile markdown docs?

**RESOLVED: Option (b) — profile markdown docs are canonical for the profile's INTENT; settings.json is canonical for the profile's IMPLEMENTATION**.

Rationale:

1. Profile docs (`minimal.md`, `standard.md`, `strict.md`) are human-authored intent — they declare what events a profile *should* handle and why. This is design surface; humans reason about it.
2. settings.json is the enforcement target — Claude Code reads it directly. Profile docs cannot be read at hook-fire time.
3. Drift between intent and implementation is detected by a CI diff: `scripts/audit/profile-vs-settings-diff.sh` (planned in 8.4.7) parses both surfaces and asserts every event listed in a profile's `## Events covered` table has a corresponding entry in settings.json under the active `ORCH_HOOK_PROFILE`.
4. Drift inventory DEV-H1 (line 222-224 — `standard.md:13` says PostToolUse `No-op` while `settings.json:207-225` has two active entries) is the canonical violation; profile doc was the intent (no-op for speed), settings.json drifted.

Conformance:

- Authors EDIT profile doc first (intent change), THEN update settings.json to match.
- Linter LR-29 WARN fires when settings.json contains hook entries for a profile that the profile doc's `## Events covered` table does not list. Reverse direction (profile doc lists an event with no settings.json entry) is also LR-29 WARN — profile doc must be honest about what is wired.

This resolution defers the FULL profile-vs-settings diff to 8.4.7; this guide ratifies the directionality (intent→implementation) so 8.1.3 has a deterministic remediation order.

## §10 Mandate / bolt-on integration rule (Decision 028 line 147-158)

When an operational incident produces a new constraint and the engineer codifies it as a "Mandate" or "Annotation":

1. **Identify** the canonical Process H2 phase where the new constraint applies (Phase 1 read-input, Phase 2 design, Phase 4 verify, etc.).
2. **Integrate** the constraint as a sub-bullet within that phase's H3 — OR — add a new numbered Process phase if it represents a distinct concern.
3. **Cross-reference** the originating decision/post-mortem (e.g., `decisions/021-*.md` or `agent-workspace/memory/post-mortems/NNN-*.md`) inline at the integration point.
4. **NEVER** append a `## Mandates` / `## Annotations` / `## Bolt-ons` H2 AFTER the terminal `## Spawned Session Handling`. LR-06 fires.

The 36-LOC `## Mandates A/B/C/D/E` block in `sandwich-architect.md` (lines 122-157) is the canonical violation. Decision 028 line 154-158 mandates dissolution: Mandate A → Process Phase 4 (Test Design / Pre-write Part-C dry-run); Mandate B → Process Phase 4 sub-bullet (staged-index pre-verification); Mandate C → Process Phase 4 sub-bullet (awk-range gate self-match check); Mandate D → Process Phase 4 sub-bullet (CLI flag freshness); Mandate E → Process Phase 5 (Write Session Plan — incremental write pattern).

Linter LR-30 ERROR fires when a `## Mandates` H2 contains ≥3 mandate sub-sections — that is integration debt that MUST be paid down in the next session that touches the file. Decision 028 line 156: NEVER keep mandates as appendix. Keeping them institutionalizes the bolt-on habit (drift inventory CC-3 line 203-204).

## §11 Migration strategy (informational — used by 8.1.3 remediation)

24 files require remediation per drift inventory §1 + Decision 028 Consequences §1-§9 (lines 190-198). Recommended remediation order:

| Step | Files | Change | Effort | Lint rule |
|---|---|---|---|---|
| 1 | 13 skills | `allowed-tools` → `tools` rename | mechanical sed | LR-02 |
| 2 | 13 skills | add `archetype: discipline` or `archetype: reference` | template fill (per Decision 028 line 191) | LR-13 |
| 3 | 7 discipline-skills | add `model: opus` or `model: sonnet` per RULE-1 routing | template fill | LR-01 |
| 4 | 5 bare commands (`session-start`, `session-end`, `phase-advance`, `budget-check`, `invariant-check`, `research-study`) | add full frontmatter (`name`, `description`, `tools`) | template fill | LR-03 |
| 5 | 3 description-only commands (`context-save`, `context-restore`, `harness-audit`) | add `name` + `tools` | template fill | LR-03 |
| 6 | 8 skills + 5 commands | add `## Spawned Session Handling` / `## Spawned-session mode` per applicability rule (§4.2 / §4.4) | template + content | LR-06, LR-18 |
| 7 | 3 hook-profile docs (`minimal.md`, `standard.md`, `strict.md`) | add frontmatter (`name`, `description`, `profile`) | template fill | LR-15 |
| 8 | `sandwich-architect.md` | dissolve Mandate A-E block into Process Phases 4/5 (per §10) | manual rewrite ~30 LOC change | LR-06, LR-30 |
| 9 | `session-end.md` | dissolve Step 9 Escalation Sentinel into Process Step 6 OR keep as Step 6.5 (per §10) | manual rewrite ~20 LOC change | LR-06 |
| 10 | `telemetry-analyst.md` | trim 2 LOC to fit ≤200 ceiling; resolve D-A1 (body says `Why opus` — match frontmatter `model: sonnet` per Decision 021) | manual edit ~5 LOC | LR-04, LR-09 |
| 11 | `master-planner.md` | dissolve "Decomposition cost model" appendix block (lines 164-175) into Process Phase 2 / Phase 5 with cross-reference to `architecture.md` | manual rewrite ~12 LOC change | LR-30 |
| 12 | `settings.json` | add `Write(.claude/agents/**)` deny entry per Decision 028 Consequences §9 line 198 | line additions | (no lint rule; manual) |

**Split-point recommendation for 8.1.3a/b**: steps 1-7 are mechanical/template-fill (effort=low, ≤30 file edits, lint-driven). Steps 8-11 are manual-rewrite (effort=medium, requires reading + restructuring). If 8.1.3 mechanical pass blows past `effort=low` budget at step 7, recommend splitting:

- **8.1.3a** = steps 1-7 (mechanical migration; lint-clean for LR-01, LR-02, LR-03, LR-13, LR-15, LR-18; closes ~22 of 24 files).
- **8.1.3b** = steps 8-11 (manual restructure; lint-clean for LR-06, LR-30, LR-09, LR-04; closes 4 files but requires re-review).

Step 12 is settings.json edit — atomic; bundle with whichever sub-substage closes faster.

## §12 Conformance examples

### §12.1 Conformant agent (skeleton — adapted from `master-planner.md`)

```markdown
---
name: master-planner
description: Use when a phase-level goal must be decomposed into a budget-aware sequence of sessions.
model: opus
tools: [Read, Glob, Grep, Write]
archetype: agent
---

# Subagent: Master Planner

## Persona
[1 paragraph identity]

## Invocation Context
[when invoked, by whom]

## Input
[what invoker supplies]

## Process

### Phase 1: Understand
### Phase 2: Decompose
[Mandate-style bolt-ons integrate here per §10]

## Output
[what agent returns]

## Constraints
## Do NOT

## Spawned Session Handling
[TERMINAL — last H2]
```

Note: §10 mandates dissolution of master-planner.md's existing post-spawned `## Decomposition cost model` block (lines 164-175). The example above shows post-remediation shape.

### §12.2 Conformant discipline-skill (skeleton — adapted from `confusion-protocol/SKILL.md`)

```markdown
---
name: confusion-protocol
description: Use the moment you notice confusion or unclear spec intent.
tools: [Read, Write]
archetype: discipline
model: opus
---

# Confusion Protocol

## When to invoke
## Red Flags — STOP
## The Protocol
### Step 1: Halt
### Step 2: Audit sources
## Rationalization Counters
## Output
## Do NOT

## Spawned-session mode
[TERMINAL — last H2; lowercase-hyphen form]
```

### §12.3 Conformant command (skeleton — adapted from `context-save.md`)

```markdown
---
name: context-save
description: Save a mid-session checkpoint with structured context.
tools: [Read, Write, Bash]
---

# /context-save — Mid-Session Checkpoint

## Purpose
## Steps
### 1. Collect state
### 2. Write checkpoint

## Spawned Session Handling
[TERMINAL — last H2; YAML output block per exemplar]
```

### §12.4 Anti-pattern (cited — `sandwich-architect.md` lines 122-157)

```markdown
## Spawned Session Handling
[terminal section]

---

## Mandates A/B/C/D — Pre-write Part-C Verification
### Mandate A — ...
### Mandate B — ...
### Mandate E — ...
```

**Failure**: H2 (`## Mandates A/B/C/D`) appears AFTER terminal `## Spawned Session Handling`. Violates §4.1 ordering + §10 integration rule + Decision 028 line 152-153 (NEVER append Mandate / Annotation / Bolt-on AFTER terminal section). Drift inventory CC-3 line 203-204 documents this as the systemic authoring anti-pattern. Triggers LR-06 ERROR + LR-30 ERROR. Remediation: dissolve Mandates A-E into Process Phases 4 + 5 with inline cross-references to `agent-workspace/memory/agent-notes.md` 2026-04-27 entry per §10.

## §13 Linter rule list

Each rule has an ID (LR-NN), severity (ERROR | WARN), trigger condition, and remediation. ERROR rules block lint-clean exit; WARN rules emit messages but don't block.

| ID | Severity | Trigger | File-types | Remediation |
|---|---|---|---|---|
| LR-01 | ERROR | `model` field missing or value not in {opus, sonnet, haiku} | agent, skill (discipline) | Add `model:` per §3 table |
| LR-02 | ERROR | frontmatter contains `allowed-tools` key (forbidden) OR `tools` is missing/empty | agent, skill, command | Rename `allowed-tools` → `tools`; add valid array |
| LR-03 | ERROR | command `.md` file has no frontmatter block at all | command | Add minimum frontmatter per §3.4 |
| LR-04 | ERROR | body LOC > hard ceiling per §5 | all | Split or trim file |
| LR-05 | ERROR | H2 ordering does not match canonical sequence per §4.X for the file's archetype | all | Reorder H2 sections |
| LR-06 | ERROR | Any H2 heading appears AFTER terminal `## Spawned Session Handling` (or `## Spawned-session mode`) | agent, skill, command | Move content INTO Process or delete; per §10 |
| LR-07 | ERROR | filename casing is not kebab-case + `.md` | all | Rename file |
| LR-08 | ERROR | cross-reference path inside Markdown link `[](...)` or backticked `path:line` does not resolve to existing file | all | Fix path or remove broken reference |
| LR-09 | ERROR | body contains literal `Why opus` or `Why sonnet` AND frontmatter `model:` value contradicts (telemetry-analyst.md D-A1 case) | agent | Fix body OR fix frontmatter; cross-reference originating decision |
| LR-11 | ERROR | `archetype` field on a skill is not one of {discipline, reference} | skill | Set archetype per Decision 028 line 89 + 191 |
| LR-13 | ERROR | `archetype` field missing on a skill | skill | Add `archetype: discipline` or `archetype: reference` |
| LR-15 | ERROR | hook-profile `profile:` field missing or not in {minimal, standard, strict} | hook-profile | Add per §3.5 |
| LR-19 | ERROR | `.test.md` sibling missing one or more required H2 sections per §4.6 | test-fixture | Add missing H2 |
| LR-26 | ERROR | settings.json contains commented-out hook entries (e.g., key prefixed `// disabled-`) | settings | Remove stale entry |
| LR-30 | ERROR | a `## Mandates` (or `## Annotations` or `## Bolt-ons`) H2 contains ≥3 sub-mandates — integration debt threshold | agent, skill | Dissolve into Process phases per §10 |
| LR-10 | WARN | `archetype` missing on agent (RECOMMENDED `agent` constant) — becomes ERROR in v2.4 | agent | Add `archetype: agent` |
| LR-12 | WARN | `description` field is empty, multi-line, >300 char, OR does not start with imperative verb / "Use when" | all (with frontmatter) | Rewrite description |
| LR-14 | WARN | `<artifact>.test.md` sibling does not exist AND parent has no `test: none` opt-out | agent, skill | Add `.test.md` sibling OR set `test: none` |
| LR-16 | WARN | spawned-section H2 uses cross-form (e.g., `## Spawned-session mode` on an agent, or `## Spawned Session Handling` on a skill) | agent, skill | Normalize per §4.2 / §4.1 |
| LR-17 | WARN | reference-skill includes `## Red Flags` / `## Rationalization Counters` / `## Spawned-session mode` | skill (reference) | Remove disciplinary sections OR change archetype |
| LR-18 | WARN | command uses variant header (`## Autonomous Mode`, `## Autonomous Usage`, etc.) instead of canonical `## Spawned Session Handling` | command | Rename header to canonical |
| LR-20 | WARN | body LOC over soft target but under hard ceiling | all | Trim or accept warn (track for next session) |
| LR-21 | WARN | frontmatter key uses snake_case or camelCase | all (with frontmatter) | Rename to kebab-case |
| LR-22 | WARN | decision-file citation points to `decisions/NNN-*.md` that doesn't exist | all | Fix decision id or remove citation |
| LR-23 | WARN | external URL not on allowlist (Anthropic docs, GitHub, schema.org, charter) | all | Replace or annotate |
| LR-24 | WARN | settings.json missing `$schema` field | settings | Add `$schema: https://json.schemastore.org/claude-code-settings.json` |
| LR-25 | WARN | hook entry in settings.json has neither `_comment_*` sibling key nor named hook-profile reference | settings | Add comment OR ensure entry traces to a profile doc |
| LR-27 | WARN | settings.json has duplicate hook entries with same `matcher` value under same event (consolidation candidate) | settings | Consolidate into single entry with multiple `hooks` array members |
| LR-28 | WARN | settings.local.json contains absolute path with machine-specific prefix | settings | Replace with relative path or document machine-locality |
| LR-29 | WARN | hook entry in settings.json not declared in active profile's `## Events covered` table — OR — profile doc declares event with no settings.json entry (Q5 directionality) | settings + hook-profile | Reconcile per §9.7 |

Total: **15 ERROR rules** (LR-01..LR-09 + LR-11/13/15/19/26/30) and **15 WARN rules** (LR-10/12/14/16/17/18/20/21/22/23/24/25/27/28/29).

Linter implementation note (deferred to substage 8.1.2): rules SHOULD use Zod schemas (per OSS pattern research 8.0.2 R-3 line 184; Decision 028 Consequences §12 line 201) for frontmatter parsing; H2 ordering uses regex over Markdown AST; LOC count uses raw line count after frontmatter strip.

## §14 Conformance summary

- **REQUIRED conformance** = all ERROR rules pass (`node scripts/audit/config-style-lint.ts --strict` exit 0). Decision 028 Consequences §10 line 199 binds this as deterministic gate SC-40.
- **RECOMMENDED conformance** = all WARN rules also pass (no warnings emitted).
- **Migration deadline**: substage 8.1.3 closes; SC-40 green is required for Phase 8 close.

This guide is normative for `.claude/*` artifacts created or edited during Phase 8 onward. Pre-Phase-8 artifacts are remediated in 8.1.3 per §11. Post-Phase-8 amendments to this guide require a new Decision file (e.g., 029, 030, ...).

**END Config Style Guide.**
