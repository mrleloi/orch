# Phase 8.0.1 - Config Drift Inventory

Generated: 2026-04-27 by research-scanner substage 8.0.1.

---

## S1 Summary

### Headline Counts

| Directory | Files | Total LOC | Notes |
|---|---|---|---|
| .claude/agents/ | 11 agent .md + 1 .test.md = 12 files | ~1,532 | 1 anomalous test file |
| .claude/skills/ | 13 SKILL.md files | ~1,138 | |
| .claude/commands/ | 9 .md files | ~965 | |
| .claude/hooks/profiles/ | 3 profiles + 1 README = 4 files | ~199 | |
| .claude/settings.json | 1 file | ~256 lines | |
| .claude/settings.local.json | 1 file | 8 lines | |

**Total config tree LOC**: ~4,090

### Top 5 Most-Egregious Deviations

1. telemetry-analyst.test.md lives in .claude/agents/ - agent behavior-test contract masquerading as an agent definition. Zero frontmatter, wrong directory, no established convention.

2. Frontmatter model contradicts Persona prose (telemetry-analyst.md:4 vs :21): frontmatter says sonnet; Persona says Why opus (not sonnet).

3. Commands have no uniform frontmatter schema: 6/9 have zero frontmatter; 3/9 have description only; none have model, tools, or allowed-tools.

4. allowed-tools (skills) vs tools (agents) for same concept: no normative rule documents the divergence.

5. Technical skills and discipline skills structurally incompatible but share SKILL.md format: 6 technical skills have no Red Flags, Rationalization Counters, or Spawned-session mode. 7 discipline skills have all three. No documented class distinction.

---

## S2 .claude/agents/

### Frontmatter Field Matrix

| File | name | description | model | tools |
|---|---|---|---|---|
| master-planner.md | yes | yes | opus | yes |
| sandwich-architect.md | yes | yes | opus | yes |
| sandwich-dev.md | yes | yes | sonnet | yes |
| sandwich-verifier.md | yes | yes | opus | yes |
| task-implementer.md | yes | yes | sonnet | yes |
| spec-compliance-reviewer.md | yes | yes | sonnet | yes |
| code-quality-reviewer.md | yes | yes | sonnet | yes |
| systematic-debugger.md | yes | yes | opus | yes |
| research-scanner.md | yes | yes | sonnet | yes |
| telemetry-analyst.md | yes | yes | sonnet | yes |
| telemetry-analyst.test.md | NONE | NONE | NONE | NONE |

All 10 true agents share identical 4-field frontmatter. telemetry-analyst.test.md has zero frontmatter.

### Section Ordering Analysis

Canonical pattern (8-9/10 agents):

    H1: Subagent: <Name>
    H2: Persona
    H2: [Responsibility | Invocation Context | Scope Contract | When to Invoke | Critical Isolation Rule]
    H2: Input
    H2: Process -> H3: Phase N: ...
    H2: Constraints
    H2: Do NOT
    H2: Output
    H2: Spawned Session Handling

**Deviations by file:**

- telemetry-analyst.md:28: First H2 is Invocation Context; Persona is free prose (lines 10-27) with no H2 label.
- systematic-debugger.md:16: Uses H2 When to Invoke instead of H2 Responsibility. Missing H2 Input and H2 Do NOT.
- sandwich-architect.md:122: Appends Mandates A/B/C/D/E block (lines 122-157) AFTER H2 Spawned Session Handling. No other agent has post-spawned content.
- task-implementer.md: No H2 Constraints header; rules embedded in Scope Contract and Do NOT.
- telemetry-analyst.test.md:1: Ad-hoc structure (Trigger, Expected Behavior, Failure Modes, Metrics, Assertions). No overlap with agent pattern.

### Mandatory vs Optional Sections (10 true agents)

| Section | Present |
|---|---|
| Frontmatter (4 fields) | 10/10 |
| H1 Subagent: <Name> | 10/10 |
| H2 Persona labeled H2 | 9/10 |
| H2 Input | 9/10 |
| H2 Process | 10/10 |
| H2 Do NOT | 9/10 |
| H2 Output | 10/10 |
| H2 Spawned Session Handling | 10/10 |
| H2 Constraints | 8/10 |
| H2 Responsibility | 6/10 |

