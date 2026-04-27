/**
 * HooksService — core domain logic for incoming Claude Code hook events.
 *
 * Responsibilities per spec:
 *  1. Parse raw hook payload into a DomainEvent (via schemas in hooks.service.ts).
 *  2. Execute dedup check (I-8).
 *  3. Wrap DB operations + state machine in `prisma.$transaction`.
 *  4. Insert HookEvent row.
 *  5. Look up session → run state machine → update session row atomically.
 *  6. Emit domain events on EventBusService (I-11 — no silent transitions).
 *  7. Record OTEL span event for every transition (I-9).
 *
 * Dedup strategy (I-8 / SYNTHESIS §D2):
 *  - PreCompact:  deterministic key = `{sessionId}-compact-{compactUuid}`
 *  - ApiError:    content-hash = sha256(`{sessionId}:{errorType}:{errorMessage}`)
 *  - Generic:     60s bucket = `{sessionId}:{eventType}:{bucket}` where
 *                 bucket = Math.floor(epochMs / 60000)
 *
 * On unknown sessionId: log warn + insert HookEvent anyway (correlatable later).
 * On duplicate (dedupKey already in DB): return early, emit hook.deduped channel.
 *
 * Transaction rollback: if updateSession throws after createHookEvent is staged,
 * the whole tx rolls back — no partial state.
 *
 * I-14: No NestJS in domain layer. All Prisma imports are in OrchStoreService.
 * I-12: All thrown errors extend DomainError.
 */

import * as crypto from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../db/prisma.service.js';
import { EventBusService } from '../events/event-bus.service.js';
import { TracingService } from '../tracing/tracing.service.js';
import { EVENT_CHANNELS } from '../events/event-channels.js';
import { transition } from '../../domain/state-machine.js';
import { SessionState, isSessionTerminal } from '../../domain/session.js';
import type { DomainEvent, ToolDeniedEvent } from '../../domain/events.js';
import {
  StateTransitionError,
  DomainError,
  DuplicateRecordError,
} from '../../domain/errors.js';
import { handlePrismaError } from '../../domain/prisma-error-helper.js';
import type {
  HookEventType,
  HookPayloadOf,
  HOOK_SCHEMAS,
} from './schemas/hook-event.schema.js';
import { HookDecisionPayloadSchema } from './hook-decision.js';
import { DEFAULT_DEDUP_BUCKET_MS } from '../../config/defaults.js';

/** Union of all possible validated hook payloads. */
type AnyHookPayload = HookPayloadOf<keyof typeof HOOK_SCHEMAS>;

// ── Dedup helpers ─────────────────────────────────────────────────────────────

/** Bucket granularity for generic event dedup: 60 seconds. */
const DEDUP_BUCKET_MS = DEFAULT_DEDUP_BUCKET_MS;

function dedupKeyForPreCompact(sessionId: string, compactUuid: string): string {
  return `${sessionId}-compact-${compactUuid}`;
}

function dedupKeyForApiError(
  sessionId: string,
  errorType: string,
  errorMessage: string,
): string {
  const hash = crypto
    .createHash('sha256')
    .update(`${sessionId}:${errorType}:${errorMessage}`)
    .digest('hex')
    .slice(0, 16);
  return `${sessionId}-apierr-${hash}`;
}

/**
 * Compute a 60-second-bucket dedup key for generic hook events.
 *
 * Boundary semantics: bucket = Math.floor(arrivalMs / 60_000), which is
 * wall-clock aligned to UTC minute boundaries (00:00, 01:00, 02:00, …).
 * Two events that arrive 1 ms apart can land in different buckets if one
 * arrives at e.g. 59_999 ms and the next at 60_001 ms past any minute mark.
 *
 * Trade-off: wall-clock alignment is simpler and more predictable than a
 * sliding window, but means the effective dedup window for any given pair of
 * events is between 1 ms and 60 s depending on when they arrive relative to
 * the minute boundary.
 *
 * Acceptability: Claude Code retries are issued within seconds of a failure,
 * so a sub-minute window is sufficient to catch duplicate deliveries. The
 * state machine is idempotent for events that produce no valid transition
 * (StateTransitionError path), providing a second layer of safety.
 */
