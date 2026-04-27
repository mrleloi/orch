/**
 * SseSubscription — per-subscriber SSE bridge between EventBus and a Fastify reply.
 *
 * Responsibilities:
 *  - Subscribe to all (or filtered) EventBus channels at attach() time.
 *  - Translate EventPayloadMap payloads into SseEnvelope wire format.
 *  - Maintain a bounded queue (200 events max, drop oldest non-critical first).
 *  - Emit heartbeat `: keepalive\n\n` every 15 seconds.
 *  - Deregister all listeners on detach() (N6: no unbounded listener growth).
 *
 * Queue design:
 *  Events are appended to an internal ring-buffer (bounded queue). On each
 *  `handleEvent()` call the buffer overflow policy is applied BEFORE appending,
 *  then `flush()` drains the entire buffer to the Fastify reply. In steady-state
 *  the queue depth is 0–1; the overflow policy protects against bursts.
 *
 * Critical event types (NEVER dropped on overflow):
 *  - session.started, session.ended, session.rate_limited
 *
 * I-9:  trace_id populated from active OTEL span context when present.
 * N6:   detach() must be called on client disconnect to remove all listeners.
 */

import type { FastifyReply } from 'fastify';
import type { EventType } from '@orch/shared';
import type { EventBusService } from './event-bus.service.js';
import type { EventChannel, EventPayloadMap } from './event-channels.js';
import { context, trace } from '@opentelemetry/api';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Maximum number of events buffered per subscriber before dropping. */
export const MAX_BUFFER = 200;
const HEARTBEAT_INTERVAL_MS = 15_000;

/**
 * SSE event types that are NEVER dropped when the buffer overflows.
 * These represent critical session lifecycle transitions.
 *
 * `session.force_handoff` is critical: if it is dropped, the handoff pipeline
 * never triggers and the session silently hits the 250K hard cap (charter R-1).
 * `session.context_near_limit` is informational — droppable on overflow.
 */
export const CRITICAL_SSE_TYPES = new Set<EventType>([
  'session.started',
  'session.ended',
  'session.rate_limited',
  'session.force_handoff',
]);

// ── Channel → SSE EventType mapping ──────────────────────────────────────────

/**
 * Maps internal EventBus channel strings to SSE EventType strings.
 *
 * Most channels have an identical SSE type (dot-separated lowercase).
 * Exceptions: EventBus uses hyphens for multi-word verbs; SSE uses underscores.
 */
const CHANNEL_TO_SSE_TYPE: Partial<Record<EventChannel, EventType>> = {
  'session.started': 'session.started',
  'session.ended': 'session.ended',
  'session.rate-limited': 'session.rate_limited',
  'session.context-full': 'session.context_full',
  'session.stopped': 'session.state_changed',
  'session.failed': 'session.state_changed',
  'session.warned': 'session.state_changed',
  'session.killed': 'session.state_changed',
  // Context budget channels (Task 3.2): EventBus uses hyphens, SSE uses underscores.
  'session.context-near-limit': 'session.context_near_limit',
  'session.force-handoff': 'session.force_handoff',
  'queue.enqueued': 'queue.enqueued',
  'queue.started': 'queue.state_changed',
  'queue.completed': 'queue.state_changed',
  'queue.failed': 'queue.state_changed',
  'queue.quarantined': 'queue.state_changed',
  'queue.paused': 'queue.state_changed',
  'queue.resumed': 'queue.state_changed',
  'hook.received': 'hook.received',
  'project.registered': 'project.registered',
} as const;

/** All channels we subscribe to — derived from CHANNEL_TO_SSE_TYPE keys. */
const SUBSCRIBED_CHANNELS = Object.keys(CHANNEL_TO_SSE_TYPE) as EventChannel[];

// ── Wire envelope shape ───────────────────────────────────────────────────────

export interface WireEnvelope {
  type: EventType;
  payload: unknown;
  trace_id?: string;
  span_id?: string;
  ts: string;
}

// ── SseSubscription ───────────────────────────────────────────────────────────

export class SseSubscription {
  private readonly bus: EventBusService;
  private readonly filter: Set<EventType> | undefined;
  private readonly maxBuffer: number;

  /** Bounded queue of envelopes pending flush to the SSE stream. */
  readonly _queue: WireEnvelope[] = [];

  /** Unsubscribe functions returned by EventBusService.on(). */
  private readonly unsubs: Array<() => void> = [];

  /** Heartbeat timer handle. */
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  /** Attached reply — set on attach(), cleared on detach(). */
  private reply: FastifyReply | null = null;