### Length Distribution (agents)

Range 103-201 LOC. telemetry-analyst.md (201) outlier-high. research-scanner.md (103) low.
telemetry-analyst.test.md (53) not a real agent.

### Concrete Deviations with Line Numbers

**DEV-A1** - Contradictory model field vs Persona prose (telemetry-analyst.md):
- Line 4: model: sonnet
- Line 21: Why opus (not sonnet): pattern recognition over heterogeneous markdown rollup tables is non-mechanical analysis

**DEV-A2** - telemetry-analyst.test.md:1 opens with plain H1 headline, no frontmatter block.
Fails harness-audit checks for name, model, tools.

**DEV-A3** - sandwich-architect.md:122: Post-spawned Mandates block breaks canonical order.
First line: ## Mandates A/B/C/D - Pre-write Part-C Verification (binding from Phase 6.5.3 onward)
No other agent has content after its Spawned section.

---

## S3 .claude/skills/

### Frontmatter Field Matrix

All 13 skills: name, description, allowed-tools (3 fields each). Consistent within the dir.
Diverges from agents (field: tools) for the same concept - no documented rationale.

### Two-Class Structural Split (undocumented)

**Class A - Discipline skills** (7): brainstorming, confusion-protocol, research-first,
spawned-session-mode, verification-before-completion, systematic-debugging, subagent-driven-development

**Class B - Technical reference skills** (6): grammy-bot, nestjs-module, otel-tracing,
prisma-sqlite, profile-yaml, claude-code-hooks

| Section | Class A 7 files | Class B 6 files |
|---|---|---|
| H2 When to invoke / When to Use | 7/7 | 6/6 |
| H2 Red Flags - STOP | 7/7 | 0/6 |
| H2 Rationalization Counters | 7/7 | 0/6 |
| H2 Do NOT | 6/7 | 0/6 |
| H2 Spawned-session mode | 6/7 | 0/6 |
| H2 Reference Index table | 0/7 | 6/6 |
| H2 Quick Reference | 0/7 | 6/6 |
| H2 Anti-Patterns | 0/7 | 6/6 |

**DEV-S1** - systematic-debugging/SKILL.md is a discipline skill (has Red Flags, Rationalization Counters)
but lacks H2 Spawned-session mode. Its agent counterpart systematic-debugger.md has H2 Spawned Session Handling.

**DEV-S2** - H1 title format diverges by class:
- Class A (brainstorming/SKILL.md:1): # Brainstorming - plain name
- Class B (grammy-bot/SKILL.md:1): # Grammy Telegram Bot -- Orch Patterns - suffix appended
No documented rule for when to append the suffix.

**DEV-S3** - Spawned-mode heading inconsistency:
- Skills (brainstorming/SKILL.md:98): ## Spawned-session mode (lowercase, hyphen)
- Agents: ## Spawned Session Handling (Title Case, no hyphen)
Neither form documented as canonical.

### Length Distribution (skills)

Range 53-134 LOC. confusion-protocol/SKILL.md (134) and spawned-session-mode/SKILL.md (124) outlier-high.
claude-code-hooks/SKILL.md (53) shortest. No LOC target documented.

---

## S4 .claude/commands/

### Frontmatter Matrix

| File | Has frontmatter | Fields |
|---|---|---|
| session-start.md | No | - |
| session-end.md | No | - |
| phase-advance.md | No | - |
| budget-check.md | No | - |
| invariant-check.md | No | - |
| research-study.md | No | - |
| context-save.md | Yes | description only |
| context-restore.md | Yes | description only |
| harness-audit.md | Yes | description only |

6/9 commands: zero frontmatter. 3/9: description only. None have model, tools, or allowed-tools.

### Autonomous/Spawned Section Heading Variance

| File | Heading used | Canonical? |
|---|---|---|
| context-save.md:88 | H2 Spawned Session Handling | YES |
| context-restore.md:75 | H2 Spawned Session Handling | YES |
| harness-audit.md:115 | H2 Spawned Session Handling | YES |
| session-end.md:171 | H2 Autonomous Mode Behavior | no |
| session-start.md:81 | H3 inside Steps: 7a. Autonomous Mode: Proceed | no |
| phase-advance.md:85 | H2 Autonomous Mode | no |
| budget-check.md:45 | H2 Autonomous Mode | no |
| research-study.md:73 | H2 Autonomous Usage | no |
| invariant-check.md | Missing | no |

