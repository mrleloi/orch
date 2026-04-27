/**
 * event-types.ts — Exhaustive list of SSE event type names for the Orch daemon.
 *
 * I-10: consumers validate every incoming event against SseEnvelopeSchema which
 * uses this enum. Adding a new event type here is the ONLY place it needs to
 * be declared — the zod enum propagates to all consumers.
 *
 * Event naming convention: <domain>.<verb> (dot-separated, lowercase)
 */

/** All SSE event type names emitted by the Orch core daemon. */
export const ALL_EVENT_TYPES = [
  // Session lifecycle
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
  // Handoff context built + persisted (Task 3.6)
  'session.handoff_prepared',
  // Successor session spawned with seedPrompt (Task 3.6)
  'session.handoff_applied',
  // Queue
  'queue.enqueued',
  'queue.state_changed',
  // Hooks
  'hook.received',
  // Operator actions (Telegram / Web UI)
  'operator.action',
  // Project registry
  'project.registered',
] as const;

/** Union type of all valid SSE event type names. */
export type EventType = (typeof ALL_EVENT_TYPES)[number];

/**
 * Reasons why a session ended — used in `session.ended` SSE payload (Task 3.3).
 *
 * Adding new values here does NOT require changes to SseEnvelopeSchema
 * (payload is z.unknown()); the enum is for core → consumer documentation.
 */
export const EndedReason = {
  /** Normal process exit — ccs exited with code 0. */
  ProcessExit: 'process_exit',
  /** User cancelled via /cancel endpoint or Telegram command. */
  UserCancel: 'user_cancel',
  /** Watchdog hard-killed a stuck session. */
  WatchdogKill: 'watchdog_kill',
  /** Daemon is shutting down (SIGTERM received). */
  DaemonShutdown: 'daemon_shutdown',
  /**
   * Context budget exhausted — graceful end via slash-command write + hook fire.
   *
   * (Task 3.3: auto_handoff path where SessionEnd hook fires within graceful_end_timeout_ms.)
   */
  ContextFull: 'CONTEXT_FULL',
  /**
   * Context budget exhausted — forced termination (SIGTERM → SIGKILL) after
   * graceful_end_timeout_ms elapsed without a SessionEnd hook firing.
   *
   * (Task 3.3: timeout escalation path.)
   */
  ContextFullForced: 'CONTEXT_FULL_FORCED',
} as const;

/** Union type of all EndedReason values. */
export type EndedReasonValue = (typeof EndedReason)[keyof typeof EndedReason];