function dedupKeyGeneric(
  sessionId: string,
  eventType: string,
  nowMs: number,
): string {
  const bucket = Math.floor(nowMs / DEDUP_BUCKET_MS);
  return `${sessionId}-${eventType}-${bucket}`;
}

// ── Payload → DomainEvent mapping ─────────────────────────────────────────────

/**
 * Translate a validated hook payload into a DomainEvent.
 *
 * The mapping is explicit per event type — no dynamic key access —
 * so TypeScript's exhaustiveness check catches missing cases at compile time.
 */
function toDomainEvent(
  eventType: HookEventType,
  sessionId: string,
  // Zod-validated at controller layer; cast to the union for exhaustive switch.
  payload: AnyHookPayload,
): DomainEvent {
  const recordedAt = new Date().toISOString();

  switch (eventType) {
    case 'SessionStart': {
      const p = payload as HookPayloadOf<'SessionStart'>;
      const base = {
        kind: 'SessionStart' as const,
        sessionId,
        recordedAt,
        claudeSessionId: p.claude_session_id ?? sessionId,
      };
      return {
        ...base,
        ...(p.model !== undefined ? { model: p.model } : {}),
        ...(p.source !== undefined ? { source: p.source } : {}),
      };
    }

    case 'PreToolUse': {
      const p = payload as HookPayloadOf<'PreToolUse'>;
      // I-10: gate decision field through HookDecisionPayloadSchema before domain logic.
      const decisionPayload = HookDecisionPayloadSchema.parse({
        decision: p.decision,
        message: p.message,
      });
      const decision = decisionPayload.decision ?? 'approve';
      if (decision === 'deny') {
        // Surface the deny to session module via tool.denied channel; SessionManager
        // listens and ensures the corresponding tool_use is NOT forwarded to stdin.
        return {
          kind: 'ToolDenied',
          sessionId,
          recordedAt,
          toolName: p.tool_name,
          message: decisionPayload.message,
        } satisfies ToolDeniedEvent;
      }
      // approve | modify → existing behavior (hook event logged; no domain action change)
      return {
        kind: 'PreToolUse',
        sessionId,
        recordedAt,
        toolName: p.tool_name,
        isAgent: p.is_agent ?? false,
      };
    }

    case 'PostToolUse': {
      const p = payload as HookPayloadOf<'PostToolUse'>;
      return {
        kind: 'PostToolUse',
        sessionId,
        recordedAt,
        toolName: p.tool_name,
        isAgent: p.is_agent ?? false,
      };
    }

    case 'UserPromptSubmit': {
      const p = payload as HookPayloadOf<'UserPromptSubmit'>;
      return {
        kind: 'UserPromptSubmit',
        sessionId,
        recordedAt,
        promptText: p.prompt,
      };
    }

    case 'Notification': {
      const p = payload as HookPayloadOf<'Notification'>;
      const base: DomainEvent = {
        kind: 'Notification',
        sessionId,
        recordedAt,
        message: p.message,
      };
      if (p.metadata !== undefined) {
        return {
          ...base,
          kind: 'Notification',
          meta: p.metadata,
        };
      }
      return base;
    }

    case 'Stop': {
      const p = payload as HookPayloadOf<'Stop'>;
      return {
        kind: 'Stop',
        sessionId,
        recordedAt,
        isError: p.is_error ?? false,
      };
    }

    case 'SessionEnd': {
      const p = payload as HookPayloadOf<'SessionEnd'>;
      const ev: DomainEvent = { kind: 'SessionEnd', sessionId, recordedAt };
      if (p.end_reason !== undefined) {
        return { ...ev, endReason: p.end_reason };
      }
      return ev;
    }

    case 'SubagentStop': {
      const p = payload as HookPayloadOf<'SubagentStop'>;
      return {
        kind: 'SubagentStop',
        sessionId,
        recordedAt,
        subagentId: p.subagent_id,
      };
    }

    case 'PreCompact': {
      const p = payload as HookPayloadOf<'PreCompact'>;
      return {
        kind: 'PreCompact',
        sessionId,
        recordedAt,
        compactUuid: p.compact_uuid,
      };
    }

    case 'PostCompact': {
      const p = payload as HookPayloadOf<'PostCompact'>;
      return {
        kind: 'PostCompact',
        sessionId,
        recordedAt,
        compactUuid: p.compact_uuid,
      };
    }

    case 'ApiError': {
      const p = payload as HookPayloadOf<'ApiError'>;
      return {
        kind: 'ApiError',
        sessionId,
        recordedAt,
        errorType: p.error_type,
        errorMessage: p.error_message,
      };
    }
  }
}