3/9 canonical. 5/9 variant. 1/9 absent.

**DEV-C1** - invariant-check.md has no autonomous-mode section (lines 1-104). Autonomous behavior
embedded inline at line 97: In autonomous mode: if any I-1, I-2, I-3 fails -> STOP-4 (destructive/charter).

**DEV-C2** - session-start.md:1 has no frontmatter block; context-save.md:1 does.
Same command-doc type, two conventions.

**DEV-C3** - session-end.md:109-128 contains inline YAML template for the escalation sentinel.
Same template also appears in autonomous-protocol.md. Potential duplicate drift between two documents.

### Length Distribution (commands)

Range 53-180 LOC. session-end.md (180) is 3.4x budget-check.md (53). No documented size guideline.

---

## S5 .claude/hooks/profiles/

### Frontmatter

None of the 3 profiles nor the README have frontmatter. No name, profile_id, or description field.
Profiles identified only by filename.

### Structure Consistency

All three profiles share: H2 Events handled table and H2 When to use.
standard.md and strict.md add H2 Wire examples. minimal.md adds H2 When NOT to use.
Profiles are the most internally consistent of the four dirs.
Deviations are between profile docs and settings.json reality, not between profiles.

**DEV-H1** - standard.md:13: PostToolUse entry states No-op (kept deterministic for speed).
But settings.json:207-225 has two active PostToolUse hook entries (budget-watchdog.sh and
component-telemetry.sh). Profile doc is stale relative to actual wired config.

**DEV-H2** - hooks/README.md:37: States hook bodies are scaffolds only. False; settings.json
now has 6 event types with real hook bodies. README describes a prior state.

**DEV-H3** - strict.md:3-11 does not document the SubagentStop event, which has 3 entries in
settings.json. Profile doc is incomplete relative to actual wired hooks.

---

## S6 .claude/settings.json and settings.local.json

### Hook Entries by Event

| Event | Matcher | Commands |
|---|---|---|
| SessionStart | startup/resume/clear | inline log, session-start-bootstrap.sh |
| SessionStart | .* | component-telemetry.sh |
| SessionEnd | none | inline log only |
| Stop | none | inline log; budget-watchdog.sh; autonomous-stop-watchdog.sh; tool-call-first-lint.sh (profile-gated) |
| PreToolUse | .* | dispatch-jsonl-recorder.sh |
| PostToolUse | none | budget-watchdog.sh |
| PostToolUse | .* | component-telemetry.sh |
| SubagentStop | none | subagent-stop-logger.sh |
| SubagentStop | .* | component-telemetry.sh |
| SubagentStop | .* | dispatch-jsonl-recorder.sh |

**Missing from settings.json**: No PreCompact hook (hooks/README.md:40 lists it as valid event).
No SubagentStart hook. SessionEnd has only a log line; no substantive end-of-session automation.

**Structural anomaly** (settings.json:166-174): SessionEnd entry has no matcher field; Stop also lacks
matcher. PostToolUse has one no-matcher entry and one matcher:.*. No rule documented for when
matcher is required vs optional.

**SubagentStop duplication** (settings.json:237-253): Two entries both use matcher:.* running
different scripts. Could be one multi-hook entry; structurally redundant.

