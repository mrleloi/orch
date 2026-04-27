# Workflow

> How a single session flows, from start to end, in this project.

---

## Session Lifecycle

```
┌───────────────────────────────┐
│  START                        │
│  Read current-execution.md    │
│  Read project.md              │
│  Read last 3 session logs     │
└────────────┬──────────────────┘
             ▼
┌───────────────────────────────┐
│  Determine session type       │
│  (PLAN | FOCUSED_IMPL | etc)  │
└────────────┬──────────────────┘
             ▼
┌───────────────────────────────┐
│  Budget estimate              │
│  (if > 250K: SPLIT)           │
└────────────┬──────────────────┘
             ▼
┌───────────────────────────────┐
│  Load session plan            │
│  (from session-plans/pending) │
│  (if missing: master-planner) │
└────────────┬──────────────────┘
             ▼
┌───────────────────────────────┐
│  EXECUTE                      │
│  Per plan subtasks            │
│  Run deterministic gates      │
│  (typecheck, lint, test)      │
└────────────┬──────────────────┘
             ▼
┌───────────────────────────────┐
│  INVARIANT CHECK              │
│  (grep checks)                │
└────────────┬──────────────────┘
             ▼
┌───────────────────────────────┐
│  /session-end                 │
│  Write session log            │
│  Update memory                │
│  Stage changes                │
└────────────┬──────────────────┘
             ▼
┌───────────────────────────────┐
│  Phase complete?              │
│  YES → /phase-advance         │
│  NO  → pick next task         │
└───────────────────────────────┘
```

---

## The Sandwich Pattern

For substantial work, use three-agent pattern:

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  ARCHITECT   │───▶│     DEV      │───▶│   VERIFIER   │
│  (plan)      │    │  (execute)   │    │  (review)    │
│              │    │              │    │              │
│  Fresh ctx   │    │  Fresh ctx   │    │  Fresh ctx   │
│  Reads spec  │    │  Reads plan  │    │  Reads diff  │
│  Writes plan │    │  Writes code │    │  Writes      │
│              │    │              │    │  report      │
└──────────────┘    └──────────────┘    └──────────────┘
```

Each with fresh context (separate subagent) — prevents echo chamber.

Invoked via Task tool:
- `master-planner` — phase-level planning
- `sandwich-architect` — session-level planning
- `sandwich-dev` — execution
- `sandwich-verifier` — adversarial review
- `research-scanner` — repo study

---

## Session Types

| Type | Budget | Purpose |
|---|---|---|
| PLAN | 50-80K | Produce session plan |
| FOCUSED_IMPL | 100-150K | Implement 1-3 tasks |
| MULTI_TASK_IMPL | 150-250K | Implement 4-10 tasks |
| VERIFY | 30-60K | Adversarial review |
| RESEARCH | 60-120K | Study reference repos |
| RECOVERY | 80-150K | Revert failed approach |

Never mix PLAN + IMPL in same session. That's the single most important rule (learned from stockforge Session 4 catastrophic failure).

See: `agent-workspace/constitution/session-budgets.md`

---

## Autonomous Mode vs Interactive Mode

### Autonomous Mode
- Triggered by: `autonomous_mode: true` in `current-execution.md`, OR explicit prompt phrases ("execute the plan", "don't stop until done")
- Agent decides, documents, proceeds — no user confirmation
- Stops only on STOP-1 through STOP-5 conditions
- Writes decisions to `decisions/NNN-*.md` for audit

### Interactive Mode
- Default when `autonomous_mode: false`
- Agent presents options at ambiguity points
- User reviews session briefs before execution
- User approves phase transitions

Switch modes by editing `current-execution.md`.

---

## Phase Flow

The project runs through 4 phases (see session plans):

0. **Research & Verify** — study reference repos, verify primitives
1. **Core Daemon MVP** — NestJS core, state machine, queue, hooks
2. **Interfaces** — Telegram bot + Web UI
3. **Intelligence** — handoff, context-full detection, budget enforcement
4. **Polish & Share** — CLI, docker, docs, release

Each phase has:
- Master plan in `agent-workspace/session-plans/pending/phase-N-*.md`
- Success criteria checklist
- Task breakdown
- Risk register

---

## File Ownership

Who (which agent role) writes what:

| File Pattern | Writer |
|---|---|
| `packages/**/*.ts` (non-test) | sandwich-dev |
| `packages/**/*.spec.ts` | sandwich-dev |
| `agent-workspace/session-plans/pending/phase-*.md` | master-planner |
| `agent-workspace/session-plans/pending/<task>.md` | sandwich-architect |
| `agent-workspace/memory/sessions/*.md` | all (at session-end) |
| `agent-workspace/memory/current-execution.md` | all (at session-end) |
| `agent-workspace/memory/project.md` | any, when ADR made |
| `agent-workspace/memory/decisions/*.md` | autonomous-mode agent |
| `agent-workspace/research/*.md` | research-scanner |
| `agent-workspace/quality-reports/*.md` | sandwich-verifier |
| `PROJECT_CHARTER.md` | NEVER (immutable) |
| `agent-workspace/constitution/*.md` | NEVER (without human approval) |

The `settings.json` deny list enforces the never-writes.

---

## When Things Go Wrong

### Gate failure
- Analyze error
- Fix
- Retry up to 3 times per gate
- 3 failures → STOP-1, write escalation

### Budget overshoot
- Summarize progress in session log
- Stop session cleanly
- Next session resumes via handoff

### Phase criterion unclear
- Apply autonomous-protocol.md Decision Rules
- Document in decisions/
- Proceed

### Charter contradiction
- STOP-3
- Do NOT silently override charter
- Escalate to human

---

## Keeping the Workflow Clean

- One task per session when in doubt
- Fresh context for verification
- Stage, don't commit (user controls commits)
- Write session log even for small work
- Never skip `/session-end`
- Check invariants before claiming done
