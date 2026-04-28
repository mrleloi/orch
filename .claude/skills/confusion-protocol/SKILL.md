---
name: confusion-protocol
description: Use the moment you notice confusion, unclear spec intent, conflicting invariants, or "I'm not sure which way to go." Prevents guessing-as-progress. Forces STOP, document, and either ask or pick-with-justification.
allowed-tools: [Read, Write]
archetype: discipline
model: opus
---

# Confusion Protocol

## When to invoke

The trigger is a *feeling*, not a check. Learn to catch yourself on these signals:

- "I think the spec says X but it might mean Y"
- "This invariant conflicts with that requirement"
- "The existing code does A but the new task says B"
- "I'm not sure which module owns this responsibility"
- "Two adapters could handle this — I'll pick one"

Any of the above → run the protocol. Do not "just proceed and see."

## Red Flags — STOP

- "I'll make a reasonable assumption and move on" → reasonable assumptions are silent bugs
- "It's probably fine, I'll adjust later" → later = code review = rework
- "The spec is ambiguous so I have latitude" → latitude without documentation = drift
- "I'll note it in a TODO" → TODOs rot; confusion-protocol demands action now

## The Protocol

### Step 1: Halt
Stop coding. Close the active Edit intent. Name the confusion in one sentence:

> "I am unsure whether `<option A>` or `<option B>` is correct, because `<source of ambiguity>`."

If you can't write this sentence, the confusion is not yet specific enough. Instrument / read more until it becomes specific.

### Step 2: Audit sources

Check, in order:
1. `PROJECT_CHARTER.md` — does a principle resolve it?
2. `agent-workspace/constitution/invariants.md` — does an invariant?
3. The relevant T1/T2 spec — re-read carefully; search for the exact term
4. `agent-workspace/memory/decisions/` — has this been decided before?
5. Existing code for precedent — grep the pattern

If any source resolves it → proceed with that guidance, note the source in session log.

### Step 3: Branch on mode

**If `ORCH_SPAWNED=false` (interactive):**
- Ask the user. Present both options with tradeoffs. Wait.

**If `ORCH_SPAWNED=true` (autonomous):**
- Write `agent-workspace/memory/decisions/NNN-<slug>.md` with:
  - Context (the confusion sentence)
  - Options A and B
  - Decision (charter-aligned choice)
  - Rationale (which principle / invariant)
  - Reversibility (how hard to undo if wrong)
- Proceed with the decision.
- Mark the decision as `confidence: tentative` in the file — next human review should verify.

### Step 4: Timeboxed resolution

If Step 2 reveals that sources genuinely conflict OR Step 3 produces a decision with `reversibility: hard`:

→ STOP. Write `agent-workspace/memory/escalation.md`:
```markdown
# Escalation: <confusion title>

## The Conflict
<sentence>

## Sources Examined
- Charter principle P-N says: ...
- Invariant I-M says: ...
- Spec T2-XXX § B.Y says: ...
- These three do not align.

## Question for Human
<specific question, not "what should I do">

## If I had to pick right now
Option [A|B], because [smallest loss if wrong].

## Reversibility
[easy | medium | hard]
```

Then HALT. Do not proceed with hard-reversibility guesses.

## Rationalization Counters

**Pressure**: "This slows us down; user wants velocity."
**Correct response**: Velocity is a function of rework rate. Confusion proceeded-past = future rework. The 5-minute halt pays for itself within the same session.

**Pressure**: "I pick option A 90% confidently, good enough."
**Correct response**: 90% confidence WITHOUT documenting the 10% is silent drift. Write the decision note with confidence level; that's the 10% insurance.

**Pressure**: "The charter resolves it, I don't need to document."
**Correct response**: If the charter clearly resolved it, you wouldn't be confused. Document the confusion → resolution step so next time it's faster.

**Pressure**: "Autonomous mode means I should just decide, not document."
**Correct response**: Autonomous means no interactive Q&A, not no documentation. Documentation is how autonomous mode remains auditable. The decisions log IS the trail.

## Anti-pattern: "confidently wrong" drift

The most expensive form of this protocol's absence:

1. Agent is confused about ownership of feature X.
2. Picks module A silently.
3. Builds 4 tasks on that foundation.
4. Reviewer notices: should have been module B.
5. Rework = 4 tasks.

vs. with protocol:
1. Agent flags confusion at task 1.
2. Decision log written: "module A because …"
3. Reviewer sees decision log, either accepts or challenges at task 1.
4. Rework = 1 task max.

## Do NOT

- Guess silently
- Use TODO comments as a substitute for decision logs
- Proceed with hard-reversibility guesses without escalation
- Assume the next agent will sort it out

## Output

One of:
- Proceed with sourced decision (log in session)
- Decision written to `decisions/NNN-*.md`, proceed
- Escalation written, HALT