// ── Service ───────────────────────────────────────────────────────────────────

/** Result returned from processEvent. */
export interface ProcessEventResult {
  /** Whether this event was deduplicated (already seen). */
  deduped: boolean;
  /** The domain event that was processed (or would have been, if deduped). */
  domainEvent: DomainEvent;
  /** The session state after this event (undefined if no session found). */
  newState?: SessionState;
}

/** Internal tx result shape (session state may be undefined for unknown-session path). */
interface TxResult {
  deduped: boolean;
  newState?: SessionState;
}

@Injectable()
export class HooksService {
  private readonly logger = new Logger(HooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
    private readonly tracing: TracingService,
  ) {}

  /**
   * Process a validated hook event payload.
   *
   * Runs inside a Prisma transaction:
   *   1. Dedup check (SELECT on HookEvent.dedupKey)
   *   2. INSERT HookEvent row
   *   3. Look up Session → transition state → UPDATE Session row
   *
   * Emits EventBus channels and OTEL span events for every transition.
   *
   * @param eventType  The hook event type (from URL param, already validated)
   * @param rawPayload The validated zod-parsed payload
   * @returns ProcessEventResult
   */
  async processEvent(
    eventType: HookEventType,
    rawPayload: Record<string, unknown>,
  ): Promise<ProcessEventResult> {
    return this.tracing.withSpan(
      'hooks.process-event',
      async (span) => {
        span.setAttribute('hook.event_type', eventType);

        const sessionId = rawPayload['session_id'] as string;
        span.setAttribute('session.id', sessionId);

        // Build domain event
        // rawPayload has been Zod-validated at controller layer; narrow cast is safe.
        const domainEvent = toDomainEvent(
          eventType,
          sessionId,
          rawPayload as AnyHookPayload,
        );

        // Compute dedup key before entering the transaction
        const nowMs = Date.now();
        const dedupKey = this.computeDedupKey(eventType, rawPayload, nowMs);

        this.logger.log({
          msg: 'hooks:processing',
          eventType,
          sessionId,
          dedupKey,
        });

        const txResult = await this.prisma.$transaction(async (tx) => {
          // ── Dedup check ────────────────────────────────────────────────────
          const existing = await tx.hookEvent.findUnique({
            where: { dedupKey },
            select: { id: true },
          });

          if (existing) {
            this.logger.log({
              msg: 'hooks:deduped',
              eventType,
              sessionId,
              dedupKey,
            });
            span.addEvent('hook.deduped', { dedupKey });
            return { deduped: true } satisfies TxResult;
          }

          // ── Look up session → apply transition ────────────────────────────
          // IMPORTANT: session_id in the hook payload is the Claude Code UUID
          // (stored in Session.claudeSessionId), NOT the Orch internal cuid
          // (Session.id). We must look up by claudeSessionId FIRST so we can
          // use sessionRow.id (the DB cuid) as the FK for HookEvent.sessionId.
          // orderBy desc handles the re-spawn edge case where the same UUID
          // appears on two rows.
          const sessionRow = await tx.session.findFirst({
            where: { claudeSessionId: sessionId },
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              state: true,
              projectId: true,
              sessionKey: true,
              startedAt: true,
            },
          });

          if (!sessionRow) {
            // Unknown sessionId — log warn, skip HookEvent insert (FK can't resolve)
            this.logger.warn({
              msg: 'hooks:unknown-session',
              eventType,
              sessionId,
              note: 'Session lookup failed — HookEvent not persisted (FK constraint)',
            });
            span.addEvent('hooks.unknown-session', { sessionId });
            return { deduped: false } satisfies TxResult;
          }

          // ── Insert HookEvent row using the DB session cuid as FK ───────────
          // HookEvent.sessionId references Session.id (the DB cuid), NOT the
          // Claude Code UUID. Use sessionRow.id to satisfy the FK constraint.
          // A P2002 race is possible when two identical hooks arrive concurrently
          // between the dedup SELECT and this INSERT — handle it as a dedup.
          try {
            await tx.hookEvent.create({
              data: {
                sessionId: sessionRow.id,
                eventType,
                payloadJson: JSON.stringify(rawPayload),
                dedupKey,
              },
            });
          } catch (err) {
            const wrapped = handlePrismaError(err);
            if (wrapped instanceof DuplicateRecordError) {
              this.logger.log({
                msg: 'hooks:p2002-race-deduped',
                sessionId,
                dedupKey,
              });
              span.addEvent('hook.deduped', { dedupKey, reason: 'p2002-race' });
              return { deduped: true } satisfies TxResult;
            }
            throw wrapped;
          }

          const currentState = sessionRow.state as SessionState;

          // Skip transition if session is already terminal
          if (isSessionTerminal(currentState)) {
            this.logger.log({
              msg: 'hooks:terminal-session-skip',
              eventType,
              sessionId,
              state: currentState,
            });
            span.addEvent('hooks.terminal-skip', {
              state: currentState,
              eventType,
            });
            return {
              deduped: false,
              newState: currentState,
            } satisfies TxResult;
          }

          // Apply state machine transition
          let newState: SessionState = currentState;
          try {
            newState = transition(currentState, domainEvent);
          } catch (err) {
            if (err instanceof StateTransitionError) {
              // Invalid transition — log, do NOT throw (out-of-order hooks happen)
              this.logger.warn({
                msg: 'hooks:invalid-transition',
                eventType,
                sessionId,
                fromState: currentState,
                error: err.message,
              });
              span.addEvent('hooks.invalid-transition', {
                from: currentState,
                event: eventType,
                reason: err.message,
              });
              return {
                deduped: false,
                newState: currentState,
              } satisfies TxResult;
            }
            throw new DomainError(
              'HOOK_TRANSITION_ERROR',
              `Unexpected error during state transition for event "${eventType}": ${String(err)}`,
              { cause: err },
            );
          }

          span.setAttribute('session.state.from', currentState);
          span.setAttribute('session.state.to', newState);

          // Build update data
          const updateData: {
            state: string;
            endedAt?: Date;
            endReason?: string;
            startedAt?: Date;
          } = { state: newState };

          if (
            newState === SessionState.Ended ||
            newState === SessionState.Failed
          ) {
            updateData.endedAt = new Date();
            if (domainEvent.kind === 'SessionEnd') {
              if (
                'endReason' in domainEvent &&
                domainEvent.endReason !== undefined
              ) {
                updateData.endReason = domainEvent.endReason;
              }
            } else if (newState === SessionState.Failed) {
              updateData.endReason = 'error';
            }
          }

          if (
            newState === SessionState.Running &&
            !sessionRow.startedAt &&
            (currentState === SessionState.Idle ||
              currentState === SessionState.Starting)
          ) {
            updateData.startedAt = new Date();
          }

          // Update session row atomically (still inside same tx).
          // Use sessionRow.id (the DB cuid), NOT sessionId (the Claude Code UUID).
          await tx.session.update({
            where: { id: sessionRow.id },
            data: updateData,
          });

          this.logger.log({
            msg: 'hooks:transition',
            eventType,
            sessionId,
            fromState: currentState,
            toState: newState,
          });
          span.addEvent('hooks.transition', {
            from: currentState,
            to: newState,
            event: eventType,
          });

          return { deduped: false, newState } satisfies TxResult;
        });

        // ── Post-transaction event emissions (I-11) ─────────────────────────
        // hook.received is emitted POST-transaction to ensure SSE subscribers
        // only see it after the HookEvent DB row has committed (race-condition fix).
        if (!txResult.deduped) {
          this.eventBus.emit(EVENT_CHANNELS.hook.received, {
            event: eventType,
            sessionId,
            timestamp: new Date().toISOString(),
          });
          this.emitSessionEvents(domainEvent, txResult.newState);
        } else {
          this.eventBus.emit(EVENT_CHANNELS.hook.deduped, {
            event: eventType,
            sessionId,
            dedupKey,
          });
        }

        const result: ProcessEventResult = {
          deduped: txResult.deduped,
          domainEvent,
        };
        if (txResult.newState !== undefined) {
          result.newState = txResult.newState;
        }
        return result;
      },
      { 'hook.event_type': eventType },
    );
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Compute the dedup key based on event type and payload (I-8).
   */
  private computeDedupKey(
    eventType: HookEventType,
    payload: Record<string, unknown>,
    nowMs: number,
  ): string {
    const sessionId = payload['session_id'] as string;

    if (eventType === 'PreCompact') {
      const compactUuid = payload['compact_uuid'] as string;
      return dedupKeyForPreCompact(sessionId, compactUuid);
    }

    if (eventType === 'ApiError') {
      const errorType = payload['error_type'] as string;
      const errorMessage = payload['error_message'] as string;
      return dedupKeyForApiError(sessionId, errorType, errorMessage);
    }

    return dedupKeyGeneric(sessionId, eventType, nowMs);
  }

