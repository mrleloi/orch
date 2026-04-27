# The Kickoff Prompt

> This file contains the exact prompt to paste into Claude Code to begin autonomous execution of the Orch project.

---

## How to Use

1. Unzip this starter kit into an empty folder (e.g., `~/projects/orch/`)
2. `cd ~/projects/orch`
3. `git init` (so Claude Code can track changes)
4. Make sure you have `ccs` configured with at least one working Claude profile (ideally Max/x20 plan for longest runway)
5. Open Claude Code in this directory: `ccs <your-profile> claude` (or just `claude` if ccs default is set)
6. Paste **ONE of the prompts below** as your first message

Pick based on what you want:

---

## Prompt A — Full Autonomous Mode (recommended)

Paste this exactly:

```
Read CLAUDE.md and agent-workspace/constitution/autonomous-protocol.md first, fully.

I am the project owner. I have prepared this starter kit with full
charter, constitution, specs, phase plans, subagents, commands, and
skills. Your job is to execute the entire project autonomously through
all 4 phases until Phase 4 is complete per its success criteria.

Do not ask me questions. Do not stop to confirm decisions. Apply the
Decision Rules in autonomous-protocol.md when you hit ambiguity.
Document decisions in agent-workspace/memory/decisions/.

STOP only for:
- Deterministic gate failures after 3 retries (STOP-1)
- Environment errors you cannot work around (STOP-2)
- Direct charter contradictions (STOP-3)
- Irreversible destructive actions you're about to take (STOP-4)
- Phase 4 successfully complete (STOP-5, happy stop)

Begin with Phase 0 Task 0.1 now. Work through tasks sequentially. At
each session boundary (250K cap approach), run /session-end, write
your handoff, and stop the current session cleanly. I will resume you
by pasting "continue autonomously from current-execution.md" and you
pick up.

Start now. First actions:
1. Read the files listed in autonomous-protocol.md § Pre-Flight Checklist
2. Announce understanding in 3 short sentences
3. Begin Task 0.1
```

---

## Prompt B — Guided Mode (if you want to oversee each phase)

Paste this:

```
Read CLAUDE.md and PROJECT_CHARTER.md. This is the Orch project
starter kit. Execute Phase 0 only (research and verification). Run
/session-end when phase is complete. I'll review before approving
Phase 1.

Begin Phase 0 now following agent-workspace/session-plans/pending/phase-0-research.md.
```

Then at each phase boundary, paste:

```
Phase N looks good (or: here are my adjustments: ...). Proceed to Phase N+1.
```

---

## Prompt C — Resume After Daemon Interruption

If an autonomous session hit the 250K cap and ended cleanly, paste:

```
Resume autonomous execution from agent-workspace/memory/current-execution.md.
Read the last 3 session logs first to understand state, then continue
from Next Session Pickup. Same autonomous rules apply.
```

---

## Prompt D — After a STOP Escalation

If you see `agent-workspace/memory/escalation.md` (meaning Claude hit a STOP condition), read that file, address the specific question or fix the environment issue, then paste:

```
I've addressed the escalation in <file>. Delete escalation.md and
resume autonomous execution.
```

---

## What Success Looks Like

When Phase 4 completes cleanly, you'll see:
- `agent-workspace/memory/project-complete.md` with evidence summary
- All 4 phase plans moved to `agent-workspace/session-plans/completed/`
- `packages/core` fully implemented with passing tests
- `packages/telegram` fully implemented
- `packages/web-ui` fully implemented
- `packages/cli` fully implemented
- `packages/shared` with types
- `docker-compose.yml` + optional observability stack
- Comprehensive docs
- Example integration tested
- Charter success criteria F1-F8, N1-N6, O1-O4, S1-S4 all ✅

At that point you're ready to `npm install -g` and point it at StockForge.

---

## Expected Duration

Working with Claude Opus (Max x20 plan):
- Phase 0 (Research): ~1-2 days of autonomous runtime (multiple sessions)
- Phase 1 (Core): ~3-5 days
- Phase 2 (Interfaces): ~3-5 days
- Phase 3 (Intelligence): ~2-3 days
- Phase 4 (Polish): ~1-2 days

**Total**: 10-17 days of session-time, but distributed across many 100-250K context windows with `ccs` account failover between them. Wall-clock time depends on account availability.

---

## What Autonomous Mode Does NOT Cover

The following still require human action — don't be surprised if the agent STOPs for these:

- `npm publish` — requires your credentials
- Telegram bot token creation (via @BotFather) — manual step
- Testing on real StockForge — you must decide when to integrate
- Deciding whether a failing test is a spec bug or an implementation bug (sometimes)

These are explicitly documented as STOP-worthy in the relevant phase plans.

---

## Safety Reminders

The starter kit's `settings.json` denies the dangerous operations (rm -rf, git push --force, writing to constitution, etc). But autonomous mode is still powerful — the agent can:

- Create many files
- Modify lots of code
- Spend significant tokens

Recommendations:
- Use a dedicated git repo for Orch (separate from StockForge)
- Run in a worktree or branch, not on main
- Keep Telegram notifications on during autonomous runs — you want to know when it stops
- Check in at least once per phase to verify direction before it drifts too far

The agent will stage changes but **never commits** unless you explicitly tell it to. Your `git status` review is the final gate.

---

## Troubleshooting

If the agent appears stuck (silent > 30 min):
- Check `agent-workspace/memory/escalation.md`
- Check latest session log in `agent-workspace/memory/sessions/`
- Paste: "Status? Show me current state and next step."

If the agent is going in circles (same task 3+ times):
- Likely hit STOP-1 but didn't write escalation properly
- Paste: "STOP. Write escalation.md for the current blocker. Then wait."

If the agent is violating an invariant and not catching it:
- Paste: "Run /invariant-check and fix any violations before proceeding."

---

## After Completion

Once `project-complete.md` exists:
1. Review the final diff carefully
2. Run the Phase 4 Task 4.11 Final Verification Gate manually if you want
3. Commit with a meaningful message
4. Push
5. `orch init` + `orch attach ~/projects/stockforge`
6. Drop your first plan file in StockForge's `agent-workspace/session-plans/pending/`
7. Watch it run via Telegram or Web UI
8. ☕
