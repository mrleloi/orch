# Decision 009 — Cache-Read OTEL Attribute Name

**Date**: 2026-04-26
**Author**: sandwich-dev (Phase 3 close-out polish)
**Status**: ACTIVE

---

## Context

Phase 3 Task 3.8 session plan (`3.8-f6-usage-chart.md:40`) specified the OTEL canonical name
`gen_ai.usage.cache_read_input_tokens` for the cache-read token attribute. The OTel GenAI
semantic conventions (v1.26+) use `gen_ai.usage.cache_read_input_tokens` as the canonical
attribute for cache-read tokens.

However, `packages/core/src/modules/context-budget/context-budget.constants.ts` defines:

```typescript
export const ATTR_GEN_AI_CACHE_READ_TOKENS =
  'gen_ai.usage.cache_read_tokens' as const;
```

The constitution `invariants.md` I-15 lists:
```
- `gen_ai.usage.cache_read_tokens`
```

Both code and constitution align on `cache_read_tokens`. Only the 3.8 session plan cited the
OTel canonical `cache_read_input_tokens`.

---

## Options Considered

### Option A: Rename to OTel canonical (`gen_ai.usage.cache_read_input_tokens`)
- Pros: Future-proof alignment with OTel semantic conventions spec; third-party tooling
  expecting the canonical name would work out-of-the-box.
- Cons: Breaking change to any existing Orch spans already in storage; requires a production
  code + invariants.md + test change across 3+ files; high blast radius for a close-out
  polish session.

### Option B: Keep current name (`gen_ai.usage.cache_read_tokens`), amend plan annotation
- Pros: Zero production code change; code and constitution already agree; plan was the
  only stale reference; Karpathy P3 (surgical changes).
- Cons: Diverges from OTel canonical until reconciled; may confuse future tooling that
  reads raw OTEL exports.

---

## Decision

**Chosen: Option B.** Pin `gen_ai.usage.cache_read_tokens` as Orch's authoritative name.

Rationale:
1. Code and constitution (`invariants.md:273`) already agree — there is no real production
   divergence, only a stale plan annotation.
2. Claude Code's native OTEL emission (the upstream span source Orch reads) uses
   `gen_ai.usage.cache_read_tokens` in the versions tested. Changing Orch's read key
   to `cache_read_input_tokens` would silently zero out all cache-read accounting without
   a corresponding Claude Code OTEL update.
3. Karpathy P3: touching production token-accounting code in a close-out polish session
   is out of scope.

---

## Research Status

No real Claude Code OTEL span samples have been verified against the canonical OTel spec
in `agent-workspace/research/`. The assumption is that Claude Code emits `cache_read_tokens`
(shorter form) based on available Phase 3 session logs showing non-zero `cacheReadTokens`
values in the usage chart, which would be zero if the read key were wrong.

**TODO (pre-Phase 4 or when OTel GenAI spec stabilises in Claude Code)**:

Reproduction steps to verify the upstream attribute name:
1. Run a real `ccs` session with `OTEL_EXPORTER_OTLP_ENDPOINT` pointing to a Jaeger/Tempo
   instance.
2. Inspect the emitted span attributes on a `gen_ai.chat` span (or equivalent) in the
   trace UI.
3. If the attribute name is `gen_ai.usage.cache_read_input_tokens`, update:
   - `context-budget.constants.ts` `ATTR_GEN_AI_CACHE_READ_TOKENS`
   - `invariants.md` I-15 bullet
   - All callers via `grep -rn ATTR_GEN_AI_CACHE_READ_TOKENS packages/core/src/`
4. If the attribute name is `gen_ai.usage.cache_read_tokens` (as assumed), this decision
   is confirmed and the TODO can be closed.

---

## Charter Reference

- Karpathy P3: surgical changes — no production code change for a doc-only reconciliation.
- I-15: `gen_ai.usage.cache_read_tokens` is the Orch-authoritative attribute name.

## Consequences

- Enables: zero-risk close-out of the "cache_read attribute name reconciliation" carryforward.
- Precludes: automatic third-party OTel tooling compatibility until reconciliation is done.
- Reversibility: Easy — constant rename + grep-replace.

---

## I-15 Authoritative List (for reference)

Per `invariants.md:271-276`:
- `gen_ai.usage.input_tokens`
- `gen_ai.usage.output_tokens`
- `gen_ai.usage.cache_read_tokens`  ← this decision pins this name
- `gen_ai.request.model`
- `project.id`
