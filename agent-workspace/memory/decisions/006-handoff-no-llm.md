# Decision 006 — Handoff Builder Has Zero LLM Calls

**Date**: 2026-04-25
**Phase**: 3 (Intelligence Layer)
**Tasks**: 3.4 (architect), 3.5 (impl), 3.6 (wire-up), 3.12 (verify)
**Status**: BINDING — must not be overturned without explicit charter amendment.
**Author**: sandwich-architect (opus) under autonomous mode

---

## Decision

The Phase 3 `HandoffContextBuilder` and every file in
`packages/core/src/modules/handoff/` SHALL contain **zero LLM calls of any
kind**. No Anthropic API, no OpenAI API, no `@anthropic-ai/sdk`, no
`claude-agent-sdk`, no `ClaudeSDKClient`, no spawned `claude -p "summarise this"`
subprocess from inside the builder, no `fetch` to any LLM endpoint, no
"summary helper" that internally calls a model. Pure deterministic code only:
regex, markdown parsing, `git diff` shell-out via execa, string templating.

The builder is allowed exactly two side effects:
1. Read filesystem (session log markdown files, optionally project files for git).
2. Spawn a single `git diff --stat` subprocess via execa (deterministic shell, no model).

Everything else is in-process pure TypeScript.

---

## Why this decision is being foreclosed in writing now

Task 3.4/3.5 is the highest-risk Phase 3 task for charter violation precisely
because the temptation is rational-sounding:

> "We could just call the model once, give it the session log, and ask for
> a polished summary. It would be 50 lines instead of 300, the prompt to the
> next session would be cleaner, and the user would never know."

That argument is **rejected**, and rejected pre-emptively, for the reasons below.
This document exists so that a future implementer (3.5.a–3.5.e or 3.6) cannot
rationalise "just one little call" without knowingly contradicting a written
ruling.

---

## Reasoning (cited)

### Charter Principle 1 — daemon-dumb (PROJECT_CHARTER.md L53)

> "Daemon is dumb, workers are smart. Orchestration logic is deterministic
> code. LLM reasoning is exclusively inside Claude Code sessions it spawns.
> The daemon does NOT call Anthropic API directly."

The handoff builder lives in the daemon (`packages/core/`). Therefore the
handoff builder is "the daemon" for this clause. No exception.

### Charter Principle 10 — no feature creep into agent intelligence (PROJECT_CHARTER.md L71)

> "No feature creep into agent intelligence. Tempting to add 'smart routing',
> 'auto-planning', 'auto-review'. Resist. Those belong in Claude Code +
> project's own subagents (see stockforge pattern)."

"Auto-summarise the session log" is exactly the kind of intelligence creep
this clause names. The polished summary belongs to the next Claude Code
session reading the structured handoff context — not to the daemon producing it.

### Invariant I-1 (constitution/invariants.md)

I-1 forbids LLM imports in `packages/core/src/`. The Phase 3 verifier (Task
3.12) runs the grep `anthropic|openai|@anthropic-ai/sdk|claude-agent-sdk|ClaudeSDKClient`
across `packages/core/src/`. A handoff-builder LLM call would fail this grep
and force a recovery loop costing more tokens than the "polish" was worth.

### Karpathy P1 — Think Before Coding
### Karpathy P2 — Simplicity First (constitution/karpathy-principles.md L49–90)

> "Minimum code that solves the problem. Nothing speculative."

A regex parser + a templated renderer is ~300 lines and entirely auditable.
An LLM-summary path adds: API client, retry/backoff, token-budget management,
non-determinism in test fixtures, mock infrastructure, prompt-injection risk
on user-authored session logs, cost accounting. That is the opposite of P2.

### Anthropic ToS — Agent SDK on subscription accounts (CLAUDE.md "Orch-Specific Hard Rules")

> "No Agent SDK for subscription accounts. Spawn `claude` CLI subprocess via
> `ccs`. Reasoning: Anthropic ToS (April 2026) prohibits Agent SDK chat
> sending with subscription accounts."

Even if Principle 1 were waived (it is not), the only available LLM path on
this user's account is the CLI subprocess — and a daemon-internal CLI
subprocess used for "summarise this" is itself an Agent SDK chat-send under
the rule's intent. So the ToS layer also forecloses the workaround.

### SYNTHESIS D8 (research/SYNTHESIS.md L103–110) — earlier draft permitted L1 LLM, this decision overrides

