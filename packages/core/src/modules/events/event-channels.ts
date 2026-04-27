/**
 * Event channel definitions for the Orch internal event bus.
 *
 * Every channel name is a string constant grouped by domain category.
 * The payload registry maps each channel to its typed payload shape,
 * enabling fully type-safe emit/on calls via EventBusService.
 *
 * Naming convention: `{category}.{action}` — lowercase, hyphens for multi-word.
 *
 * I-2: No project-specific channel names. All channels are generic.
 * I-14: Pure TypeScript — no NestJS imports.
 */

import type { Profile } from '../../domain/profile.js';
import type { Session } from '../../domain/session.js';
import type { QueueItem } from '../../domain/queue-item.js';
import type { ProfileValidationError } from '../../domain/errors.js';
import type {
  SessionContextNearLimitPayload,
  SessionForceHandoffPayload,
} from '../context-budget/context-budget.types.js';
import type { HandoffContext, RenderedPrompt } from '../handoff/types.js';

// ── Channel constants ─────────────────────────────────────────────────────────

/** Typed event channel name map, grouped by domain category. */
export const EVENT_CHANNELS = {
  project: {
    registered: 'project.registered',
    updated: 'project.updated',
    removed: 'project.removed',
    invalid: 'project.invalid',
  },
  queue: {
    enqueued: 'queue.enqueued',
    started: 'queue.started',
    completed: 'queue.completed',
    failed: 'queue.failed',
    quarantined: 'queue.quarantined',
    paused: 'queue.paused',
    resumed: 'queue.resumed',
    /**
     * Emitted when a spawn is deferred because the project has reached
     * `profile.maxConcurrentSessions`. The caller should retry after one
     * of the active sessions ends.
     *
     * Phase 5.3.8 — SC-8.
     */
    dispatchDeferred: 'queue.dispatch.deferred',
  },
  session: {
    started: 'session.started',
    stopped: 'session.stopped',
    ended: 'session.ended',
    rateLimited: 'session.rate-limited',
    contextFull: 'session.context-full',
    failed: 'session.failed',
    /** Watchdog: session inactive past heartbeat timeout — warning emitted (1.9c). */
    warned: 'session.warned',
    /** Watchdog: session hard-killed after ceiling or warn+grace exhausted (1.9c). */
    killed: 'session.killed',
    /**
     * Context budget near-limit warning (Task 3.2).
     *
     * Emitted exactly once per session when accumulated input tokens first crosses
     * the warnAtTokens threshold. Informational — does not trigger handoff.
     */
    contextNearLimit: 'session.context-near-limit',
    /**
     * Force handoff trigger (Task 3.2).
     *
     * Emitted exactly once per session when accumulated input tokens first crosses
     * the forceHandoffAtTokens threshold. Task 3.3 subscribes to this and initiates
     * graceful session end + spawn of successor session.
     */
    forceHandoff: 'session.force-handoff',
    /**
     * Handoff pending — operator confirmation required (Task 3.3).
     *
     * Emitted when `profile.autoHandoff = false` (the default). SessionManager
     * pauses autonomous termination and waits for the operator to confirm via
     * Telegram or Web UI. Preserves the I-6 destructive-action gate.
     */
    handoffPending: 'session.handoff-pending',
    /**
     * Handoff context built and persisted to DB (Task 3.6).
     *
     * Emitted by HandoffOrchestrator after HandoffContextBuilder.build() + DB persist
     * complete successfully inside the same transaction as the session-end commit.
     * Contains the handoff context and rendered prompt text.
     */
    handoffPrepared: 'session.handoff-prepared',
    /**
     * Successor session spawned with the handoff seedPrompt (Task 3.6).
     *
     * Emitted by HandoffOrchestrator after the next session is enqueued (auto_handoff=false)
     * or directly spawned (auto_handoff=true) with the rendered seed prompt prepended.
     */
    handoffApplied: 'session.handoff-applied',
  },
  hook: {
    received: 'hook.received',
    deduped: 'hook.deduped',
    invalid: 'hook.invalid',
  },
  tool: {
    /**
     * Emitted when a PreToolUse hook returns `decision=deny`.
     * Phase 5.3.5 — SC-12. SessionManager subscribes and suppresses writeStdin.
     */
    denied: 'tool.denied',
  },
  runtime: {
    spawnRequested: 'runtime.spawn-requested',
    spawnFailed: 'runtime.spawn-failed',
    terminated: 'runtime.terminated',
  },
  /**
   * rqueue.* — in-memory per-session FIFO (RequestQueue, Task 1.9b).
   *
   * Named `rqueue` (request-queue) to avoid collision with `queue.*` channels
   * which map to DB-backed QueueItem payloads from Task 1.8.
   */
  rqueue: {
    enqueued: 'rqueue.enqueued',
    started: 'rqueue.started',
    completed: 'rqueue.completed',
    failed: 'rqueue.failed',
    cancelled: 'rqueue.cancelled',
  },

  /**
   * scheduler.* — cron-driven plan enqueue events (Task 3.7).
   *
   * I-2: No project-specific channel names.
   * I-11: Every state change (tick fired, invalid cron) emits a channel event.
   */
  scheduler: {
    /** Emitted on each successful cron tick → QueueService.enqueue() call. */
    tickFired: 'scheduler.tick-fired',
    /** Emitted when a cron expression slips past schema validation at runtime. */
    cronInvalid: 'scheduler.cron-invalid',
  },
} as const;

