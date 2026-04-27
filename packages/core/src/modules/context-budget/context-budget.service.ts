/**
 * ContextBudgetService — per-session token accumulator + threshold event emitter.
 *
 * Responsibilities:
 *  - Maintain a per-session RunningTotal (Map<sessionKey, RunningTotal>).
 *  - On each ingestSpan(): extract input tokens + session/project identity, accumulate.
 *  - Emit `session.context-near-limit` exactly once when total crosses warnAtTokens.
 *  - Emit `session.force-handoff` exactly once when total crosses forceHandoffAtTokens.
 *  - Resolve thresholds from ProjectRegistry on first span for a session (cached).
 *
 * I-1: ZERO LLM API imports. Pure deterministic arithmetic + EventBus emission.
 * I-10: Thresholds come from profile.contextBudget (validated via ProfileSchema.safeParse).
 * I-15: Canonical source attribute is `gen_ai.usage.input_tokens` (ATTR_GEN_AI_INPUT_TOKENS).
 *
 * Charter P1/P2: No LLM calls, no async, no I/O. O(1) per span.
 */

import { Injectable, Logger } from '@nestjs/common';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { EventBusService } from '../events/event-bus.service.js';
import { EVENT_CHANNELS } from '../events/event-channels.js';
import { ProjectRegistryService } from '../project-registry/project-registry.service.js';
import type {
  RunningTotal,
  ContextBudgetThresholds,
} from './context-budget.types.js';
import {
  ATTR_GEN_AI_INPUT_TOKENS,
  ATTR_GEN_AI_OUTPUT_TOKENS,
  ATTR_GEN_AI_CACHE_READ_TOKENS,
  ATTR_GEN_AI_REQUEST_MODEL,
  ATTR_PROJECT_ID,
  ATTR_SESSION_KEY,
  ATTR_CLAUDE_SESSION_ID,
  DEFAULT_THRESHOLDS,
  MAX_USAGE_SAMPLES,
} from './context-budget.constants.js';
import { calculateCostUsd } from '../../config/model-pricing.js';
import type {
  UsageSample,
  SessionUsageResponse,
} from './context-budget.types.js';

@Injectable()
export class ContextBudgetService {
  private readonly logger = new Logger(ContextBudgetService.name);

  /**
   * Per-session accumulator.
   *
   * Key: sessionKey (resolved from span attributes via source-order in A2).
   * Value: RunningTotal with thresholds cached on first observation.
   */
  private readonly totals = new Map<string, RunningTotal>();

