# Slash Commands Reference

> All slash commands available inside a Claude Code session in this repo.
> Defined in `.claude/commands/`.

---

## Workflow Commands

### `/session-start [goal]`
Loads project state, determines session type, outputs session brief. In autonomous mode: runs automatically at session start.

Optional `$ARGUMENTS`: explicit session goal override.

See: `.claude/commands/session-start.md`

### `/session-end`
Closes session cleanly. Writes log, updates memory, stages changes, checks for phase completion. Not optional — skipping breaks continuity.

See: `.claude/commands/session-end.md`

### `/phase-advance`
Validates current phase success criteria, writes completion marker, advances to next phase. Autonomous mode runs this automatically when triggered by `/session-end` detecting phase completion.

See: `.claude/commands/phase-advance.md`

---

## Quality Commands

### `/invariant-check`
Runs all grep-based invariant checks from `constitution/invariants.md`. Reports violations. Auto-runs at session-end.

Violations of I-1, I-2, I-3 → STOP-4 (serious drift).
Violations of I-14 or layering → fix before task done.

See: `.claude/commands/invariant-check.md`

### `/budget-check`
Reports current session token consumption and threshold status. Auto-runs at 50%, 70%, 85% thresholds.

See: `.claude/commands/budget-check.md`

---

## Research Commands

### `/research-study <repo>`
Invokes `research-scanner` subagent to study ONE reference repo per research protocol.

Examples:
```
/research-study claudegram
/research-study NachoSEO/claudegram
```

See: `.claude/commands/research-study.md`

---

## How Commands Work

Claude Code slash commands are markdown files in `.claude/commands/`. The filename becomes the command name. The file content is the prompt that runs when invoked.

You can add your own by dropping a markdown file in that folder. Restart session or `/agents` to load. Same mechanism as subagents (`.claude/agents/`) and skills (`.claude/skills/`).

---

## Autonomous Mode Behavior

In autonomous mode (`current-execution.md` has `autonomous_mode: true`), these commands run without user prompt:
- `/session-start` at the beginning
- `/invariant-check` and `/budget-check` at appropriate points
- `/session-end` at the end
- `/phase-advance` when phase complete

Commands that require user input (e.g., confirmation for destructive op):
- Still wait for user even in autonomous mode — this is an invariant (I-6)

---

## Commands NOT in This Starter Kit (Built Later)

Phase 2+ will add:
- `/orch-status` — query Orch daemon directly from within a managed project
- `/queue-this` — shorthand to enqueue current task

These don't exist yet. Don't try to invoke them.

---

## See Also

- `.claude/agents/` — subagents (invoked via Task tool)
- `.claude/skills/` — skills (loaded on-demand by Claude Code based on task)
- `.claude/settings.json` — permissions + hook configuration
