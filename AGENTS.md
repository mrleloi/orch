# AGENTS.md — Universal Agent Entry Point

> Cross-harness root file. Read by Claude Code, Codex, Cursor, Gemini CLI, and any other agent harness that respects this convention.

This repository is the **Orch** project — a personal Claude Code orchestration daemon.

## Which file do you actually read?

| Harness | Read this |
|---|---|
| Claude Code | `CLAUDE.md` (authoritative) |
| Codex / Cursor / Gemini | this file, then `PROJECT_CHARTER.md`, then the constitution files referenced below |

`CLAUDE.md` and this file overlap intentionally. `CLAUDE.md` is the more detailed, Claude-specific version; this is the harness-agnostic subset.

---

## Project identity (any harness)

Orch sits between a human operator (Telegram/Web UI) and Claude Code sessions running on managed projects. It:

- Handles session lifecycle, rate-limit failover, context handoff, tracing
- Does NOT replace Claude Code intelligence; it is a **dumb scheduler + smart interface**
- Is **project-agnostic** — managed projects are discovered via `.orch/profile.yaml`

Stack: Node.js 20+, NestJS, TypeScript strict, Grammy (Telegram), React+Vite (Web UI), Prisma+SQLite, OpenTelemetry, `execa` for subprocess.

---

## Non-negotiable rules (all harnesses)

1. **Daemon is dumb, workers are smart.** No LLM calls in `packages/core/` orchestration logic. (See `agent-workspace/constitution/invariants.md` § I-1.)
2. **No Agent SDK for subscription accounts.** Spawn `claude` CLI via `ccs`. (See § I-3; Anthropic ToS April 2026.)
3. **Project-agnostic core.** No "stockforge" hardcoding in `packages/core/`. (See § I-2.)
4. **One-way dependency.** Managed projects never `require()` Orch. (See § I-4.)
5. **Credentials isolation.** Never read `~/.ccs/` or `~/.claude/` files. (See § I-5.)
6. **Destructive operations require explicit confirmation**, even in autonomous mode. (See § I-6.)
7. **Do NOT commit** unless the user explicitly requests. Stage only.

---

## Constitution (read when relevant)

| File | Content |
|---|---|
| `agent-workspace/constitution/autonomous-protocol.md` | Autonomous execution rules, stop conditions, decision tree |
| `agent-workspace/constitution/invariants.md` | I-1 through I-15 with Red Flags + Rationalization Counters for critical ones |
| `agent-workspace/constitution/karpathy-principles.md` | P1 Think Before Coding; P2 Simplicity First; P3 Surgical Changes; P4 Goal-Driven |
| `agent-workspace/constitution/architecture.md` | Module boundaries, adapter pattern |
| `agent-workspace/constitution/session-budgets.md` | 250K token cliff, session types |
| `agent-workspace/constitution/model-routing.md` | Opus/Sonnet role mapping |
| `agent-workspace/constitution/coding-principles.md` | TypeScript strict, testing, error patterns |
| `agent-workspace/constitution/reusability-rules.md` | Keep everything project-agnostic |
| `agent-workspace/constitution/research-protocol.md` | How to study reference repos |

---

## Execution state

- **Routing source of truth**: `agent-workspace/memory/current-execution.md` — which phase, what's next
- **Project state**: `agent-workspace/memory/project.md` — ADRs, known issues, dependencies
- **Session logs**: `agent-workspace/memory/sessions/YYYY-MM-DD-session-N.md`
- **Decisions log**: `agent-workspace/memory/decisions/NNN-slug.md`
- **Learned rules**: `agent-workspace/memory/agent-notes.md`

---

## Autonomous mode

Enter autonomous mode when prompted "execute the plan" or similar. In autonomous mode:

- Read `PROJECT_CHARTER.md` for vision + anti-requirements
- Work phase-by-phase from `agent-workspace/memory/current-execution.md`
- Do NOT ask clarifying questions; resolve by charter principles, log decisions
- STOP only on: deterministic gate failure 3×, environment error, charter contradiction, destructive action needed
- On STOP: write `agent-workspace/memory/escalation.md`

Full rules: `agent-workspace/constitution/autonomous-protocol.md`.

## Spawned-session mode (`ORCH_SPAWNED=true`)

When the Orch daemon itself spawns a Claude Code session to execute a task:
- The env variable `ORCH_SPAWNED=true` is set
- No interactive prompts anywhere (including `AskUserQuestion`)
- All ambiguity resolved by charter + decision log
- Session ends with a **structured YAML completion block** for orchestrator parsing

Full rules: `.claude/skills/spawned-session-mode/SKILL.md`.

---

## Cross-harness model mapping

Models are declared per-agent in `.claude/agents/*.md` frontmatter. Mapping:

| Claude | Codex | Gemini |
|---|---|---|
| opus | gpt-5-high | gemini-2.5-pro |
| sonnet | gpt-5-medium | gemini-2.5-flash |
| haiku | gpt-5-mini | gemini-2.5-flash-lite |

For cross-harness adversarial review (e.g., independent bear case via Codex alongside Claude), see `.claude/skills/subagent-driven-development/SKILL.md` for the dispatch pattern.

---

## First interaction

- User says "execute the plan" or "continue" → **Autonomous mode**, follow `autonomous-protocol.md`
- User asks a specific task → **Focused mode**, read matching session plan if exists
- User explores ("should we...", "what if...") → **Brainstorming mode**, do NOT modify files, use `.claude/skills/brainstorming/SKILL.md` if available

---

## Differences from CLAUDE.md

`CLAUDE.md` includes additional Claude-specific details:
- References to specific Claude Code skills and subagents
- Session Protocol (start, end, memory writes)
- Anti-patterns list specific to Claude Code tooling

Non-Claude harnesses: the principles are the same; the tooling is harness-specific. Translate `Skill` / `Subagent` / `Hook` invocations to your harness's equivalent.
