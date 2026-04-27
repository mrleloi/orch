/**
 * EventBusService — type-safe wrapper over EventEmitter2 for inter-module communication.
 *
 * All inter-module communication goes through this service rather than directly
 * injecting EventEmitter2. This enforces:
 *  - Typed channels and payloads (EventPayloadMap)
 *  - Structured log on every emit (I-11: no silent transitions)
 *  - A stable public API decoupled from the underlying emitter implementation
 *
 * Usage:
 *   eventBus.emit(EVENT_CHANNELS.project.registered, { project });
 *   const unsub = eventBus.on(EVENT_CHANNELS.project.registered, (p) => { ... });
 *   unsub(); // stop listening
 */

import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { EventChannel, EventPayloadMap } from './event-channels.js';
import { redactLogObject } from '../security/redact-log-object.js';

@Injectable()
export class EventBusService {
  private readonly logger = new Logger(EventBusService.name);

  constructor(private readonly emitter: EventEmitter2) {}

  /**
   * Emit a typed event on the given channel.
   *
   * Logs a single structured line per emission (I-11: no silent state transitions).
   * The payload is summarised to a short identifier — never the full payload — to
   * avoid accidentally logging sensitive data.
   */
  emit<K extends EventChannel>(channel: K, payload: EventPayloadMap[K]): void {
    this.logger.log({
      msg: 'event:emit',
      channel,
      summary: this.summarise(channel, payload),
    });
    // Deep-redact string fields in the payload before handing to subscribers
    // so no secret ever propagates through the event bus (Fix A3).
    const redactedPayload = redactLogObject(payload) as EventPayloadMap[K];
    this.emitter.emit(channel, redactedPayload);
  }

  /**
   * Subscribe to a typed event channel.
   *
   * Returns an unsubscribe function that removes this specific listener.
   *
   * @param channel  - The event channel to subscribe to.
   * @param handler  - Callback invoked with the typed payload.
   * @returns A no-arg function that removes the listener when called.
   */
  on<K extends EventChannel>(
    channel: K,
    handler: (payload: EventPayloadMap[K]) => void | Promise<void>,
  ): () => void {
    this.emitter.on(channel, handler as (...args: unknown[]) => void);
    return () => {
      this.emitter.off(channel, handler as (...args: unknown[]) => void);
    };
  }

  /**
   * Wait for the next occurrence of a channel event.
   *
   * Resolves with the payload and automatically unsubscribes.
   * Fires at most once regardless of how many times the event fires.
   */
  once<K extends EventChannel>(channel: K): Promise<EventPayloadMap[K]> {
    return new Promise<EventPayloadMap[K]>((resolve) => {
      const handler = (payload: EventPayloadMap[K]) => {
        resolve(payload);
      };
      this.emitter.once(channel, handler as (...args: unknown[]) => void);
    });
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Produces a one-line summary string for structured logging.
   *
   * Extracts a stable identifier from well-known payload shapes without
   * logging the full payload (which may contain path info or error detail).
   */
  private summarise(channel: string, payload: unknown): string {
    if (typeof payload !== 'object' || payload === null) {
      return channel;
    }

    const p = payload as Record<string, unknown>;

    // project.*
    if (
      'project' in p &&
      typeof p['project'] === 'object' &&
      p['project'] !== null
    ) {
      const proj = p['project'] as Record<string, unknown>;
      if (typeof proj['projectId'] === 'string')
        return `projectId=${proj['projectId']}`;
    }
    if ('projectId' in p && typeof p['projectId'] === 'string') {
      return `projectId=${p['projectId']}`;
    }

    // session.*
    if (
      'session' in p &&
      typeof p['session'] === 'object' &&
      p['session'] !== null
    ) {
      const sess = p['session'] as Record<string, unknown>;
      if (typeof sess['id'] === 'string') return `sessionId=${sess['id']}`;
    }

    // queue.*
    if ('item' in p && typeof p['item'] === 'object' && p['item'] !== null) {
      const item = p['item'] as Record<string, unknown>;
      if (typeof item['id'] === 'string') return `itemId=${item['id']}`;
    }

    // hook.*
    if ('event' in p && typeof p['event'] === 'string') {
      return `event=${p['event']}`;
    }

    return channel;
  }
}