**settings.local.json:6**: Read(//c/Users/PC/.claude/channels/telegram/**) - Windows double-slash path,
machine-specific, non-portable.

---

## S7 Cross-Cutting Findings

### Recurring Patterns

- Spawned session section name: most inconsistently named element across the tree.
  H2 Spawned Session Handling (agents: 10/10; commands: 3/9);
  H2 Spawned-session mode (discipline skills: 6/7);
  H2 Autonomous Mode variants (commands: 4/9); absent (1 command).
- model field is agent-only. Skills and commands have no model assignment.
  No documented rationale for omission.
- allowed-tools vs tools: same semantic intent, two field names, zero documentation.
- Reference index table pattern exists only in technical skills.
  Discipline skills and agents use prose lists. No rule for when to use which format.

### Naming Convention

All filenames are kebab-case across all four dirs. Consistent. No filename-level violations.
Internal H1 title conventions diverge by class (see DEV-S2).
Frontmatter name values match filenames for all agents.

### Broken Cross-References (file:line)

1. research-scanner.md:65 - cites research-protocol.md without path; lives at agent-workspace/constitution/research-protocol.md
2. grammy-bot/SKILL.md:22 - cites references/bot-setup.md; references/ subdir existence unconfirmed
3. nestjs-module/SKILL.md:22 - cites references/module-template.md; same concern
4. otel-tracing/SKILL.md:22 - cites references/spans.md; same concern
5. prisma-sqlite/SKILL.md:22 - cites references/schema-patterns.md; same concern
6. profile-yaml/SKILL.md:22 - cites references/parsing.md; same concern
7. claude-code-hooks/SKILL.md:22 - cites references/hook-types.md; same concern
8. sandwich-architect.md:133 - cites dynamic path phase-<N-1>-routing-recommendations.md as if stable
9. master-planner.md:168 - cites architecture.md section by prose heading; rename breaks this silently
10. hooks/README.md:37 - describes settings.json as scaffold-only; now stale (6 event types wired)

---

## S8 Recommendations for 8.1.1 Architect

**R1 - Canonical 4-field agent frontmatter schema** (DEV-A1, DEV-A2):
Required fields: name, description, model (enum: opus|sonnet), tools (list).
Any .md in .claude/agents/ missing a field fails harness-audit.
Add optional type: agent | test to legitimize test-contract files.

**R2 - Unify tools vs allowed-tools as a semantically distinct pair** (S3 frontmatter split):
Document: tools (agents) = what agent may invoke autonomously;
allowed-tools (skills) = what the invoking session is constrained to.
Update harness-audit to check the correct field per file type.

**R3 - Mandate H2 Spawned Session Handling as canonical heading everywhere** (DEV-C1, command drift):
Verbatim: ## Spawned Session Handling.
All variants (Autonomous Mode, Autonomous Usage, Autonomous Mode Behavior, H3 inline) are non-canonical.
harness-audit greps for exact heading in all agents and all commands that run in autonomous context.

**R4 - Add skill_type: discipline | reference discriminator to skill frontmatter** (S3 two-class split):
Discipline skills require: Red Flags, Rationalization Counters, Do NOT, Spawned-session mode.
Reference skills require: Reference Index table, Quick Reference, Anti-Patterns.
harness-audit enforces by class. Eliminates false-positive audit failures on technical skills.

**R5 - Fix telemetry-analyst.md model contradiction immediately** (DEV-A1):
model: sonnet (line 4) vs Why opus (not sonnet) (line 21).
Style guide rule: frontmatter model field is the single authoritative source; Persona rationale is informational.

**R6 - Define canonical agent section order; prohibit post-spawned content** (DEV-A3):
Canonical sequence: Persona > Responsibility > Input > Process > Constraints > Do NOT > Output > Spawned Session Handling.
Nothing follows Spawned.
sandwich-architect mandates belong in agent-workspace/constitution/architect-mandates.md with a citation link.

**R7 - Require minimum frontmatter for all commands** (S4 matrix, DEV-C2):
All 9 commands must have at minimum description:.
Optionally add invokes-in-autonomous: true | false to flag which commands need a Spawned section.
Current: 6/9 have zero frontmatter.

**R8 - Keep hook profile docs in sync with settings.json** (DEV-H1, DEV-H2, DEV-H3):
Add Last synced: YYYY-MM-DD to each profile .md.
Make it a session-end step to update profile docs when settings.json hooks change.
Remove stale scaffold disclaimer from hooks/README.md.

**R9 - Require verifiable cross-references** (S7 broken cross-references 2-7):
Every references/ path cited in a skill must exist as an actual file.
harness-audit verifies each cited path and flags missing targets.
All six technical skills risk broken Reference Index links.

**R10 - Document LOC soft ceilings per file class** (S2-4 length distribution):
Agents: 100-180 LOC. Discipline skills: 80-140 LOC. Reference skills: 50-90 LOC. Commands: 50-140 LOC.
Files above ceiling trigger harness-audit advisory.
telemetry-analyst.md (201), session-end.md (180), sandwich-architect.md (169+) are candidates for extract-or-split.
