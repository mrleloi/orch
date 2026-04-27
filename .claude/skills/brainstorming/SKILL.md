---
name: brainstorming
description: Use at the START of a PLAN session or when the user says "should we...", "what if...", "thinking about...". Forces Socratic scope-definition before any plan or code. Blocks master-planner and sandwich-architect until scope is explicit.
tools: [Read]
archetype: discipline
model: opus
---

# Brainstorming

## When to invoke

- User's message is exploratory ("should we build X?", "thinking about adding Y")
- Start of a PLAN session with no existing phase plan
- New feature that doesn't yet have a spec in `specs/tier2-feature/`
- User gives a goal without acceptance criteria

## Red Flags — STOP

- Jumping to master-planner on "thinking about X" → premature, scope not defined
- Writing a session plan before acceptance criteria agreed → plans get rewritten
- Assuming user's exploratory question is a commitment → validate first
- Proposing 10 features for a 1-feature ask → scope creep

## The Ritual (strict order)

### Step 1: Situate
Read:
- `PROJECT_CHARTER.md` (scope boundaries, anti-requirements)
- `agent-workspace/memory/current-execution.md` (where are we)
- Relevant T1 spec if touching existing area

### Step 2: Clarifying Questions

Ask 3-5 questions max. Not interrogation — enough to separate scope from ambition. Good question categories:

- **Why now?** What triggered this? Is it blocking something?
- **In scope / out of scope?** E.g., "X for StockForge only, or for any managed project?"
- **Acceptance criterion?** How do we know it's done?
- **Size expectation?** Session, phase, new phase?
- **Touch which modules?** Does it cross adapter / domain / interface boundaries?

If `ORCH_SPAWNED=true`, do not ask. Resolve ambiguity by charter principles and log in decision file.

### Step 3: Scope Proposal

Present 2-3 scope options with tradeoffs:

```markdown
## Scope options

### Option A: [tight scope, 1 session]
- Delivers: [minimal functional outcome]
- Effort: [sessions/budget]
- Risks: [what's untested]

### Option B: [medium scope, 2-3 sessions]
- Delivers: ...
- Effort: ...
- Risks: ...

### Option C: [full vision, 4+ sessions]
- Delivers: ...
- Effort: ...
- Risks: ...

Recommendation: [A|B|C] because [charter principle invocation].
```

### Step 4: Terminal Lock

After user approves a scope → transition ONLY to `master-planner` (for phase decomposition) or directly `sandwich-architect` (for single-feature session plan).

Do NOT transition to: sandwich-dev, task-implementer, research-scanner, or any implementation skill.

## Rationalization Counters

**Pressure**: "User said 'just build X', skip the questions."
**Correct response**: "Just build X" from a user who hasn't thought about scope produces work that gets torn up on review. 3 questions upfront saves 3 sessions of rework.

**Pressure**: "I already know the right scope, presenting options is theater."
**Correct response**: Presenting options reveals what the user values. Your "right scope" may prioritize code elegance where user prioritizes shipping speed, or vice versa.

**Pressure**: "This is a tiny feature, brainstorming is overkill."
**Correct response**: Tiny features that grow unchecked become the bloat the charter's anti-requirements are meant to prevent. Small scope IS the outcome of brainstorming, not a reason to skip it.

## Do NOT

- Invoke master-planner, sandwich-architect, sandwich-dev, task-implementer, or research-scanner during brainstorming
- Write specs/tier2-feature/NNN.md drafts before scope is locked
- Implement "quick prototype to explore the idea"

## Output

At end of brainstorming: one of
- **Locked scope** (option chosen) → proceed to planning
- **Deferred** → write note in `agent-workspace/memory/decisions/NNN-defer-<slug>.md`
- **Rejected** → write note, end session

## Spawned-session mode

If env `ORCH_SPAWNED=true`:
- No interactive Q&A.
- Pick the option most consistent with charter (usually tightest scope = A).
- Log decision in `agent-workspace/memory/decisions/NNN-<slug>.md` with rationale.
- Transition to planner as if user had approved.
