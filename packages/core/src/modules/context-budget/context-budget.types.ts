/**
 * context-budget.types.ts — Type definitions for the ContextBudget module.
 *
 * I-1: No LLM API imports. Pure TypeScript interfaces.
 * I-2: No project-specific names.
 * I-14: No NestJS or framework imports.
 */

// ── Core state types ──────────────────────────────────────────────────────────

/**
 * A single span-level usage sample recorded when a span ends.
 *
 * Used by the `/api/v1/sessions/:id/usage` endpoint (charter O3, F6).
 */
export interface UsageSample {
  /** ISO-8601 timestamp from span.endTime (when the LLM call ended). */
  ts: string;
  /** Input tokens from gen_ai.usage.input_tokens. */
  inputTokens: number;
  /** Output tokens from gen_ai.usage.output_tokens. */
  outputTokens: number;
  /** Cache-read tokens from gen_ai.usage.cache_read_tokens. */
  cacheReadTokens: number;
  /** Model ID from gen_ai.request.model span attribute. */
  model: string;
  /** Computed cost_usd via MODEL_PRICING table. */
  costUsd: number;
}

/**
 * Per-session running token accumulator.
 *
 * Keyed by sessionKey in ContextBudgetService.totals Map.
 */
export interface RunningTotal {
  /** Sum of gen_ai.usage.input_tokens observed across all spans for this session. */
  inputTokens: number;
  /** Sum of gen_ai.usage.output_tokens observed across all spans for this session. */
  outputTokens: number;
  /** Sum of gen_ai.usage.cache_read_tokens observed across all spans for this session. */
  cacheReadTokens: number;
  /** Wall-clock of latest span observed for this session (for diagnostics). */
  lastSeenAt: Date;
  /**
   * Set true the moment a near-limit event has been emitted; never reset.
   *
   * Existence of this flag makes emission idempotent — charter F4 graceful end
   * semantics require exactly one emission per threshold crossing per session.
   */
  nearLimitFired: boolean;
  /**
   * Set true the moment a force-handoff event has been emitted; never reset.
   */
  forceHandoffFired: boolean;
  /**
   * Resolved thresholds at the time of first observation (cached, not re-read per span).
   *
   * Caching on first observation ensures determinism: a profile hot-reload mid-session
   * does NOT shift the threshold under an in-progress session.
   */
  thresholds: ContextBudgetThresholds;
  /** projectId resolved from span attributes (may be undefined if span lacked attribute). */
  projectId: string | undefined;
  /**
   * Ordered list of usage samples, one per LLM span observed.
   *
   * Consumed by GET /api/v1/sessions/:id/usage for charting (charter O3, F6).
   * Capped at MAX_USAGE_SAMPLES to prevent unbounded memory growth.
   */
  samples: UsageSample[];
}

export interface ContextBudgetThresholds {
  /** Token count at which a near-limit warning is emitted (default: 200,000 per F4). */
  warnAtTokens: number;
  /** Token count at which a force-handoff is emitted (default: 230,000 per F4). */
  forceHandoffAtTokens: number;
}

/**
 * Usage response shape returned by GET /api/v1/sessions/:id/usage.
 *
 * Charter O3: cost queryable per project/day/session-type.
 * Charter F6: rendered as a chart in the Web UI.
 */
export interface SessionUsageResponse {
  samples: UsageSample[];
  totals: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    costUsd: number;
  };
}

// ── Event payload types ───────────────────────────────────────────────────────

/**
 * Payload for the `session.context-near-limit` EventBus event.
 *
 * Emitted exactly once per session when inputTokens first crosses warnAtTokens.
 *
 * Index signature required for EventBusService.emit() compatibility with
 * the redactLogObject(payload as Record<string, unknown>) internal call.
 */
export interface SessionContextNearLimitPayload {
  sessionKey: string;
  projectId: string | undefined;
  currentTokens: number;
  /** warnAtTokens value at firing time. */
  threshold: number;
  /** ISO-8601 timestamp. */
  ts: string;
  [key: string]: unknown;
}

/**
 * Payload for the `session.force-handoff` EventBus event.
 *
 * Emitted exactly once per session when inputTokens first crosses forceHandoffAtTokens.
 * This is the predictive trigger from token accounting, distinct from the reactive
 * `session.context-full` event (which fires when Claude Code itself reports context-full).
 *
 * Index signature required for EventBusService.emit() compatibility.
 */
export interface SessionForceHandoffPayload {
  sessionKey: string;
  projectId: string | undefined;
  currentTokens: number;
  /** forceHandoffAtTokens value at firing time. */
  threshold: number;
  /** ISO-8601 timestamp. */
  ts: string;
  [key: string]: unknown;
}
