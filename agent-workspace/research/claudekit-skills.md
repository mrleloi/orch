# Research Note: claudekit-skills

**Repo**: https://github.com/mrgoonie/claudekit-skills
**Clone**: C:/htdocs/_research_clones/claudekit-skills
**License**: MIT
**Stars**: ~500+ (active 2025-2026)
**Language**: Markdown + Python + Node.js (prompt-engineering repo, no build step)
**Last active**: Dec 2025 (marketplace launch)
**Verdict**: BORROW specific patterns; SKIP the domain skills library

---

## (a) Repo Overview

ClaudeKit Skills is a community library of 35+ reusable Agent Skills organized into 12 installable plugin categories. It is a best-practices reference implementation for the Claude Code Agent Skills spec (launched Oct 2025).

**What it is NOT**: Not a daemon, orchestrator, or code project. It is a prompt-engineering conventions repo. Domain skills (NestJS, Shopify, React, etc.) are irrelevant to Orch. Meta skills (skill-creator, context-engineering, debugging/systematic-debugging, problem-solving) are directly relevant.

**Key architectural insight -- Progressive Disclosure 3-tier pyramid**:

1. YAML frontmatter description field (<200 chars) -- always in context per skill
2. SKILL.md body (<150 lines) -- loaded only when skill activates
3. references/ and scripts/ content -- pulled on demand when Claude needs depth

This formalizes what Orch skills already do informally -- but Orch has NOT enforced size limits. Six Orch skills exceed 150 lines: otel-tracing (350), grammy-bot (275), prisma-sqlite (278), profile-yaml (270), nestjs-module (249), claude-code-hooks (251).

**Plugin distribution**: 12 categories with plugin.json manifests and a marketplace install flow. Irrelevant for single-operator Orch today but documents the path if skills are ever distributed to managed projects.

---

## (b) Borrowable Patterns Table

| Pattern | Description | Current Orch Status | Recommended Action | Value |
|---------|-------------|--------------------|--------------------|-------|
| **Progressive disclosure 3-tier** | SKILL.md under 150 lines; detail in references/ sub-dir; scripts in scripts/ | PARTIAL -- 6 skills over 150 lines | REFACTOR: split oversized files into SKILL.md (triggers + quick-ref table) + references/topic.md files | HIGH |
| **allowed-tools in frontmatter** | Declares which tools a skill pre-approves, reducing per-tool confirmations in autonomous mode | MISSING -- Orch has only name + description | ADD to all SKILL.md. brainstorming=Read; research-first=Read,Bash,WebFetch; systematic-debugging=Read,Bash,Grep | HIGH |
| **skill-author meta-skill** | Teaches how to write new skills: conventions, validation checklist, progressive-disclosure rules | MISSING | CREATE .claude/skills/skill-author/SKILL.md with Orch conventions and embedded validate_skill.ts | HIGH |
| **quick_validate.py validator** | Programmatic checker: YAML frontmatter, name kebab-case, description <=200 chars, file structure correct | MISSING -- no skill validation in Orch | PORT to TypeScript; run in CI pre-commit on SKILL.md changes. Enables v2.0 testable-skills theme | HIGH |
| **Evaluation rubric** | Multi-dim scoring: factual accuracy 30%, completeness 25%, tool efficiency 20%, citation 15%, source quality 10%. LLM-as-Judge with position-swap bias mitigation | MISSING | BORROW for v2.0 subagent scoring. Key stat: token variance explains 80% of agent performance variance | HIGH |
| **Skill iteration feedback loop** | Use skill -> notice struggles -> measure tokens -> update SKILL.md -> re-test. Explicit documented cycle | MISSING | ADOPT as v2.0 process: rate each activated skill post-session; feed into self-evolution workflow | HIGH |
| **references/ sub-directory** | Heavy material (API docs, schemas, cheatsheets) in references/ files, not bloating SKILL.md | MISSING -- all content in one SKILL.md | ADOPT alongside refactor. Priority: otel-tracing -> spans.md + config.md; prisma-sqlite -> schema-patterns.md + wal.md | MED |
| **Bundled scripts/ executables** | Deterministic Python/Node scripts inside skill dir, executed without loading into context | MISSING | ADOPT: research-scanner gets a scan_repo helper; systematic-debugging gets a diagnostic template | MED |
| **Dispatch table in confusion-protocol** | problem-solving/when-stuck maps stuck-types to techniques via decision table | PARTIAL -- confusion-protocol handles ambiguity only | ENHANCE: add dispatch: ambiguity->ask, complexity->brainstorming, unfamiliar-API->research-first, bug>2->systematic-debugging | MED |
| **Description char limit enforcement** | Hard 200-char limit on YAML description (always-in-context; longer = per-skill token waste every session) | PARTIAL -- concise but not validated | VALIDATE: subagent-driven-development is 258 chars, claude-code-hooks 247, confusion-protocol 222 -- all over limit | MED |
| **Multi-agent cost model** | Formal token cost multipliers: single=1x, single+tools=4x, multi-agent=15x | MISSING from docs | ADD to architecture.md as quantitative gate for horizontal vs vertical decomposition | MED |
| **Subagent delegation enforcement** | If Task/Agent calls = 0 at end of MULTI_TASK_IMPL, workflow is INCOMPLETE -- explicit failure mode | PARTIAL -- MUST language exists, no automated check | ADD explicit guard to subagent-driven-development SKILL.md | MED |
| **Plugin manifest plugin.json** | Machine-readable grouping: name, description, version, skills array, commands array | MISSING | SKIP -- only relevant if distributing skills to managed projects | LOW |
| **template-skill canonical template** | Minimal 4-line starting point for new skills | MISSING | CREATE .claude/skills/template-skill/SKILL.md | LOW |

