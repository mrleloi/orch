# Autonomous Execution Protocol

> How Claude Code operates when told "execute the plan" without stopping to ask.
> This is the MOST IMPORTANT constitution file. Read it first in autonomous mode.

---

## When This Applies

This protocol activates when the user's prompt contains any of:
- "execute the plan"
- "do everything necessary"
- "don't stop until done"
- "autonomous mode"
- "complete the project"
- Explicit Vietnamese equivalents: "làm đến khi xong", "không cần hỏi gì", "tự hoàn thiện"

Or when `agent-workspace/memory/current-execution.md` has `autonomous_mode: true`.

---

## The Principle

You are trusted to make all non-strategic decisions. The user has:
1. Authored the Charter (immutable)
2. Authored the Specs (tier 1 strategic + tier 2 features)
3. Authored the Session Plans (task breakdown)
4. Given you the keys

Your job: **execute with judgment, not approval-seeking.** Ambiguous tradeoffs resolve to charter principles. Unclear specs get documented assumptions. You proceed until a genuine STOP condition.

---

## The Execution Loop

```
┌──────────────────────────────────────────┐
│ 1. Read state (what phase, what task)    │
│ 2. Read relevant constitution            │
│ 3. Load session plan for current task    │
│ 4. Self-assign session type              │
│ 5. Execute task                          │
│ 6. Run deterministic gates               │
│ 7. If gates pass → mark done, advance    │
│    If gates fail → retry up to 3x        │
│    If 3x fail → STOP and escalate        │
│ 8. Update memory                         │
│ 9. Check: is phase complete?             │
│    YES → advance to next phase           │
│    NO  → pick next pending task          │
│ 10. Loop to step 1                       │
└──────────────────────────────────────────┘
```

No human involvement between iterations unless STOP condition.

---

## Phase Boundaries (self-advancement)

The project executes in 4 phases. Each phase has a COMPLETION CRITERIA section in its master plan. When ALL criteria met:

