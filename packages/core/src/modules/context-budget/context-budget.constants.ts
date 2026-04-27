/**
 * context-budget.constants.ts - Attribute keys and default thresholds for
 * the context budget detector.
 *
 * I-15: The canonical source attribute for token accounting is `gen_ai.usage.input_tokens`
 * as documented in agent-workspace/constitution/invariants.md:268.
 *
 * I-1: No LLM imports. Pure constants.
 * I-14: No framework imports.
 *
 * DEFAULT_THRESHOLDS is declared in config/defaults.ts (centralisation invariant)
 * and re-exported here for convenience of context-budget module consumers.
 */

// Re-export from the centralised defaults registry (invariant: no DEFAULT_* outside
// config/defaults.ts).
export { DEFAULT_THRESHOLDS } from '../../config/defaults.js';

// ── OTEL attribute keys ────────────────────────────────────────────────────────

/**
 * OTEL semantic convention attribute for input token count.
 *
 * I-15: This exact string is the canonical token source for token accounting in Orch.
 * Claude Code's native OTEL emission populates this attribute; we only read it.
 */
export const ATTR_GEN_AI_INPUT_TOKENS = 'gen_ai.usage.input_tokens' as const;

/** OTEL attribute for output token count (I-15). */
export const ATTR_GEN_AI_OUTPUT_TOKENS = 'gen_ai.usage.output_tokens' as const;

/** OTEL attribute for cache-read token count (I-15). */
export const ATTR_GEN_AI_CACHE_READ_TOKENS =
  'gen_ai.usage.cache_read_tokens' as const;

/** OTEL attribute for model ID (I-15). */
export const ATTR_GEN_AI_REQUEST_MODEL = 'gen_ai.request.model' as const;

/** OTEL attribute for the project identifier, set by hooks-receiver on Orch-side spans. */
export const ATTR_PROJECT_ID = 'project.id' as const;

/**
 * OTEL attribute for the session key, set by Orch hooks-receiver.
 *
 * Source order for session key resolution (first present wins):
 * 1. `session.key` - set by Orch hooks-receiver on Orch-emitted spans.
 * 2. `claude.session_id` - set by Claude Code's native OTEL emission.
 * 3. Fallback: `${projectId}:${traceId}` if neither key attribute is present.
 */
export const ATTR_SESSION_KEY = 'session.key' as const;

/** OTEL attribute for the Claude Code session ID (set by CC's native OTEL emission). */
export const ATTR_CLAUDE_SESSION_ID = 'claude.session_id' as const;

/**
 * Maximum number of per-span usage samples retained per session.
 *
 * Prevents unbounded memory growth in long-running sessions.
 * 1000 LLM spans per session is well beyond normal usage in practice.
 *
 * NOTE: The 3.8 session plan (`3.8-f6-usage-chart.md`) originally specified 500.
 * The code was implemented with 1000 and deployed with that value.
 * Code is the source of truth; the plan annotation was reconciled on 2026-04-26.
 * See decisions/009-cache-read-attr-name.md for the reconciliation rationale.
 */
export const MAX_USAGE_SAMPLES = 1000 as const;