---

## (c) Anti-Patterns / Things NOT to Copy

**1. The 35 domain skills (React, NestJS, Shopify, Bunny, Stripe, etc.)**
Generic web-dev skills that would trigger for irrelevant tasks. Orch already has more focused Orch-specific skills. Importing these causes irrelevant activations and context bloat.

**2. Python venv dependency (~/.claude/skills/.venv)**
The repo assumes a shared Python venv. Orch is TypeScript-first. Bundled scripts should use npx/tsx or stdlib Python, never a globally-installed venv.

**3. Marketplace distribution model**
/plugin marketplace add and /plugin install are for teams sharing skill libraries. Orch is single-operator. Marketplace metadata is premature optimization.

**4. AskUserQuestion inside skill workflows**
skill-creator Step 1 explicitly calls AskUserQuestion. In ORCH_SPAWNED=true mode, interactive prompts are forbidden. Any borrowed skill-authoring workflow must gate on the spawned-session check.

**5. MCP-dependent sequential-thinking**
The sequential-thinking skill wraps mcp__reasoning__sequentialthinking. Orch skills must be MCP-agnostic. The Orch equivalent is P1 think-before-coding in karpathy-principles.md with zero dependencies.

**6. Pre-refactor monolithic SKILL.md style**
Several skills (skill-creator itself) exceed 300 lines and violate their own conventions. The repo is actively refactoring toward progressive disclosure. Adopt the target state directly, not the bloated current state.

---

## (d) Concrete v2.0 Candidate Items for master-planner

### Theme 1: Self-improving skills (skill quality loop)

**v2.0-SKILL-1: Refactor 6 oversized SKILL.md files**
Split otel-tracing, grammy-bot, nestjs-module, prisma-sqlite, profile-yaml, claude-code-hooks into SKILL.md (<150 lines) + references/ sub-files. SKILL.md gets: purpose (3 lines), trigger conditions, quick-reference table with file pointers. references/ gets the dense cheat-sheets.
Effort: LOW per file (6 files total). Source: claudekit progressive-disclosure structure.

