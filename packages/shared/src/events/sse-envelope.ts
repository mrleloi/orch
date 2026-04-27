/**
 * sse-envelope.ts — Wire schema for SSE events emitted by the Orch daemon.
 *
 * I-10: both @orch/telegram and @orch/web parse every incoming SSE event
 * through SseEnvelopeSchema. Malformed envelopes are logged + dropped, never
 * thrown (consumers are resilient to schema drift between daemon versions).
 *
 * Part B contract (exact shape):
 *   type     — z.enum(ALL_EVENT_TYPES)   — constrained to known event types
 *   payload  — z.unknown()               — per-type refinement in handler
 *   trace_id — z.string().regex(/^[0-9a-f]{32}$/).optional()
 *   span_id  — z.string().regex(/^[0-9a-f]{16}$/).optional()
 *   ts       — z.string().datetime()     — ISO-8601 with timezone
 */

import { z } from 'zod';
import { ALL_EVENT_TYPES } from './event-types.js';

export const SseEnvelopeSchema = z.object({
  type: z.enum(ALL_EVENT_TYPES),
  payload: z.unknown(),
  trace_id: z
    .string()
    .regex(/^[0-9a-f]{32}$/)
    .optional(),
  span_id: z
    .string()
    .regex(/^[0-9a-f]{16}$/)
    .optional(),
  ts: z.string().datetime(),
});

/** Typed SSE envelope. T narrows the payload field for a specific event type. */
export type SseEnvelope<T = unknown> = z.infer<typeof SseEnvelopeSchema> & {
  payload: T;
};

/**
 * Parse a raw SSE event (JSON string or object) into a typed SseEnvelope.
 * Returns undefined on failure — callers log + discard.
 */
export function parseSseEnvelope(raw: unknown): SseEnvelope | undefined {
  const result = SseEnvelopeSchema.safeParse(raw);
  if (!result.success) {
    return undefined;
  }
  return result.data as SseEnvelope;
}