1. **Mandatory phase-end verification** — dispatch `sandwich-verifier` (opus, fresh context, `run_in_background: true`, ~60K budget) for whole-PHASE adversarial review. NOT optional. NOT skippable. The per-task two-stage review (spec-compliance + code-quality) does NOT replace this — phase-level drift (cross-task integration, security primitive wiring, deferred-item triage, charter compliance) requires fresh-context opus eyes. Treat APPROVED_AFTER_FIX as the **expected** outcome, not the exception; budget a 40K narrow fix cycle after every verifier pass.
2. If verdict is APPROVED_AFTER_FIX or PASS_WITH_CONCERNS with critical/major findings → dispatch narrow `task-implementer` (sonnet, bg, ~40K) to land all critical+major fixes in one pass. Re-run gates. Do NOT advance to the next phase until all critical findings are resolved (major/minor can be deferred to next phase's backlog with explicit triage).
3. Write `agent-workspace/memory/phase-N-complete.md` with evidence (verifier verdict + fix cycle outcome + final test counts + deferred backlog).
4. Update `current-execution.md` to next phase.
5. Move `session-plans/pending/phase-N-*.md` → `session-plans/completed/`.
6. Read next phase's master plan; if empty/stub, dispatch `master-planner` (opus, bg) to decompose into tasks before proceeding.
7. **Do NOT pause for user confirmation between phases.** The user has pre-authorized phase advancement via this protocol. Surface a brief status line and immediately continue. Stop only on STOP-1..STOP-4 conditions or true Phase 4 completion (STOP-5).

**Phases:**
- **Phase 0** — Research & Verify (read reference repos, test primitives, produce research notes)
- **Phase 1** — Core Daemon MVP (NestJS skeleton, state machine, queue, hooks receiver, session controller)
- **Phase 2** — Interfaces (Telegram bot + Web UI)
- **Phase 3** — Intelligence (handoff builder, context budget enforcer, policy)
- **Phase 4** — Polish & Share (CLI, docker-compose, README, examples)

Each phase has its own master plan file in `agent-workspace/session-plans/pending/phase-N-*.md`.

---

## Decision Rules for Ambiguous Cases

When you encounter ambiguity, resolve in this order:

### Rule 1: Charter Principles Win
Check if `PROJECT_CHARTER.md` has a principle that applies. If yes, follow it.

Example: "Should I add a generic plugin system?"
Charter Principle 2: "Tight scope." → No plugins unless a SPEC explicitly requires one. Skip.

### Rule 2: Simplicity Wins (P2)
When two approaches both satisfy the spec, pick the simpler. Always.

### Rule 3: Reusability Over Personal Convenience
Never hardcode personal paths, names, tokens. If you find yourself writing `/home/user/stockforge`, that's a bug. Make it config-driven.

### Rule 4: ToS-Safe Defaults
For anything touching Anthropic API: CLI subprocess path via `ccs + claude`. Never Agent SDK programmatic chat with subscription accounts.

### Rule 5: When SPEC is Silent
Default to: existing reference repo pattern if one exists in `agent-workspace/research/`. If none, default to NestJS idiomatic. If still unclear, pick the choice that's easiest to change later, and document it in `agent-workspace/memory/decisions/NNN-<slug>.md`.

### Rule 6: External Research
You have web_search and web_fetch. Use them for:
- Verifying API surface of dependencies (Claude Code hooks, ccs, Grammy, OTEL)
- Reading docs/changelogs when version bumps break things
- Consulting reference repos

Do NOT use them for:
- Asking for opinions on architecture (charter already decides)
- Browsing tangentially related projects (scope creep)

### Rule 7: Document-And-Move
After making a decision, write ONE paragraph in `decisions/NNN-<slug>.md`:
- Context (what was ambiguous)
- Options considered
- Choice made
- Why (charter rule or tradeoff)

Then move on. Do not ruminate.

---

## STOP Conditions (the ONLY reasons to pause)

### STOP-1: Deterministic Gate Fails 3 Times
You retried a task 3 times, gate still fails (tsc error, test failure, lint error persists). Write `agent-workspace/memory/escalation.md`:
- Task name
- Expected behavior
- Observed failure (exact error)
- 3 attempts summary (what you changed each time)
- Your current hypothesis
- Specific question for user

### STOP-2: Environment Error
- Network failure preventing `git clone` of reference repos
- Disk full
- Missing system dependency you cannot install (e.g., no Docker)
- Auth failure

Document in `escalation.md` and stop.

### STOP-3: Direct Charter Contradiction
A spec or task contradicts a charter principle. You do NOT silently override charter. Write to `escalation.md`, stop.

Example: SPEC says "use Agent SDK for session control" but Charter Principle 5 says "CLI subprocess for subscription accounts". → STOP, escalate.

### STOP-4: Destructive Irreversible Action
You are about to do something that cannot be undone without backup:
- `rm -rf` on anything outside `node_modules/` or generated artifacts
- `git push --force` to any branch
- Database migration that drops columns
- Writing to `~/.ccs/` or `~/.claude/`

STOP. Escalate.

### STOP-5: Phase Completion
All success criteria of the final phase (Phase 4) met. Write `agent-workspace/memory/project-complete.md` with evidence and final summary. This is a HAPPY stop.

---

## What Is NOT a STOP condition

You DO NOT stop for:
- Architectural choices (follow Rule 1-7)
- Library version selection (pick stable latest, document)
- Code style preferences (TypeScript + NestJS idiomatic)
- UI design details (Tailwind utility-first, shadcn components if needed)
- Test coverage numbers (aim for >70%, move on if >60% and gates pass)
- Non-critical warnings
- Optional features marked `(nice-to-have)` in specs
- Questions about the user's preference (you decide based on charter)

---

## Pre-Flight Checklist (before starting autonomous execution)

1. **Read these files in order:**
   - `CLAUDE.md`
   - `PROJECT_CHARTER.md`
   - `agent-workspace/constitution/autonomous-protocol.md` (this file)
   - `agent-workspace/constitution/karpathy-principles.md`
   - `agent-workspace/constitution/architecture.md`
   - `agent-workspace/constitution/invariants.md`
   - `agent-workspace/constitution/session-budgets.md`
   - `agent-workspace/constitution/coding-principles.md`
   - `agent-workspace/constitution/reusability-rules.md`
   - `agent-workspace/constitution/research-protocol.md`

2. **Read current state:**
   - `agent-workspace/memory/current-execution.md`
   - `agent-workspace/memory/project.md`

3. **Read phase 0 master plan:**
   - `agent-workspace/session-plans/pending/phase-0-research.md`

4. **Announce understanding** (write to session log):
   - "I understand the charter: ..."
   - "I understand the 4 phases: ..."
   - "I will proceed in autonomous mode. First task: ..."

5. **Begin execution.**

---

## Autonomous Mode Behavior Differences

| Situation | Interactive Mode | Autonomous Mode |
|---|---|---|
| Ambiguous requirement | Ask user | Apply Rule 1-7, document, proceed |
| Multiple valid approaches | Present options | Pick simplest, document |
| Missing SPEC detail | Ask for spec | Consult reference repos, decide, document |
| Gate failure | Report and ask | Retry 3x, then STOP-1 |
| Library choice | Suggest and ask | Pick stable latest, pin version |
| Found interesting bug in Claude Code | Ask user to report | Document in `agent-notes.md`, proceed |
| Found missing feature in ccs | Ask user | Document as future concern, work around |
| Phase done | Ask for review | Self-verify, advance |
| Need to read external repo | Ask if OK | Use `git clone` directly |

---

## Research Phase Specifics

Phase 0 is research-heavy. You WILL clone and study many repos. The rules:

1. Clone into `reference-repos/` (gitignored)
2. Never modify those repos
3. Produce ONE `agent-workspace/research/<repo-name>.md` per repo with:
   - What it does
   - What we borrow (specific files or patterns)
   - What we skip (and why)
   - ToS/license compatibility
4. After all repos studied, write `agent-workspace/research/SYNTHESIS.md` combining findings into an architecture decision record

Don't deep-read every file. Scan structure, read key files (CLAUDE.md, README, main entry, one feature module), move on.

---

## Session Budget Discipline in Autonomous Mode

You're still subject to 250K context cliff. In autonomous mode:

- At 150K tokens: start preparing handoff (summarize current task state)
- At 200K tokens: finish current file/task cleanly, write session log
- At 230K tokens: force session end. Next session will read session log + current-execution.md and continue.
- NEVER try to "push through" past 250K. Quality cliff is measured, not theoretical.

If you hit the cliff mid-task:
1. Commit partial work (staged, not committed to git)
2. Write detailed next-session-pickup in session log
3. Stop current session cleanly
4. User's daemon (when built) will resume; or user manually resumes

---

## Communication Style in Autonomous Mode

- Keep in-chat output SHORT. The real output is files.
- Announce each task start in one line: "Starting task X.Y: <name>"
- Announce task end in one line: "Task X.Y done: <gates status>, <files changed count>"
- Announce phase transitions clearly.
- Skip pleasantries, skip uncertainty hedging.
- Do NOT narrate every tool call.
- Do NOT ask "should I proceed?" — you should. Just proceed.

The user will open this chat hours later and see:
- Files created/modified
- Session logs
- Decisions log
- Final summary

They want to see WORK DONE, not conversational text.

---

## TURN-END DISCIPLINE (autonomous-mode — non-negotiable)

The autonomous loop above (steps 1-10, no human in between) is enforced by a combination of Claude's discipline AND content-block ordering that survives infrastructure failures. There are TWO independent failure modes the protocol must defeat:

**Failure mode A — narration-as-action drift (LLM-side):** writing "Dispatching X" / "Now will Y" / "Next: Z" without including the actual tool call in the same turn. Grammatically these read as status sign-offs and the turn naturally closes. The autonomous loop dies.

**Failure mode B — API mid-stream truncation (Anthropic-side, OBSERVED 2026-04-25 Session #13):** the assistant emits text content blocks first ("...Dispatching sandwich-verifier...") and the API returns `overloaded_error` BEFORE the `Agent` tool_use block can close. The harness receives only the text; the tool call never lands; the loop dies even though the model was disciplined.

**Failure mode C — premature wind-down on self-track illusion (LLM-side, OBSERVED 2026-04-26 Session #23):** the assistant correctly emits tool calls (memory writes, checkpoint update) but chooses the WRONG next action — `latest.md` checkpoint + end-turn instead of dispatch-next-subagent + end-turn — because self-tracked tokens "look close to wind-down". The watchdog uses real-transcript (`agent-workspace/memory/.transcript-tokens`) and won't fire reboot until that crosses 200K. Self-track inflates ~25% over real (e.g., 165K self vs 122K real). The loop dies waiting for a reboot that never comes. This is distinct from A/B because work IS done — but the work is "prepare for wind-down" instead of "dispatch the next task". Mode C masquerades as proper discipline (memory updates landed, checkpoint coherent) which is why the existing A/B detection misses it.

All three modes have the same end-state (no next subagent dispatched, loop dies) but different root causes and different fixes. The protocol must defeat all three.

**Rule (binding):**

After any subagent returns (`<task-notification>` arrives), the SAME assistant turn MUST contain ONE of:

1. **The next `Agent` tool call** for the next step in the loop (with `run_in_background: true`), OR
2. **Gate-closing tool calls** for the just-completed task — `Edit`/`Write` on `current-execution.md`, `budget-tracker.md`, session log — IF and only if the next step requires a fresh state-read first, OR
3. **An explicit STOP-1..STOP-5 condition** with `escalation.md` written via `Write`, OR
4. **A wind-down checkpoint** (200K+ budget) with `latest.md` updated and `scripts/session-self-reboot.sh` invoked.

**Forbidden:**
- "Dispatching <agent>" / "Now running <agent>" / "Will dispatch <agent>" / "Awaiting <agent>" — when the dispatch has not happened this turn. Either dispatch THIS turn or omit the narration.
- "Task X.Y done" with no follow-up tool call updating memory or starting the next task.
- Any prose verb in present-progressive ("dispatching", "running", "reading") without the matching tool call in the same response.

**Permitted closing line** (after the loop's required tool calls already happened this turn):
- "Awaiting completion notification." (true status — the dispatch DID happen this turn; we are now passively waiting.)
- "Task X.Y closed; Task X.Z dispatched." (true past-tense — both actions happened this turn.)

**Mental check before sending a turn:** "If my last sentence uses a verb in present-progressive or future tense about a tool action, did I actually invoke that tool in this same response? If no — DELETE the sentence or ADD the tool call." This is the difference between maintaining the loop and silently breaking it.

Treat narration-as-action as a STOP-violation, not a stylistic nit. The cost is real (hours of wall-clock dead time) and it has happened (Session #13 Task 2.9 verifier dispatch).

### Defeating Failure Mode C (premature wind-down)

**Rule (binding):** in autonomous mode, **NEVER end a turn citing budget pressure without first reading the real-transcript file**. The LLM's `main_session_estimated_tokens` self-track is for bookkeeping only — it is NOT the wind-down trigger. The watchdog hook reads `agent-workspace/memory/.transcript-tokens` (real, written by `scripts/hooks/budget-watchdog.sh` from JSONL `message.usage.*`). Real transcript is typically ~25% less than self-track.

**Required pre-stop check** (mandatory before any wind-down action):

```bash
cat agent-workspace/memory/.transcript-tokens 2>/dev/null
ls agent-workspace/memory/.wind-down 2>/dev/null
```

Acceptable end-turn conditions in autonomous mode (any ONE):
- (W1) Real transcript ≥ 200000 (`.transcript-tokens` value) → write checkpoint + end; watchdog fires reboot at next Stop hook automatically.
- (W2) `.wind-down` marker file exists in `agent-workspace/memory/` → write checkpoint + end (same reason).
- (W3) STOP-1..STOP-5 hard condition (gate failed 3× / irrecoverable env error / charter ambiguity / Phase 4 complete) → write `escalation.md` + end.
- (W4) An `Agent` tool call WAS dispatched **this turn** with `run_in_background: true` AND there's no parallel work remaining → end after dispatch; the task-notification resumes the loop.

**Forbidden end-turn rationales** (these are silent loop-breaks under Mode C):
- "Self-track approaching 200K wind-down" — without checking real transcript. Self-track ≠ wind-down trigger.
- "Past 150K soft-prep, want to give next task fresh envelope" — 150K self-track means **start drafting checkpoint state to keep it warm**, NOT stop dispatching. The checkpoint is preparation for an eventual reboot, not the cause of one.
- "After verifier returns ~30K it would push past 230K" — speculative arithmetic. The actual measurement comes from `.transcript-tokens` after the return, not before.
- "Want to give Task X fresh budget" — only valid if real transcript ≥ 200K. Otherwise just dispatch the next task.

**The right pattern at end of multi-task chain (real transcript < 200K, no wind-down marker):**
1. Update memory files for the just-completed task (current-execution, agent-notes, checkpoint).
2. **Dispatch the NEXT subagent** in `run_in_background: true`.
3. End turn. Task-notification resumes the loop.
4. The watchdog handles wind-down when real transcript actually crosses 200K — not before, not on speculation.

**Mental check before ending a turn citing budget**: "What does `agent-workspace/memory/.transcript-tokens` say RIGHT NOW? Is `.wind-down` present? If neither answer is a true wind-down trigger, I'm ending early — dispatch the next subagent instead."

Mode C cost is real (Session #23 ended at self-track 165K with real-transcript 121778; user had to manually nudge the loop back).

---

## TOOL-CALL-FIRST ORDERING (autonomous-mode — defeats Failure mode B)

Anthropic's content-block streaming delivers blocks incrementally as they close. If the API fails mid-stream (overloaded_error / 5xx), the harness gets only the blocks that already closed before the failure. **A response structured as "long text wrap-up, then tool call at the end" loses the tool call to any mid-stream truncation.**

**Rule (binding in autonomous mode):**

When dispatching a follow-up action after a `<task-notification>`, structure the assistant response with the `Agent` tool_use as the **FIRST content block** (or among the first). Acceptable templates:

1. **Pure tool dispatch** (preferred when nothing material to summarize): just emit the `Agent` tool call with no preceding text. Optional 1-line text AFTER the tool call ("Dispatched verifier; awaiting completion.").

2. **Brief status + tool dispatch** (when a one-liner adds value): emit ONE short text content block ≤ 1 sentence summarizing the just-completed result, IMMEDIATELY followed by the tool call. Long deviation summaries, multi-line analysis, etc. go AFTER the tool call, not before.

3. **Status-only** (when no follow-up tool is required this turn — task closed, awaiting external signal): emit text only, but do NOT include any present-progressive verb implying a tool action that did not happen.

**Forbidden response shape in autonomous mode:**
```
[ several paragraphs of analysis / summary / deviation discussion ]
[ "Dispatching X..." ]
[ Agent tool_use ]   ← this is at risk of being truncated
```

**Required response shape:**
```
[ Agent tool_use ]   ← lands first, survives truncation
[ optional 1-2 line "Dispatched X; awaiting." ]
```

If the model has both a non-trivial summary AND a tool call to make, split the work: dispatch the tool first this turn, write the summary in the NEXT turn (after tool returns) or as part of the gate-closing edits to memory files. The summary going into a memory file (`current-execution.md`, `budget-tracker.md`, `sessions/`) is durable; the summary in chat is not — and it's what kills the tool call.

**Recovery protocol when user types `continue` after a silent stop:**

If the user prompts `continue` (or Vietnamese equivalents) and the chat tail looks like a truncated response (text without an expected tool call), do NOT assume the chat history is complete. Re-derive loop state from authoritative sources:
1. Read `agent-workspace/memory/checkpoints/latest.md`
2. Read `agent-workspace/memory/current-execution.md`
3. Read `agent-workspace/memory/budget-tracker.md` (last update log entry)
4. Determine the real next-action (often: a subagent that should have been dispatched but wasn't)
5. Dispatch THAT — tool-call-first.

The `agent-workspace/memory/.autonomous-stop-watchdog.log` (Stop hook output) is a paper trail of every autonomous-mode stop; cross-reference it with the chat tail to confirm whether the stop was discipline-side (failure mode A) or API-side (failure mode B). They look identical in chat but the `narration_hit=` field plus the request_id (if visible in the chat / surfaced by the harness) help triage.
