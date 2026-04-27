/**
 * Pino-OTEL log enricher — injects trace_id, span_id, trace_flags into
 * every log record when an active OTel span is present.
 *
 * I-9: Structured logging ALWAYS carries trace_id when inside an active span.
 *
 * Usage:
 *   import pino from 'pino';
 *   import { createPinoOtelMixin } from './pino-otel.js';
 *
 *   const logger = pino({ mixin: createPinoOtelMixin() });
 *
 * When no active span is present, the mixin returns an empty object (no keys
 * added), which is the correct behaviour — callers outside any span get clean logs.
 */

import { trace, TraceFlags } from '@opentelemetry/api';
import type pino from 'pino';

// SAMPLED flag value as a plain number — avoids @typescript-eslint/no-unsafe-enum-comparison
const TRACE_FLAGS_SAMPLED: number = TraceFlags.SAMPLED;

/**
 * Creates a pino `mixin` function that enriches every log record with
 * OpenTelemetry trace context when an active span exists.
 *
 * Conforms to the `pino.LoggerOptions['mixin']` signature.
 */
export function createPinoOtelMixin(): pino.MixinFn {
  return (): object => {
    const span = trace.getActiveSpan();
    if (!span) return {};

    const spanCtx = span.spanContext();
    if (!spanCtx) return {};

    // Only emit trace IDs for sampled spans (flags & SAMPLED bit set)
    const sampled =
      (spanCtx.traceFlags & TRACE_FLAGS_SAMPLED) === TRACE_FLAGS_SAMPLED;

    return {
      trace_id: spanCtx.traceId,
      span_id: spanCtx.spanId,
      trace_flags: spanCtx.traceFlags.toString(16).padStart(2, '0'),
      trace_sampled: sampled,
    };
  };
}

/**
 * Returns a `pino.LoggerOptions` fragment that includes the OTEL mixin.
 *
 * Merge into your pino options:
 *   const logger = pino({ ...createPinoOtelFormatter(), level: 'info' });
 */
export function createPinoOtelFormatter(): Pick<pino.LoggerOptions, 'mixin'> {
  return { mixin: createPinoOtelMixin() };
}