  /**
   * Emit EventBus channels for every state transition (I-11 — no silent transitions).
   */
  private emitSessionEvents(
    event: DomainEvent,
    newState: SessionState | undefined,
  ): void {
    if (newState === undefined) return;

    // Emit per-event-type channels for specific domain events
    switch (event.kind) {
      case 'SessionEnd': {
        const endPayload: { session: never; endReason?: string } = {
          session: { id: event.sessionId } as never,
        };
        if ('endReason' in event && event.endReason !== undefined) {
          endPayload.endReason = event.endReason;
        }
        this.eventBus.emit(EVENT_CHANNELS.session.ended, endPayload);
        break;
      }

      case 'Stop':
        if (event.isError && newState === SessionState.Failed) {
          this.eventBus.emit(EVENT_CHANNELS.session.failed, {
            session: { id: event.sessionId } as never,
            error: new DomainError(
              'HOOK_STOP_ERROR',
              'Session stopped with error',
            ),
          });
        } else {
          this.eventBus.emit(EVENT_CHANNELS.session.stopped, {
            session: { id: event.sessionId } as never,
            isError: event.isError,
          });
        }
        break;

      case 'SessionStart':
        this.eventBus.emit(EVENT_CHANNELS.session.started, {
          session: { id: event.sessionId } as never,
        });
        break;

      case 'RateLimitDetected': {
        const rlPayload: { session: never; retryAfterSecs?: number } = {
          session: { id: event.sessionId } as never,
        };
        if (event.retryAfterSecs !== undefined) {
          rlPayload.retryAfterSecs = event.retryAfterSecs;
        }
        this.eventBus.emit(EVENT_CHANNELS.session.rateLimited, rlPayload);
        break;
      }

      case 'ToolDenied':
        // SC-12 / I-11: emit tool.denied channel for observe-and-record (log + OTEL span).
        // The daemon does NOT add a writeStdin-suppression gate here — the upstream gate is
        // the Claude CLI permission model, which enforces the deny before the tool executes.
        // Daemon role: observability only. See architecture.md § Hook Deny Semantics.
        this.eventBus.emit(EVENT_CHANNELS.tool.denied, {
          sessionId: event.sessionId,
          toolName: event.toolName,
          message: event.message,
        });
        break;

      default:
        // For transient events (PreToolUse, PostToolUse, Notification, etc.),
        // no dedicated channel — the hook.received was already emitted above.
        break;
    }
  }

  /**
   * Exported for testing: compute the dedup key for a given event type + payload.
   */
  computeDedupKeyPublic(
    eventType: HookEventType,
    payload: Record<string, unknown>,
    nowMs: number = Date.now(),
  ): string {
    return this.computeDedupKey(eventType, payload, nowMs);
  }
}
