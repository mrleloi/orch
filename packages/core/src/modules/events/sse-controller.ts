/**
 * SseController — SSE endpoint for real-time event streaming.
 *
 * Endpoint: GET /api/v1/events/stream
 *
 * Auth: BearerAuthMiddleware applied via SseModule (same pattern as ApiModule).
 *
 * Query params:
 *  - types?: comma-separated SSE EventType list (e.g. "session.started,hook.received")
 *            If omitted or invalid, defaults to all events.
 *
 * SSE wire format per event:
 *  data: {"type":"session.started","payload":{...},"ts":"...","trace_id":"..."}\n\n
 *
 * Heartbeat: `: keepalive\n\n` every 15 seconds (prevents proxy timeouts).
 *
 * OTEL span:
 *  - Started at subscribe time with attribute "sse.filter" indicating active filters.
 *  - Ended in the raw socket 'close' handler (covers both graceful + abrupt disconnect).
 *
 * Disconnect cleanup:
 *  - SseSubscription.detach() called on 'close' to remove EventBus listeners (N6).
 *
 * I-4:  @orch/telegram + @orch/web import from @orch/shared, not this controller.
 * I-9:  trace_id propagated into each SSE envelope via SseSubscription.
 * I-10: types query param validated; unknown type names are silently ignored (not 500).
 * I-14: TracingService from tracing module only; no domain NestJS imports.
 */

import {
  Controller,
  Get,
  Header,
  Logger,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { ALL_EVENT_TYPES } from '@orch/shared';
import type { EventType } from '@orch/shared';
import { EventBusService } from './event-bus.service.js';
import { SseSubscription } from './sse-subscription.js';
import { TracingService } from '../tracing/tracing.service.js';
import { BearerAuthGuard } from '../api/bearer-auth.guard.js';

@Controller('api/v1/events')
@UseGuards(BearerAuthGuard)
export class SseController {
  private readonly logger = new Logger(SseController.name);

  constructor(
    private readonly eventBus: EventBusService,
    private readonly tracing: TracingService,
  ) {}

  @Get('stream')
  @Header('Content-Type', 'text/event-stream')
  @Header('Cache-Control', 'no-cache')
  @Header('Connection', 'keep-alive')
  // eslint-disable-next-line @typescript-eslint/require-await
  async stream(
    @Query('types') types: string | undefined,
    @Req() req: FastifyRequest,
    @Res() res: FastifyReply,
  ): Promise<void> {
    // ── Parse + validate filter ─────────────────────────────────────────────
    const filter = parseTypesFilter(types);

    this.logger.log({
      msg: 'sse:subscribe',
      filter: filter !== undefined ? [...filter] : 'all',
    });

    // ── Start OTEL span ─────────────────────────────────────────────────────
    // We start the span manually (not withSpan) because the span lifetime
    // is tied to the SSE stream, not an async function scope.
    const tracer = this.tracing.getTracer('@orch/core');
    const span = tracer.startSpan('sse.subscription', {
      attributes: {
        'sse.filter': filter !== undefined ? [...filter].join(',') : 'all',
      },
    });

    // ── Set SSE response headers ────────────────────────────────────────────
    // NestJS @Header decorators set these, but we also need to tell Fastify
    // not to buffer the response body.
    res.raw.setHeader('X-Accel-Buffering', 'no');

    // ── Create + attach subscription ────────────────────────────────────────
    const subscription = new SseSubscription({
      bus: this.eventBus,
      filter,
      maxBuffer: 200,
    });

    // Wire disconnect cleanup BEFORE attach so we never miss a close event
    const onClose = (): void => {
      this.logger.log({ msg: 'sse:client-disconnected' });
      subscription.detach();
      span.end();
    };
    res.raw.on('close', onClose);

    // Attach subscription — starts listening to EventBus + heartbeat timer
    subscription.attach(res);

    // Void request reference to avoid the ESLint unused-var warning
    void req;

    // The stream stays open until the client disconnects. We do NOT call
    // res.send() — writing directly to res.raw keeps the connection open.
    // NestJS + Fastify will not finalize the response until res.raw is closed.
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Parse `?types=session.started,hook.received` into a Set<EventType>.
 *
 * Unknown type names are silently ignored (I-10: do NOT 500 on malformed input).
 * Returns undefined when types is omitted (meaning: all events pass through).
 */
function parseTypesFilter(raw: string | undefined): Set<EventType> | undefined {
  if (raw === undefined || raw.trim() === '') return undefined;

  const validTypeSet = new Set<string>(ALL_EVENT_TYPES);
  const requested = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => validTypeSet.has(s)) as EventType[];

  // If no valid types were found, pass all events (treat as unfiltered)
  if (requested.length === 0) return undefined;

  return new Set(requested);
}
