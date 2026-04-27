/**
 * Jest shim for @orch/shared.
 *
 * ts-jest cannot process files outside the project rootDir (src/). This shim
 * lives inside src/ and re-exports the required symbols from @orch/shared's
 * TypeScript source, which ts-jest CAN process because they are under a
 * configured transform path.
 *
 * In production (tsc build), @orch/shared is resolved via pnpm workspace
 * symlink. This shim is only used by Jest via moduleNameMapper.
 *
 * DO NOT add NestJS imports here (I-14). DO NOT add project-specific code.
 */

// Re-export from the zod schemas directly — inline definitions that mirror
// @orch/shared's event-types.ts and sse-envelope.ts.

import { z } from 'zod';

/** All SSE event type names emitted by the Orch core daemon (mirrors @orch/shared). */
export const ALL_EVENT_TYPES = [
  'session.started',
  'session.state_changed',
  'session.ended',
  'session.rate_limited',
  'session.context_full',
  // Context budget (Task 3.2)
  'session.context_near_limit',
  'session.force_handoff',
  // Graceful session end (Task 3.3)
  'session.handoff_pending',
  'queue.enqueued',
  'queue.state_changed',
  'hook.received',
  'operator.action',
  'project.registered',
] as const;

/** Union type of all valid SSE event type names. */
export type EventType = (typeof ALL_EVENT_TYPES)[number];

/**
 * Reasons why a session ended (Task 3.3).
 *
 * Mirrors EndedReason from @orch/shared.
 */
export const EndedReason = {
  ProcessExit: 'process_exit',
  UserCancel: 'user_cancel',
  WatchdogKill: 'watchdog_kill',
  DaemonShutdown: 'daemon_shutdown',
  ContextFull: 'CONTEXT_FULL',
  ContextFullForced: 'CONTEXT_FULL_FORCED',
} as const;

export type EndedReasonValue = (typeof EndedReason)[keyof typeof EndedReason];

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

export type SseEnvelope<T = unknown> = z.infer<typeof SseEnvelopeSchema> & {
  payload: T;
};

export function parseSseEnvelope(raw: unknown): SseEnvelope | undefined {
  const result = SseEnvelopeSchema.safeParse(raw);
  if (!result.success) {
    return undefined;
  }
  return result.data;
}