/** Flattened union of all valid event channel string values. */
export type EventChannel =
  | (typeof EVENT_CHANNELS.project)[keyof typeof EVENT_CHANNELS.project]
  | (typeof EVENT_CHANNELS.queue)[keyof typeof EVENT_CHANNELS.queue]
  | (typeof EVENT_CHANNELS.session)[keyof typeof EVENT_CHANNELS.session]
  | (typeof EVENT_CHANNELS.hook)[keyof typeof EVENT_CHANNELS.hook]
  | (typeof EVENT_CHANNELS.runtime)[keyof typeof EVENT_CHANNELS.runtime]
  | (typeof EVENT_CHANNELS.rqueue)[keyof typeof EVENT_CHANNELS.rqueue]
  | (typeof EVENT_CHANNELS.scheduler)[keyof typeof EVENT_CHANNELS.scheduler]
  | (typeof EVENT_CHANNELS.tool)[keyof typeof EVENT_CHANNELS.tool];
// NOTE: EventChannel is derived from EVENT_CHANNELS via keyof — adding new keys
// to EVENT_CHANNELS.session automatically expands EventChannel. No manual union
// update needed for session.warned and session.killed.

// ── Payload registry ──────────────────────────────────────────────────────────

/**
 * Maps each event channel to its typed payload shape.
 *
 * Callers MUST use a channel from EVENT_CHANNELS as the key to get
 * compile-time payload narrowing in EventBusService.emit/on.
 */
export interface EventPayloadMap {
  // project.*
  'project.registered': { project: Profile };
  'project.updated': { project: Profile; previous: Profile };
  'project.removed': { projectId: string };
  'project.invalid': { filePath: string; error: ProfileValidationError };

  // queue.*
  'queue.enqueued': { item: QueueItem };
  'queue.started': { item: QueueItem };
  'queue.completed': { item: QueueItem };
  'queue.failed': { item: QueueItem; error: Error };
  'queue.quarantined': { item: QueueItem; error: Error };
  'queue.paused': { item: QueueItem };
  'queue.resumed': { item: QueueItem };
  /** SC-8: emitted when dispatch deferred due to maxConcurrentSessions cap. */
  'queue.dispatch.deferred': {
    projectId: string;
    activeCount: number;
    cap: number;
  };