  constructor(
    private readonly eventBus: EventBusService,
    private readonly projectRegistry: ProjectRegistryService,
  ) {}

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Ingest a single ended span. Called by ContextBudgetSpanProcessor.onEnd.
   *
   * Contract:
   *  - Pure synchronous (no async/await — SpanProcessor.onEnd must be sync).
   *  - Resilient: missing attributes → no-op (no throw).
   *  - Idempotent emission: nearLimitFired / forceHandoffFired flags ensure
   *    exactly one event per session per threshold.
   *  - Non-monotonic arrival order is handled deterministically: total always
   *    increases by the token count on the incoming span, regardless of span
   *    timestamps. We count by arrival order, not by span time.
   *  - I-1: no LLM API calls — only arithmetic on span.attributes.
   */
  ingestSpan(span: ReadableSpan): void {
    const inputTokens = this.extractInputTokens(span);
    if (inputTokens === undefined) {
      // Span has no token attribute — not an LLM span we care about. Debug only.
      this.logger.debug({
        msg: 'context-budget:span-no-tokens',
        spanName: span.name,
      });
      return;
    }

    const sessionKey = this.extractSessionKey(span);
    if (sessionKey === undefined) {
      // No session identity resolvable — drop silently per A2.
      this.logger.debug({
        msg: 'context-budget:span-no-session-key',
        spanName: span.name,
        tokens: inputTokens,
      });
      return;
    }

    const projectId = this.extractProjectId(span);

    // Get or create RunningTotal
    let total = this.totals.get(sessionKey);
    if (total === undefined) {
      const thresholds = this.resolveThresholds(projectId);
      total = {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        lastSeenAt: new Date(),
        nearLimitFired: false,
        forceHandoffFired: false,
        thresholds,
        projectId,
        samples: [],
      };
      this.totals.set(sessionKey, total);
    }

    // Extract additional attributes for usage tracking
    const outputTokens = this.extractOutputTokens(span);
    const cacheReadTokens = this.extractCacheReadTokens(span);
    const model = this.extractModel(span);

    // Accumulate
    total.inputTokens += inputTokens;
    total.outputTokens += outputTokens;
    total.cacheReadTokens += cacheReadTokens;
    total.lastSeenAt = new Date();

    // Record usage sample (FIFO ring-buffer capped at MAX_USAGE_SAMPLES per session).
    // When at capacity: evict the oldest sample (shift) then append the newest (push).
    // FIFO eviction preserves recency — the most recent MAX_USAGE_SAMPLES spans are
    // always visible in the usage chart, rather than plateauing at the first 1000.
    const costUsd = calculateCostUsd({
      modelId: model,
      inputTokens,
      outputTokens,
      cacheReadTokens,
    });
    const ts = span.endTime
      ? new Date(
          span.endTime[0] * 1000 + Math.floor(span.endTime[1] / 1_000_000),
        ).toISOString()
      : new Date().toISOString();
    const sample: UsageSample = {
      ts,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      model,
      costUsd,
    };
    if (total.samples.length >= MAX_USAGE_SAMPLES) {
      total.samples.shift(); // evict oldest
    }
    total.samples.push(sample);

    this.logger.debug({
      msg: 'context-budget:token-accumulated',
      sessionKey,
      projectId,
      addedTokens: inputTokens,
      totalTokens: total.inputTokens,
    });

    // Check near-limit threshold (idempotent)
    if (
      !total.nearLimitFired &&
      total.inputTokens >= total.thresholds.warnAtTokens
    ) {
      total.nearLimitFired = true;
      const payload = {
        sessionKey,
        projectId,
        currentTokens: total.inputTokens,
        threshold: total.thresholds.warnAtTokens,
        ts: new Date().toISOString(),
      };
      this.logger.warn({
        msg: 'context-budget:near-limit',
        sessionKey,
        currentTokens: total.inputTokens,
        threshold: total.thresholds.warnAtTokens,
      });
      this.eventBus.emit(EVENT_CHANNELS.session.contextNearLimit, payload);
    }

    // Check force-handoff threshold (idempotent)
    if (
      !total.forceHandoffFired &&
      total.inputTokens >= total.thresholds.forceHandoffAtTokens
    ) {
      total.forceHandoffFired = true;
      const payload = {
        sessionKey,
        projectId,
        currentTokens: total.inputTokens,
        threshold: total.thresholds.forceHandoffAtTokens,
        ts: new Date().toISOString(),
      };
      this.logger.warn({
        msg: 'context-budget:force-handoff',
        sessionKey,
        currentTokens: total.inputTokens,
        threshold: total.thresholds.forceHandoffAtTokens,
      });
      this.eventBus.emit(EVENT_CHANNELS.session.forceHandoff, payload);
    }
  }

  /**
   * Clear state for a session.
   *
   * Called when a session ends to free memory. Also useful in tests for isolation.
   */
  resetSession(sessionKey: string): void {
    this.totals.delete(sessionKey);
  }

  /**
   * Return a copy of the current RunningTotal for a session.
   *
   * Returns undefined if no spans have been observed for this session.
   * Returns a shallow copy — not a live reference — to prevent test pollution.
   */
  snapshot(sessionKey: string): RunningTotal | undefined {
    const total = this.totals.get(sessionKey);
    if (total === undefined) return undefined;
    return {
      ...total,
      thresholds: { ...total.thresholds },
      samples: [...total.samples],
    };
  }

