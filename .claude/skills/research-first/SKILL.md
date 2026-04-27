---
name: research-first
description: Use when touching an external API, library, or runtime pattern that is unfamiliar to this codebase — especially subprocess patterns, hook contracts, OTEL propagation, SQLite WAL concerns, Grammy middleware. Blocks Write/Edit until research artifact exists.
tools: [Read, Bash, WebFetch, Glob, Grep]
archetype: discipline
model: sonnet
---

# Research-First

## When to invoke

- About to Edit/Write code that integrates with an external dependency NOT already represented in `packages/*` with working patterns
- About to pick a library (adding to package.json)
- About to design a subprocess/hook contract without a clear precedent in `agent-workspace/research/`
- User asks "how should we do X" where X touches external behavior

## Red Flags — STOP if you catch yourself thinking

- "I remember how this library works" → memory is stale, verify
- "Claude trained on this, probably still accurate" → may be 2+ years out of date
- "The README on GitHub probably shows it" → probably, but *did* you open it?
- "I'll just try it and see if it works" → research-before-trial, not trial-and-error

## Block condition

Do NOT call Edit, Write, or Bash-that-modifies-repo until one of:

1. An existing `agent-workspace/research/<topic>.md` covers the dependency at sufficient depth
2. You have produced such a file in the current session
3. User has explicitly waived research (e.g., "skip research, just try it")

## The Ritual

### Step 1: Grep codebase for prior art
```bash
grep -rn "<library-name>" packages/
grep -rn "<integration-keyword>" examples/
ls agent-workspace/research/
```

Already wired? Use the existing pattern. Skip the rest.

### Step 2: Open the docs
- Official docs home page
- API reference for the exact method/class you'll call
- Changelog: note version currently installed vs latest
- Known-issues / deprecation notices

Use `context7` MCP (`mcp__plugin_context7_context7__query-docs`) when available — it pulls current docs and beats web search for library reference.

### Step 3: Check Claude Code-specific constraints
For Orch-typical integrations:
- Claude Code hooks contract: https://docs.anthropic.com/claude-code/hooks
- OTEL in Claude Code: look at `CLAUDE_CODE_ENABLE_TELEMETRY` docs
- ccs resume semantics: `agent-workspace/research/ccs.md` if exists
- Grammy middleware order: grammy.dev/guide

### Step 4: Write `agent-workspace/research/<topic>.md`

Minimum sections:
```markdown
# <Topic> — Research Note

## Version
- Currently pinned: <x.y.z>
- Latest stable: <x.y.z>
- Gap / migration needed?: yes/no

## API shape
<relevant method signatures, config options we'll use>

## Known issues
- [link / summary]

## Our integration decision
- What we'll do: ...
- What we'll NOT do: ...
- Why: ref charter principle / invariant

## Borrow vs build
<do we import it, wrap it, reimplement subset?>
```

### Step 5: Link research from code comment (single line)
At the top of the integration file:
```ts
// Research: agent-workspace/research/<topic>.md
```

One line. No multi-paragraph context dump in code.

## Rationalization Counters

**Pressure**: "I've used Grammy dozens of times, research is ceremony."
**Correct response**: Your Grammy knowledge is for a different project with different middleware order. This project has I-10 (zod at boundary) and I-8 (idempotency). Research verifies constraints, not syntax.

**Pressure**: "Adding research takes 20 minutes, we'd rather ship."
**Correct response**: 20 min research saves hours of debugging integration misunderstanding. Measure rework time, not keystroke time.

**Pressure**: "The charter says 'simple', research is overhead."
**Correct response**: Simple is about code shape, not about skipping diligence. Unresearched integrations are simple-looking code that breaks in unknown ways.

## When research-first does NOT apply

- Pure internal refactors of code already integrated
- Adding tests to existing modules
- Touching files you've modified in the past 3 sessions
- User explicit waiver