  // session.*
  'session.started': { session: Session };
  'session.stopped': { session: Session; isError: boolean };
  'session.ended': { session: Session; endReason?: string };
  'session.rate-limited': { session: Session; retryAfterSecs?: number };
  'session.context-full': { session: Session };
  'session.failed': { session: Session; error: Error };
  /** Watchdog soft-warn: session inactive past heartbeat timeout. (1.9c) */
  'session.warned': { sessionId: string; reason: string };
  /** Watchdog hard-kill: session terminated by watchdog. (1.9c) */
  'session.killed': { sessionId: string; reason: string };
  /** Context budget near-limit warning (Task 3.2). */
  'session.context-near-limit': SessionContextNearLimitPayload;
  /** Force handoff trigger (Task 3.2). */
  'session.force-handoff': SessionForceHandoffPayload;
  /**
   * Handoff pending — operator confirmation required (Task 3.3).
   *
   * Emitted when auto_handoff=false; operator must click confirm to allow
   * graceful termination. Preserves I-6 destructive-action gate.
   */
  'session.handoff-pending': {
    sessionKey: string;
    sessionId: string;
    projectId: string | undefined;
    currentTokens: number;
    [key: string]: unknown;
  };
  /**
   * Handoff context built and persisted (Task 3.6).
   *
   * Emitted after HandoffContextBuilder.build() + DB persist complete.
   * Contains the persisted handoff record id, the context, and the rendered prompt.
   */
  'session.handoff-prepared': {
    handoffId: string;
    sessionId: string;
    projectId: string;
    context: HandoffContext;
    rendered: RenderedPrompt;
  };
  /**
   * Successor session spawned / enqueued with seedPrompt (Task 3.6).
   *
   * Emitted after the next session is enqueued or directly spawned.
   * `autoHandoff=false` → enqueued (paused for operator confirm); `true` → spawned.
   */
  'session.handoff-applied': {
    handoffId: string;
    sessionId: string;
    projectId: string;
    autoHandoff: boolean;
    seedPromptLength: number;
  };

  // hook.*
  'hook.received': { event: string; sessionId: string; timestamp: string };
  'hook.deduped': { event: string; sessionId: string; dedupKey: string };
  'hook.invalid': { event: string; error: Error };

  // tool.*
  /** Phase 5.3.5 — SC-12: PreToolUse hook returned decision=deny. */
  'tool.denied': {
    sessionId: string;
    toolName: string;
    message: string | undefined;
  };

  // runtime.*
  'runtime.spawn-requested': { projectId: string; sessionKey: string };
  'runtime.spawn-failed': {
    projectId: string;
    sessionKey: string;
    error: Error;
  };
  'runtime.terminated': {
    projectId: string;
    sessionKey: string;
    reason: string;
  };

  // rqueue.* — in-memory per-session FIFO (RequestQueue, Task 1.9b)
  'rqueue.enqueued': { sessionKey: string; queueDepth: number };
  'rqueue.started': { sessionKey: string };
  'rqueue.completed': { sessionKey: string };
  'rqueue.failed': { sessionKey: string; error: Error };
  'rqueue.cancelled': { sessionKey: string; rejectedCount: number };

  // scheduler.* — cron-driven plan enqueue events (Task 3.7)

  /**
   * Emitted on each successful cron tick → QueueService.enqueue() call.
   *
   * I-11: emitted on every successful tick state change.
   * nextRunAt is optional: computed from ScheduledTask.getNextRun() (node-cron v4).
   */
  'scheduler.tick-fired': {
    projectId: string;
    cronName: string;
    expression: string;
    firedAt: string; // ISO-8601
    nextRunAt?: string; // ISO-8601, optional
    itemId: string; // QueueItem id from successful enqueue
  };

  /**
   * Emitted when a cron expression is invalid at runtime (defense-in-depth).
   *
   * I-11: emitted on every invalid-cron state change.
   * The schema's refine() should catch this first; this is the runtime escape hatch.
   */
  'scheduler.cron-invalid': {
    projectId: string;
    cronName: string;
    expression: string;
    reason: string;
  };
}