**v2.0-SKILL-2: Add allowed-tools to all SKILL.md frontmatter**
Enumerate pre-approved tools per skill. Reduces autonomous-mode gate noise. Example mapping: brainstorming=[Read]; confusion-protocol=[Read,Bash]; research-first=[Read,Bash,WebFetch,Glob,Grep]; systematic-debugging=[Read,Bash,Grep]; subagent-driven-development=[Read,Bash,Agent].
Effort: LOW. Source: Agent Skills spec allowed-tools field (Oct 2025 spec).

**v2.0-SKILL-3: skill-author meta-skill**
Create .claude/skills/skill-author/SKILL.md. Includes: Orch skill conventions (150-line limit, 200-char description, references/ pattern, allowed-tools), validation checklist, and validate_skill.ts script.
Effort: MED. Source: claudekit skill-creator (MIT; borrow freely).

**v2.0-SKILL-4: Skill validation in CI**
Add a vitest/script step: validate every SKILL.md on PR -- YAML frontmatter present, name matches directory, description <=200 chars, body <=200 lines. Fail PR on violations.
Effort: LOW. Source: quick_validate.py logic, port to TypeScript.

### Theme 2: Parallel/decomposition intelligence

**v2.0-PARALLEL-1: Token cost model in architecture.md**
Document the 1x/4x/15x multipliers as a quantitative decision gate for master-planner: single task -> direct-impl (1x); 3+ independent tasks -> MULTI_TASK_IMPL (15x accepted for isolation value); parallelize only when isolation value exceeds token overhead.
Effort: LOW (doc update). Source: context-engineering/references/multi-agent-patterns.md.

**v2.0-PARALLEL-2: Dispatch table in confusion-protocol**
Expand confusion-protocol with stuck-type routing: ambiguity -> STOP and ask; complexity spiral -> brainstorming; unfamiliar API -> research-first; bug >2 attempts -> systematic-debugging; spec contradiction -> STOP + escalation.md.
Effort: LOW. Source: problem-solving/when-stuck SKILL.md.

### Theme 3: Testable components with metrics

**v2.0-EVAL-1: Multi-dimensional subagent scoring rubric**
Formalize spec-compliance-reviewer + code-quality-reviewer output as scored dimensions (factual accuracy 30%, completeness 25%, tool efficiency 20%, citation 15%, source quality 10%). Write scores to session notes for trend analysis.
Effort: MED. Source: context-engineering/references/evaluation.md.

**v2.0-EVAL-2: Skill effectiveness telemetry**
Post-session log: which skills activated, task outcome (PASS/FAIL/BLOCKED). Store in agent-workspace/memory/skill-telemetry.md. Enables: identify skills correlated with failures (refactor), skills never activated (description too narrow -- prune).
Effort: MED. Source: claudekit skill iteration workflow concept.

**v2.0-EVAL-3: Token efficiency baseline per skill**
Instrument sessions: tokens consumed when skill X activated vs. matched sessions without it. Target: skills should reduce net tokens by preventing rework, or be token-neutral. Prune skills with consistent net-positive token cost and no quality lift.
Effort: HIGH (requires session instrumentation). Source: context-engineering finding -- token variance explains 80% of performance variance, not model choice.

---

## Summary

**Top 3 BORROW items**:
1. **Progressive disclosure refactor** -- 6 oversized SKILL.md files need splitting now (HIGH value, LOW effort)
2. **allowed-tools frontmatter field** -- pre-authorize tools per skill; immediately reduces autonomous-mode confirmation noise
3. **quick_validate.py skill validator** -- port to TypeScript for CI; directly enables v2.0 testable-skills theme

**Top 3 SKIP items**:
1. All 35 domain skills -- irrelevant to Orch problem space
2. Marketplace plugin distribution -- premature for single-operator tool
3. Python venv dependency pattern -- conflicts with TypeScript-first stack

**License**: MIT -- unrestricted borrowing; attribution courteous but not required.
**Tokens spent on this repo**: ~18K
