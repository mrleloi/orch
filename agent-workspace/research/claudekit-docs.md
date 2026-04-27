# claudekit-docs.md --- Research Note
Source: https://docs.claudekit.cc/
Date: 2026-04-26
Researcher: research-scanner (sonnet)
License: Commercial SaaS -- no OSS license found in docs

---

## (a) Doc Site Overview and Coverage

The site documents ClaudeKit -- a commercial product (Engineer Kit + Marketing Kit) that layers opinionated
scaffolding, agents, skills, commands, hooks, and workflows over vanilla Claude Code .claude/ directory
conventions. Not a replacement for Claude Code; it generates and manages .claude/ via a CLI tool named ck.

Scale of coverage (from llms.txt -- 400+ pages total):
- Getting started: installation, concepts, quick-start, upgrade, cheatsheet, migration guide
- CLI: ck init, ck update, ck doctor, ck migrate, ck versions
- Engineer Kit: 14 named agents, 60+ skills, 4 workflow config files, hooks, MCP config, CLAUDE.md template
- Marketing Kit: 30+ marketing-domain agents, 90+ skills (separate product vertical)
- Workflows: ~25 named scenario playbooks (adding-feature, fixing-bugs, building-api, etc.)
- Support: FAQ, troubleshooting, community

Key observation: claudekit is primarily a content package -- it delivers .claude/ directory files.
The framework is its conventions and its CLI. The LLM integration is still plain Claude Code.

---

## (b) Conceptual Model

