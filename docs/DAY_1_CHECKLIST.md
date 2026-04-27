# Day 1 Checklist

> First-time setup of the Orch starter kit. ~30 minutes of human work before Claude Code can take over autonomously.

---

## Step 0 — Prerequisites

Verify on your machine:

```bash
node --version     # should be >= 20
pnpm --version     # any modern version, or `corepack enable`
git --version      # >= 2.25 for worktree
claude --version   # Claude Code CLI installed
ccs --version      # kaitranntt/ccs installed and configured
```

If any missing → install before proceeding. Claude Code CLI docs: https://code.claude.com/docs. ccs docs: https://github.com/kaitranntt/ccs.

---

## Step 1 — Unpack and Initialize

```bash
# Assuming you downloaded orch-starter.zip
unzip orch-starter.zip
mv orch-starter orch    # or any name you like
cd orch
git init
git add -A
git commit -m "chore: initial starter kit"
```

This gives autonomous execution a clean baseline to diff against.

---

## Step 2 — Read (30 min, not skippable)

In this order:

1. **`PROJECT_CHARTER.md`** (15 min) — understand vision, non-negotiables, success criteria. If you disagree with any charter principle, edit it NOW before Claude starts. Once autonomous execution begins, the charter is treated as immutable.

2. **`CLAUDE.md`** (5 min) — identity Claude Code will adopt.

3. **`agent-workspace/constitution/autonomous-protocol.md`** (10 min) — MOST IMPORTANT. Understand when Claude will stop vs. continue, what decisions it makes without you.

You don't need to read the other constitution files, specs, or phase plans — Claude will read them itself. But skim the filenames so you know what's there.

---

## Step 3 — Customize (optional, ~15 min)

If you want to adjust before starting:

### a. Charter adjustments
Edit `PROJECT_CHARTER.md` if any principle doesn't fit your situation. Common edits:
- Rename "Orch" to something you prefer (also update `CLAUDE.md`, scoped package names in ADRs)
- Change target user from "self + 3-5 peers" if scope differs
- Change license from MIT to your preference

### b. Stack adjustments
If you want different dependencies, edit `agent-workspace/constitution/coding-principles.md` § Dependencies.

### c. Reference repo list
If you want Claude to study different or additional repos during Phase 0, edit `agent-workspace/session-plans/pending/phase-0-research.md` target list.

If you're not sure, SKIP this step. Defaults are deliberate.

---

## Step 4 — Claude Code Configuration

### a. Verify `.claude/settings.json`
Already populated. Review the `permissions.allow` and `permissions.deny` lists. Add any commands specific to your environment (e.g., different package manager).

### b. Set OTEL env vars (optional but recommended)
If you have Langfuse or SigNoz running:

```bash
# In .claude/settings.json "env" block already set defaults — verify endpoint matches your setup
```

If you don't have OTEL backend yet — the starter kit tasks Phase 0 Task 0.4 to help you set it up. You can skip this for now.

### c. ccs profile selection
Decide which ccs profile Claude Code will run under for autonomous execution. Recommend your longest-runway subscription (Max/x20 plan). Start Claude Code with:

```bash
ccs <profile-name>    # or just `claude` if ccs default is set
```

---

## Step 5 — Pick Your Prompt

Open `docs/KICKOFF_PROMPT.md`. Choose:
- **Prompt A** (fully autonomous) — recommended for overnight runs
- **Prompt B** (guided per phase) — recommended first time through, so you can course-correct

---

## Step 6 — Launch

In the `orch/` directory, run `claude` (or `ccs <profile>`), paste your chosen kickoff prompt.

Claude will:
1. Acknowledge reading the charter and protocol
2. Announce which phase / task it's starting
3. Begin executing

Expected first actions (Phase 0):
- Clone reference repos into `reference-repos/`
- Write research notes in `agent-workspace/research/`
- Verify primitives (hooks, ccs resume, OTEL)
- Synthesize findings
- Advance to Phase 1

---

## Step 7 — Monitor (lightly)

Once autonomous mode starts:

### In the terminal
Watch session logs fly by. Don't interrupt unless concerning.

### Review session boundaries
When Claude runs `/session-end`, check:
- `agent-workspace/memory/sessions/` — latest session log
- `agent-workspace/memory/current-execution.md` — next steps

If the handoff looks sensible, paste `continue` (or Prompt C from kickoff).

### Watch for escalation
If `agent-workspace/memory/escalation.md` appears, STOP and address. Claude will not proceed past this.

### Watch git status
```bash
git status    # periodically
git diff      # if curious
```

Claude stages changes but never commits. You commit when you're comfortable.

---

## Step 8 — When Phase 0 Completes

Claude writes `agent-workspace/memory/phase-0-complete.md`. Review it. If Phase 0 looks good:

- **Interactive mode (Prompt B)**: paste "proceed to Phase 1"
- **Autonomous mode (Prompt A)**: it proceeds automatically, keep monitoring

Repeat for Phase 1, 2, 3, 4.

---

## Step 9 — When Phase 4 Completes

`agent-workspace/memory/project-complete.md` appears. 🎉

Final verification:
1. Read the completion summary
2. Run tests one more time: `pnpm run test`
3. Run invariant check: have Claude run `/invariant-check`
4. Manual spot-check a few key files
5. Commit everything: `git add -A && git commit -m "feat: v1.0.0 — initial Orch release"`
6. Tag: `git tag v1.0.0-alpha`

Then proceed to integration with your real project(s):

```bash
cd /path/to/stockforge
orch attach .
```

Edit the generated `.orch/profile.yaml`, drop your first session plan in `agent-workspace/session-plans/pending/`, and let it run.

---

## Common Issues

### "Claude keeps asking me questions"
Re-paste this:
```
Apply autonomous-protocol.md strictly. Do not ask me questions.
Document decisions in agent-workspace/memory/decisions/ and proceed.
```

### "It's going in circles on the same error"
Paste:
```
STOP. Write agent-workspace/memory/escalation.md with the specific
error and three attempts you made. Then wait for me.
```

### "The session ended but no phase advance"
Paste:
```
Check current-execution.md. If current phase's success criteria are
met, run /phase-advance. If not, tell me what's missing.
```

### "I need to pause and edit something"
Ctrl+C the Claude session. Edit files as needed. Restart with:
```
I made manual edits to <files>. Review them, reconcile with your
last session state, then continue autonomously.
```

---

## Tips

- **Run overnight.** Autonomous mode works best uninterrupted. Claude at 2 AM ≈ Claude at 2 PM; you at 2 PM are much more productive than babysitting.
- **Telegram integration helps.** Phase 2 builds a Telegram bot, but until then, you might want to set up a simple uptime-style ping to Pushover or similar if daemon/Claude gets stuck.
- **Don't edit files while autonomous mode is running.** You'll create conflicts. If you need to intervene, pause first.
- **Keep the reference-repos/ clutter.** They're gitignored and sometimes Claude re-reads them during later phases.
- **Trust but verify.** At each phase boundary, do a quick manual review. Catching drift early saves tokens.
