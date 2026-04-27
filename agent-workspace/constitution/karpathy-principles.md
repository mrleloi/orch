# Karpathy Principles

> Source: Distilled from Andrej Karpathy's observations on LLM coding pitfalls.
> Inherited from StockForge project, where these were codified from 51+ real sessions.
> Adopted: Charter v1.0

These four principles apply to every session. They address specific LLM failure modes.

---

## P1: Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

### What this prevents
- Silent picking of one interpretation when ambiguity exists
- Hidden confusion that leads to wrong-direction work
- Missing critical tradeoffs

### What to do (normal mode)
- State assumptions explicitly — "I'm assuming X, Y, Z. If any is wrong, correct me."
- Present multiple interpretations when task is ambiguous
- Push back when warranted
- Stop when confused

### What to do (autonomous mode)
- State assumptions in session log, don't ask user
- Pick interpretation via decision rules (charter principles first), document in `decisions/`
- Only STOP if charter contradiction (STOP-3)

### Anti-pattern
```
Task: "Add queue persistence"
Agent: *immediately picks Redis without considering SQLite*
```

### Correct pattern (autonomous)
```
Task: "Add queue persistence"
Agent: States in session log:
- "Assumption: single-user, single-machine, no distributed requirement → SQLite"
- "Considered: Redis (rejected: extra dependency, overkill for scale)"
- "Considered: JSON file (rejected: no transactions, concurrency unsafe)"
Proceeds with SQLite via Prisma.
```

---

## P2: Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

### What this prevents
- Overengineering — bloated abstractions for one-time use
- Speculative flexibility — configurability nobody asked for
- Defensive code for impossible scenarios

### What to do
- No features beyond what SPEC says
- No abstractions for single-use code
- No "flexibility" or "configurability" not in SPEC
- No error handling for impossible scenarios
- If 200 lines could be 50, rewrite it

### The test
Would a senior engineer look at this and say "this is overcomplicated"? If yes, simplify.

### Anti-pattern
```typescript
// SPEC asked: "parse profile.yaml"

class ProfileParserFactory {
  private strategies: Map<string, IProfileParserStrategy>;
  private config: ProfileParserConfig;
  constructor(config: ProfileParserConfig) { /* 200 lines */ }
}
```

### Correct pattern
```typescript
// SPEC asked: "parse profile.yaml"

import { parse } from 'yaml';
import { profileSchema } from './profile.schema';

export function loadProfile(path: string): Profile {
  const raw = readFileSync(path, 'utf-8');
  return profileSchema.parse(parse(raw));
}
```

---

## P3: Surgical Changes

**Touch only what you must. Clean up only your own mess.**

### What this prevents
- "Drive-by refactoring" not requested
- Silent formatting changes that pollute diffs
- Style drift from touching adjacent code

### What to do
- Don't "improve" adjacent code, comments, or formatting
- Don't refactor things that aren't broken
- Match existing style, even if you'd do it differently
- If you notice unrelated dead code, mention it in session log — don't delete it

### The test
Every changed line should trace directly to the current task.

---

## P4: Goal-Driven Execution

**Define success criteria. Loop until verified.**

### What this prevents
- Unclear "done" state
- Imperative instructions that hide the real goal
- Inability to verify work independently

### Transform imperative → verifiable

| Instead of... | Transform to... |
|---|---|
| "Implement queue" | "`queue.add()` persists to SQLite; `queue.next()` returns item atomically; test 100 concurrent adds has no duplicates" |
| "Add telegram bot" | "Grammy bot responds to `/status` within 2 seconds; unknown user is rejected with 403; passes auth middleware tests" |
| "Make it work" | "All 4 success criteria in SPEC Part B pass" |

### The Karpathy insight

> "LLMs are exceptionally good at looping until they meet specific goals. 
> Don't tell it what to do — give it success criteria and watch it go."

In autonomous mode, this is your superpower. Strong success criteria = you can execute without user check-ins. Weak criteria = you waste tokens guessing.

---

## How to Know These Are Working

You'll see:
- **Fewer unnecessary changes in diffs** — only requested changes appear
- **Fewer rewrites due to overcomplication** — code is simple the first time
- **Session logs explain decisions clearly** — assumptions surfaced, not hidden
- **Independent execution** — no hand-holding needed
- **Clean git log** — each commit traces to one task

---

## When These Principles Conflict

If you must choose:
1. **P1 over P4** — if genuinely confused about charter-level ambiguity, STOP (STOP-3). Don't loop on wrong goal.
2. **P2 over P3** — if existing code is simple-but-wrong AND task is substantial, P2 wins; rewrite carefully.
3. **P3 over P2** — don't let "simplicity" justify rewriting unrelated code.
4. **P1 over P2** — don't assume simple solution if task is genuinely ambiguous.

When two principles both apply, err toward:
- Documenting assumption rather than hiding it (P1)
- Writing less rather than more (P2)
- Changing less rather than more (P3)
- Making success criteria explicit (P4)