The original Phase 0 synthesis (D8) said L1 could fire LLM calls in a
"dedicated handoff session", arguing this would be a Claude Code subprocess
and therefore not violate I-1. **This decision narrows D8.** For Phase 3
v1, even the dedicated-handoff-session L1 is **descoped**. Reasons:

1. **Auditability.** The deterministic L0+L1-regex output is fully grep-able
   in tests; an LLM-rendered prompt is not.
2. **Cost.** Every handoff doubles to "outgoing session tokens + handoff
   summary tokens + incoming session bootstrap tokens". Across N=20
   sessions/day that is ≥ 200K extra tokens/day with no operator-perceived gain.
3. **Failure modes.** A failed LLM call mid-handoff blocks the spawn of the
   next session and propagates a non-deterministic error into a deterministic
   state machine — exactly the I-11 hazard the charter codifies against.
4. **Phase 3 risk register (L483).** "Handoff builder grows an LLM call —
   HIGH (charter-breaking). Mitigation: this decision document." That row
   is closed by this file.

D8 v2 therefore reads: **L0 = `git diff --stat` collector; L1 = deterministic
markdown parser; renderer = string templating with hard cap.** No LLM in
either layer. Re-introduction of an LLM-summary path requires a charter
amendment AND a v2 ADR superseding this decision.

---

## Tradeoffs accepted

| Loss | Acceptance |
|---|---|
| Less polished prose in next-session prompt | Acceptable — next Claude session reads structured facts and produces its own polish on first turn |
| Cannot resolve "what did the operator actually mean by this decision?" | Acceptable — operator-authored session logs already capture intent in plain English; parser surfaces the relevant section verbatim |
| No deduplication / clustering of similar pending tasks | Acceptable — duplicates carry through, next session deduplicates as part of normal work |
| Handoff prompt may include stale context if log was sloppy | Acceptable — fix the log template, not the parser |

These are not bugs. They are the price of I-1, paid willingly.

---

## What this decision does NOT forbid

- Calling LLMs **inside a spawned Claude Code session** that the next session
  itself initiates after reading the deterministic handoff. (That is the
  agent's intelligence, not the daemon's.)
- A **post-v1** ADR that re-opens L1-as-LLM **inside a separate worker process
  outside `packages/core/`**, gated by a feature flag and explicit charter
  amendment. This file does not preclude that future. It precludes doing it
  in Phase 3 silently.
- Heuristic tools that look LLM-shaped but are deterministic: TF-IDF, BM25,
  classical NLP tokenisation. These stay out of scope by P2 (overkill for
  parsing markdown headings) but are not I-1 violations.

---

## Enforcement

1. **Compile-time**: no `import` from `@anthropic-ai/*`, `openai`, `langchain*`,
   `claude-agent-sdk` in `packages/core/src/modules/handoff/`. Lint rule
   `no-restricted-imports` catches this in 3.5.a.
2. **Runtime**: no `fetch` / `http.request` / `https.request` / `execa` calls
   to non-`git` binaries. The 3.5.b execa wrapper hard-codes the binary name
   to `git` (no user-provided binary string).
3. **Test-time**: 3.5.e fixture suite includes a "no-network" test that runs
   `HandoffContextBuilder.build()` against pre-checked-out fixtures with
   `nock.disableNetConnect()` (or equivalent) — any HTTP attempt fails the test.
4. **Verifier-time**: Task 3.12 grep on `packages/core/src/` is the final gate
   per phase-3-intelligence-plan.md L307.

If any of (1)–(4) becomes red in 3.5/3.6, the implementer **rolls back the
LLM call**. They do not "ask the user if it's okay this once". The decision
is binding without further consultation, per autonomous-protocol decision
rule (charter principles first, decisions log second, escalate only on
charter contradiction).

---

## Pointer to alternative if needed in v2

If a future operator decides polished prose is worth the cost, the supported
v2 path is:

1. New worker package `packages/handoff-summariser/` outside core.
2. Spawned as a separate `claude -p` subprocess by the daemon — daemon
   never calls the model directly, only invokes the CLI.
3. Output stored alongside (not replacing) the deterministic handoff context.
4. Feature flag `profile.handoff.use_llm_summary: true` (default false).
5. New ADR superseding this one with explicit rationale.

That path is not Phase 3. Anyone doing it in Phase 3 is violating this decision.

---

## Signature

This decision is final for Phase 3. Cite this file from any Phase 3 PR, plan,
or session log that mentions handoff prompt quality. Do not re-litigate.