  /**
   * Return aggregated usage data for a session (charter O3, F6).
   *
   * Used by GET /api/v1/sessions/:id/usage endpoint.
   * Returns null if no spans have been observed for this session.
   */
  getUsage(sessionKey: string): SessionUsageResponse | null {
    const total = this.totals.get(sessionKey);
    if (total === undefined) return null;

    const totalCostUsd = total.samples.reduce((acc, s) => acc + s.costUsd, 0);

    return {
      samples: [...total.samples],
      totals: {
        inputTokens: total.inputTokens,
        outputTokens: total.outputTokens,
        cacheReadTokens: total.cacheReadTokens,
        costUsd: totalCostUsd,
      },
    };
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Resolve thresholds for a project.
   *
   * Uses the profile's contextBudget block if available.
   * Falls back to DEFAULT_THRESHOLDS (200k/230k per charter F4).
   *
   * Thresholds are resolved ONCE per session (cached on first observation).
   * Hot-reload of the profile does NOT shift thresholds for in-progress sessions.
   * This is intentional: determinism > convenience.
   */
  private resolveThresholds(
    projectId: string | undefined,
  ): ContextBudgetThresholds {
    if (projectId === undefined) {
      return { ...DEFAULT_THRESHOLDS };
    }

    // ProjectRegistryService.getProject returns a Promise, but the service holds
    // an in-memory cache — the resolved value is synchronously available via the
    // Map.get path. We call a synchronous accessor here to preserve SpanProcessor
    // contract (onEnd must not be async).
    //
    // Implementation note: we access the cache directly via the known private field
    // name. This is a deliberate coupling to ProjectRegistryService internals,
    // justified because: (a) SpanProcessor.onEnd is synchronous by OTEL contract,
    // (b) ProjectRegistryService explicitly documents its cache field, and (c) the
    // alternative (async getProject + promise chain) would require either a lock
    // or a deferred-emission pattern that adds complexity without benefit.
    const cache = (
      this.projectRegistry as unknown as {
        cache: Map<string, { contextBudget?: ContextBudgetThresholds }>;
      }
    ).cache;

    const profile = cache.get(projectId);
    if (profile?.contextBudget !== undefined) {
      return {
        warnAtTokens: profile.contextBudget.warnAtTokens,
        forceHandoffAtTokens: profile.contextBudget.forceHandoffAtTokens,
      };
    }

    return { ...DEFAULT_THRESHOLDS };
  }

  /**
   * Extract the `gen_ai.usage.input_tokens` attribute value from a span.
   *
   * I-15: This exact attribute name is the canonical token source.
   * Returns undefined if the attribute is absent or not a positive number.
   */
  private extractInputTokens(span: ReadableSpan): number | undefined {
    const raw = span.attributes[ATTR_GEN_AI_INPUT_TOKENS];
    if (typeof raw !== 'number' || raw <= 0) {
      return undefined;
    }
    return raw;
  }

  /** Extract gen_ai.usage.output_tokens — returns 0 if absent or invalid. */
  private extractOutputTokens(span: ReadableSpan): number {
    const raw = span.attributes[ATTR_GEN_AI_OUTPUT_TOKENS];
    if (typeof raw !== 'number' || raw < 0) return 0;
    return raw;
  }

  /** Extract gen_ai.usage.cache_read_tokens — returns 0 if absent or invalid. */
  private extractCacheReadTokens(span: ReadableSpan): number {
    const raw = span.attributes[ATTR_GEN_AI_CACHE_READ_TOKENS];
    if (typeof raw !== 'number' || raw < 0) return 0;
    return raw;
  }

  /** Extract gen_ai.request.model — returns 'unknown' if absent. */
  private extractModel(span: ReadableSpan): string {
    const raw = span.attributes[ATTR_GEN_AI_REQUEST_MODEL];
    if (typeof raw !== 'string' || raw.length === 0) return 'unknown';
    return raw;
  }

  /**
   * Extract the session key using source order (per A2):
   * 1. `session.key` attribute
   * 2. `claude.session_id` attribute
   * 3. `${projectId}:${traceId}` fallback
   *
   * Returns undefined only if ALL three sources are unavailable.
   */
  private extractSessionKey(span: ReadableSpan): string | undefined {
    // Source 1: session.key (set by Orch hooks-receiver)
    const sessionKey = span.attributes[ATTR_SESSION_KEY];
    if (typeof sessionKey === 'string' && sessionKey.length > 0) {
      return sessionKey;
    }

    // Source 2: claude.session_id (set by Claude Code's native OTEL emission)
    const claudeSessionId = span.attributes[ATTR_CLAUDE_SESSION_ID];
    if (typeof claudeSessionId === 'string' && claudeSessionId.length > 0) {
      return claudeSessionId;
    }

    // Source 3: composite fallback using projectId + traceId
    const projectId = this.extractProjectId(span);
    const traceId = span.spanContext().traceId;
    if (traceId && traceId !== '0'.repeat(32)) {
      const base =
        projectId !== undefined ? `${projectId}:${traceId}` : traceId;
      return base;
    }

    return undefined;
  }

  /** Extract `project.id` attribute from span. Returns undefined if absent. */
  private extractProjectId(span: ReadableSpan): string | undefined {
    const raw = span.attributes[ATTR_PROJECT_ID];
    if (typeof raw === 'string' && raw.length > 0) {
      return raw;
    }
    return undefined;
  }
}