  constructor(opts: {
    bus: EventBusService;
    filter?: Set<EventType> | undefined;
    maxBuffer: 200;
  }) {
    this.bus = opts.bus;
    this.filter = opts.filter;
    this.maxBuffer = opts.maxBuffer;
  }

  /**
   * Begin streaming SSE to the given Fastify reply.
   *
   * Subscribes to EventBus channels, starts the heartbeat timer,
   * and wires the response stream.
   *
   * Call detach() when the stream closes.
   */
  attach(res: FastifyReply): void {
    this.reply = res;

    // Only subscribe once — guard against duplicate attach() calls
    if (this.unsubs.length === 0) {
      for (const channel of SUBSCRIBED_CHANNELS) {
        const sseType = CHANNEL_TO_SSE_TYPE[channel];
        if (sseType === undefined) continue;

        const capturedType: EventType = sseType;

        const unsub = this.bus.on(
          channel,
          (payload: EventPayloadMap[typeof channel]) => {
            this._handleEvent(capturedType, payload);
          },
        );
        this.unsubs.push(unsub);
      }

      // Start heartbeat
      this.heartbeatTimer = setInterval(() => {
        this.sendRaw(': keepalive\n\n');
      }, HEARTBEAT_INTERVAL_MS);
    }

    // Drain any buffered events immediately
    this.flush();
  }

  /**
   * Stop streaming. Removes all EventBus listeners and clears the heartbeat timer.
   *
   * MUST be called on client close (res.raw.on('close', ...)) to prevent
   * N6: unbounded listener accumulation in EventBusService.
   */
  detach(): void {
    // Stop heartbeat
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    // Remove all EventBus listeners
    for (const unsub of this.unsubs) {
      unsub();
    }
    this.unsubs.length = 0;

    this.reply = null;
  }

  // ── Internal (exported for testing) ──────────────────────────────────────────

  /**
   * Handle an inbound EventBus event: apply filter, enqueue with overflow policy, flush.
   *
   * Exported as _handleEvent (underscore prefix = internal/test-only) so tests can
   * directly call it without needing to go through the EventBus subscription path.
   */
  _handleEvent(sseType: EventType, payload: unknown): void {
    // Apply type filter if set
    if (this.filter !== undefined && !this.filter.has(sseType)) {
      return;
    }

    // Build envelope
    const envelope: WireEnvelope = {
      type: sseType,
      payload,
      ts: new Date().toISOString(),
      ...this.extractTraceIds(),
    };

    // Overflow policy: drop oldest non-critical before appending
    if (this._queue.length >= this.maxBuffer) {
      this.dropOldestNonCritical();
    }
    // If still full after dropping (all events are critical):
    //  - Critical new event: evict oldest (even critical) as last resort
    //  - Non-critical new event: discard
    if (this._queue.length >= this.maxBuffer) {
      if (!CRITICAL_SSE_TYPES.has(sseType)) {
        return; // drop this non-critical event — buffer full of criticals
      }
      // Critical event: evict oldest regardless
      this._queue.shift();
    }

    this._queue.push(envelope);
    this.flush();
  }

  /**
   * Drop the oldest non-critical event from the queue.
   * No-op if no non-critical event exists.
   */
  private dropOldestNonCritical(): void {
    const idx = this._queue.findIndex((e) => !CRITICAL_SSE_TYPES.has(e.type));
    if (idx !== -1) {
      this._queue.splice(idx, 1);
    }
  }

  /** Flush all queued envelopes to the response stream. */
  private flush(): void {
    if (this.reply === null) return;

    while (this._queue.length > 0) {
      const envelope = this._queue.shift()!;
      const line = `data: ${JSON.stringify(envelope)}\n\n`;
      this.sendRaw(line);
    }
  }

  /** Write a raw string to the response stream. */
  private sendRaw(data: string): void {
    if (this.reply === null) return;
    try {
      this.reply.raw.write(data);
    } catch {
      // Client disconnected mid-write — detach will clean up
    }
  }

  /**
   * Extract trace_id and span_id from the current OTEL context (I-9).
   * Returns an empty object if no active span is present.
   */
  private extractTraceIds(): { trace_id?: string; span_id?: string } {
    const span = trace.getSpan(context.active());
    if (span === undefined) return {};

    const ctx = span.spanContext();
    // OTEL returns '00000000...' for invalid contexts
    if (!trace.isSpanContextValid(ctx)) return {};

    return {
      trace_id: ctx.traceId,
      span_id: ctx.spanId,
    };
  }
}