claudekit mental model (all stored in .claude/ directory):
  Agents:    .claude/agents/*.md             named autonomous specialists
  Skills:    .claude/skills/NAME/SKILL.md    reusable knowledge modules
  Commands:  slash commands, migrated to skills in v2.12.0
  Workflows: .claude/workflows/*.md          orchestration protocol docs
  Hooks:     .claude/settings.json           8 lifecycle event types
  CLAUDE.md: thin root doc, references workflows/ dir
  MCP:       .claude/.mcp.json

### Agents
- Named specialists: Planner, Researcher, Tester, Debugger, Code Reviewer, Code Simplifier,
  Fullstack Developer, UI/UX Designer, Git Manager, Docs Manager, Project Manager, Journal Writer,
  MCP Manager (14 total in Engineer Kit)
- Invoked via slash commands (/ck:plan, /ck:cook, /ck:debug) or natural language
- Agents chain sequentially; parallel patterns described for independent tasks
- Model assignment and tool list not exposed in public docs (opaque to end user)

### Skills (formerly Commands)
- v2.12.0: all slash-commands migrated to skills with identical invocation syntax
- Files live at .claude/skills/SKILL-NAME/SKILL.md -- same dir pattern as Orch
- Activation: keyword/description matching OR explicit name mention OR /skill-name syntax
- Structure: SKILL.md (target under 100 lines) + optional references/ subdir + optional scripts/ subdir
- Progressive disclosure: thin SKILL.md points to deeper references/ for detail

### Hooks
claudekit defines 8 hook events vs Orch documented 9 (in claude-code-hooks SKILL.md):
  SessionStart, SubagentStart, UserPromptSubmit, PreToolUse, PostToolUse,
  TaskCompleted, TeammateIdle, Stop/SubagentStop
claudekit-specific events NOT in Orch current skill doc:
  SubagentStart, UserPromptSubmit, TaskCompleted, TeammateIdle
Settings.json hook schema matches standard Claude Code format (matcher + type:command).
Notable built-in hooks: scout-block.cjs (.ckignore enforcement), privacy-block.cjs (sensitive file
  blocking), dev-rules-reminder.cjs (inject coding standards on UserPromptSubmit).

### Workflows
- Markdown files in .claude/workflows/ (distinct from .claude/skills/)
- Four core files: development-rules.md, documentation-management.md, orchestration-protocol.md, primary-workflow.md
- CLAUDE.md stays thin by delegating into these workflow files (claims 70% token savings)
- Workflow playbooks are scenario guides, not machine-parseable configs

### CLAUDE.md design
- claudekit keeps CLAUDE.md minimal (a few lines + links to workflow files)
- CLAUDE.md is overwritten on ck update -- customization goes in workflow files, not CLAUDE.md itself
- Contrasts with Orch CLAUDE.md which is dense (~200 lines) with all rules inline

### CCS (ClaudeKit Command Shell)
- Separate CLI tool for multi-model/multi-account switching; wraps Claude CLI
- Supports routing to GLM, Kimi, etc.; session resumption via :continue syntax
- Parallel session execution across accounts to beat rate limits
- This is the same ccs that Orch references in its subprocess spawning patterns

---

## (c) Side-by-Side: claudekit vs Orch

| Feature | claudekit | Orch | Gap | Recommended v2.0 Action |
|---|---|---|---|---|
| Agent definitions | 14 named specialists; model opaque; tool list hidden | 9 role-focused agents; explicit model+tools in frontmatter | Orch MORE explicit and auditable | BORROW role types: brainstormer, journal-writer, mcp-manager, code-simplifier |
| Skill structure | SKILL.md under 100 lines + references/ + scripts/; progressive disclosure | SKILL.md flat; no references/ or scripts/ convention | Orch lacks references/ layering | BORROW: add references/ + scripts/ to Orch skill authoring spec |
| Skill activation | Semantic matching + keyword + explicit name | Explicit invocation in CLAUDE.md; no semantic auto-match | claudekit auto-activation is UX win; Orch triggers more auditable | LEARN: document trigger keywords per skill |
| Hook events | 8 events; adds SubagentStart, UserPromptSubmit, TaskCompleted, TeammateIdle | 9 events (same core + PreCompact); 3-tier profiles | Orch missing formal TaskCompleted and TeammateIdle handling | BORROW: TaskCompleted for per-task logging; TeammateIdle for stalled-subagent detection |
| Hook safety | scout-block.cjs, privacy-block.cjs, dev-rules-reminder.cjs | PreToolUse deny-list in strict profile; I-6 guard | Orch lacks .ckignore and automatic invariant injection per prompt | BORROW: UserPromptSubmit hook that injects key invariant reminders |
| Hook profiles | No tiered profile system; hooks always active | 3-tier profiles switchable via ORCH_HOOK_PROFILE | claudekit has no profile system | Orch advantage -- keep and expand |
| Workflow docs | .claude/workflows/ with 4 markdown files | agent-workspace/; autonomous-protocol.md | claudekit separates workflow conventions from skill/agent dirs | LEARN: add .claude/workflows/ for canonical Orch orchestration patterns |
| CLAUDE.md philosophy | Thin (few lines + links); auto-overwritten on ck update | Dense (~200 lines inline); intentionally always loaded | Indirection risks losing context; Orch dense file is intentional | LEARN: audit which sections could move to workflow files |
| Planning agent | Planner: research + plan with timelines, rollback, security checklist | master-planner: phase decomp + budget estimation + session plans | Orch more budget-aware; claudekit has better rollback/security outputs | BORROW: rollback plan + security checklist in sandwich-architect output template |
| Execution skill | /ck:cook with 6 modes + --tdd flag; quality score >=9.5 for auto-approval | sandwich-dev + task-implementer; linear flow; no mode flags | Orch lacks mode flags; auto-approval threshold concept valuable | BORROW: quality-score threshold for auto-advancing past code-quality-reviewer |
| MCP management | mcp-manager subagent + use-mcp skill; isolates tool manifests in subagent context | MCP in claude-code-hooks SKILL; no mcp-manager agent | Orch has no MCP isolation pattern | BORROW: mcp-manager isolation pattern |
| Journaling/decisions | journal-writer agent + /ck:journal skill | decisions/NNN-*.md; agents write decision logs autonomously | Orch structured; claudekit agent friendlier for interactive use | LEARN: add auto-activation trigger on decision phrasing |
| CLI tooling | ck init, ck update, ck doctor, ck migrate | No orch CLI yet; ccs for subprocess spawning | Orch has no self-scaffolding CLI for managed projects | BORROW: formalize orch attach command (sketched in claude-code-hooks SKILL) |
| Code simplifier | Dedicated code-simplifier agent for autonomous simplification passes | P2 (Simplicity First) via karpathy-principles; no dedicated simplifier agent | Orch enforces simplicity via principle review only | BORROW: add code-simplifier agent as optional post-DONE pass in MULTI_TASK_IMPL |
| .ckignore pattern | scout-block.cjs enforces .ckignore to prevent agents reading sensitive dirs | No .ckignore equivalent; deny-list in settings.json | claudekit user-friendlier; Orch deny-list more auditable | LEARN: add deny_paths to profile.yaml; wire into PreToolUse hook via orch attach |
| Budget/token mgmt | /clear between phases; no formal budget tracker | budget-tracker.md; dual self-track + real-transcript; wind-down; cliff detection | Orch substantially more sophisticated | Orch advantage -- keep and expand |
| Autonomous/spawned | No equivalent; assumes interactive sessions | ORCH_SPAWNED=true; structured YAML completion reports; full dual-mode branching | claudekit has no autonomous mode concept | Orch unique differentiator -- formalize in v2.0 |
| Kanban/tracking | /ck:kanban skill + project-manager agent for markdown task boards | Phase master plans + session plans; no kanban view command | claudekit has richer task-tracking UX | BORROW: kanban markdown format for phase plan visualization |

---

## (d) Top 10 Borrowable Ideas -- Ranked by Value / Effort

### 1 -- Skill references/ + scripts/ subdir convention (Value: HIGH / Effort: LOW)
claudekit structures each skill as SKILL.md (under 100 lines) + references/ (deep docs) + scripts/ (automation).
Orch has flat SKILL.md files with no subdir convention. Adding references/ improves discoverability and keeps
SKILL.md within token budget without losing detail. Formalizing costs nothing.
Action: Update research-protocol.md and add references/ + scripts/ to the skill template description.

### 2 -- UserPromptSubmit hook for invariant injection (Value: HIGH / Effort: LOW)
claudekit injects coding standards before each user prompt via dev-rules-reminder.cjs hook. Orch in autonomous
mode occasionally loses invariant context mid-session. A UserPromptSubmit hook appending a compact invariant
summary (I-1, I-2, I-3, ORCH_SPAWNED branch reminder) before each prompt catches drift early at near-zero cost.
Action: Add UserPromptSubmit hook in standard profile that prints a 5-line invariant reminder.

### 3 -- TaskCompleted hook for per-task audit trail (Value: HIGH / Effort: LOW)
claudekit defines a TaskCompleted event. Orch task-implementer writes observation files manually but there is no
hook-level signal when a subagent task finishes. A TaskCompleted hook could auto-append to the budget tracker
and trigger a post-task invariant grep, removing that responsibility from the implementer agent itself.
Action: Wire TaskCompleted hook in settings.json that auto-greps I-1/I-2/I-3 on changed paths.

### 4 -- MCP manager isolation pattern (Value: HIGH / Effort: MEDIUM)
claudekit routes all MCP tool usage through a dedicated mcp-manager subagent, keeping heavy tool manifests out of
the main session context. Orch main session loads MCP context implicitly. Isolating MCP calls to a subagent
preserves main-session token budget for orchestration logic.
Action: Add mcp-manager.md agent definition; update research-first SKILL to delegate MCP lookups to it.

### 5 -- Rollback plan + security checklist in session plan template (Value: HIGH / Effort: LOW)
claudekit planner includes rollback procedures and a security checklist in every implementation plan. Orch
sandwich-architect produces excellent decomposition but lacks rollback or security checklist sections.
Adding these catches more failure modes before implementation starts, at no implementation cost.
Action: Update sandwich-architect output template (agent file lines 55-95) to add Rollback Plan and Security Checklist.

### 6 -- Code simplifier agent as optional post-DONE pass (Value: MEDIUM / Effort: LOW)
claudekit has a dedicated code-simplifier agent for autonomous simplification passes. Orch enforces P2 via
code-quality-reviewer. A dedicated simplifier dispatched as optional Step 8 in MULTI_TASK_IMPL catches
complexity drift at session level without burdening the reviewer role.
Action: Add code-simplifier.md agent file; mark it optional in subagent-driven-development SKILL Step 8.

### 7 -- Quality-score threshold for auto-advancing (Value: MEDIUM / Effort: MEDIUM)
claudekit auto-advances when quality score is 9.5 or above. Orch code-quality-reviewer returns APPROVED or
REJECTED but no numeric score. Adding a score output allows auto-advancing low-risk tasks and only pausing
on borderline ones, reducing round-trips on trivially clean tasks.
Action: Update code-quality-reviewer output schema to include 1-10 score; update subagent-driven-development SKILL.

### 8 -- Agent roster gaps: brainstormer and journal-writer as agents (Value: MEDIUM / Effort: LOW)
Orch has brainstorming and journaling as skills, not agents. claudekit surfaces these as first-class agents.
Making them agents allows the orchestrator to dispatch them as isolated subagents without polluting main session.
Action: Add brainstormer.md and journal-writer.md agent definitions alongside existing skill files.

### 9 -- deny_paths in profile.yaml for managed project path restrictions (Value: MEDIUM / Effort: MEDIUM)
claudekit scout-block.cjs enforces .ckignore to protect sensitive directories. Orch manages external projects via
profile.yaml; a deny_paths list lets project owners declare paths that Orch-spawned sessions must never touch,
without requiring them to edit settings.json directly.
Action: Add deny_paths array to profile.yaml schema; wire PreToolUse block in orch attach hook injection.

### 10 -- Kanban view command for phase plan (Value: LOW / Effort: LOW)
claudekit /ck:kanban renders session plans as a markdown kanban board. Orch phase plans are table-formatted
already. Adding a /kanban command (reads current-execution.md + active session plan, emits three-column
TODO/IN-PROGRESS/DONE markdown) helps human operators scan progress without reading raw plan files.
Action: Add kanban.md to .claude/commands/ that reads session-plans/pending/NNN-*.md and emits kanban markdown.

---

## Summary Verdicts

Overall verdict: LEARN (not BORROW wholesale)

License: Commercial SaaS -- no OSS license found. Content patterns (skill structure, agent schemas, hook
patterns) are ideas, not copyrightable code. We borrow the patterns, not the files.

What claudekit does better than Orch v1:
- Breadth of named agents and skills (14 agents, 60+ skills vs Orch 9 agents, 12 skills)
- Skill references/ layering for token-efficient progressive disclosure
- TaskCompleted and UserPromptSubmit hooks for finer-grained lifecycle control
- Automatic coding-standards injection via hook (automated invariant reminder per prompt)
- Rollback plan included in every implementation plan output
- MCP isolation via dedicated subagent
- CLI tooling (ck doctor, ck update) for managing .claude/ directory over time

What Orch does better than claudekit:
- Budget tracking (dual self-track + real-transcript, wind-down protocol, cliff detection)
- Autonomous / spawned-session mode (ORCH_SPAWNED, structured YAML completion reports)
- Explicit model+tool frontmatter per agent (auditable, testable)
- 3-tier hook profiles (minimal/standard/strict) switchable per session type
- Invariant system (I-1 through I-15) with rationalization counters
- Constitution architecture (domain isolation, adapter pattern, no cross-feature imports)
- Per-task two-stage review pipeline (spec-compliance then code-quality)
- Context save/restore + checkpoint crash-safety

Tokens spent: ~22K
