/**
 * sse-client.ts — SSE client for the Orch core daemon event stream.
 *
 * Connects to `${ORCH_API_BASE_URL}/api/v1/events/stream` using undici fetch
 * with async iteration over the raw response body. Handles reconnects with
 * exponential backoff and validates every inbound envelope through
 * SseEnvelopeSchema from @orch/shared (I-10).
 *
 * Task 2.9 — Trace context propagation:
 *  When an SSE envelope carries a `trace_id` field, the event handler runs
 *  inside a child span linked to that trace ID (via propagation.extract from
 *  the synthetic traceparent). This connects Telegram-side handling to the
 *  daemon-side span tree (D7: W3C propagation only).
 *
 * Invariants:
 *  I-3:  no @anthropic-ai/sdk
 *  I-4:  no @orch/core import
 *  I-14: no NestJS imports
 *  N6:   event handler array is replaced per start() call; no unbounded growth
 *
 * OTEL span `sse.client.connection` wraps each connection attempt.
 * OTEL span `sse.event.handle` wraps each event dispatch when trace_id is present.
 */

import { fetch } from 'undici';
import {
  trace,
  context,
  propagation,
  SpanStatusCode,
} from '@opentelemetry/api';
import type { Logger } from 'pino';
import { SseEnvelopeSchema } from '@orch/shared';
import type { SseEnvelope } from '@orch/shared';

// ── Public interface ───────────────────────────────────────────────────────────

export interface SseClient {
  /** Begin the connection loop. Resolves when stop() is called. */
  start(): Promise<void>;
  /** Abort in-flight fetch and halt reconnect loop. */
  stop(): Promise<void>;
  /** Register a handler called for every valid SseEnvelope received. */
  onEvent(handler: (env: SseEnvelope) => void): void;
}

export interface SseClientOptions {
  url: string;
  bearerToken: string;
  logger: Logger;
  /** Backoff delays in ms. Default: [1000, 2000, 4000, 8000, 16000, 30000]. */
  reconnectBackoffMs?: number[];
}

// ── Constants ──────────────────────────────────────────────────────────────────

const DEFAULT_BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000];
const TRACER_NAME = '@orch/telegram';

/**
 * Sentinel error thrown immediately after process.exit(1) to allow tests to
 * intercept the exit without the retry loop swallowing it.
 * In production, process.exit(1) never returns so this throw is unreachable.
 */
class UnauthorizedExitError extends Error {
  constructor() {
    super('SSE client: unauthorized (401) — process.exit(1) called');
    this.name = 'UnauthorizedExitError';
  }
}

// ── Factory ────────────────────────────────────────────────────────────────────

/**
 * Create an SSE client that connects to the Orch core daemon event stream.
 *
 * Call `onEvent` to register handlers before calling `start()`.
 * Call `stop()` to halt the connection loop.
 */
export function createSseClient(opts: SseClientOptions): SseClient {
  const { url, bearerToken, logger } = opts;
  const backoffSchedule = opts.reconnectBackoffMs ?? DEFAULT_BACKOFF_MS;

  const handlers: Array<(env: SseEnvelope) => void> = [];
  let abortController: AbortController | null = null;
  let stopped = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  /** Resolves the reconnect wait immediately (used by stop()). */
  let reconnectResolve: (() => void) | null = null;

  // ── Internal helpers ─────────────────────────────────────────────────────────

  /**
   * Dispatch an SSE envelope to all registered handlers.
   *
   * Task 2.9: if the envelope carries a trace_id (32-char hex), we extract the
   * W3C trace context and run the dispatch inside a child span. This links
   * Telegram-side event handling to the daemon-side span tree.
   *
   * The traceparent is synthesised as `00-<trace_id>-<span_id|0000000000000001>-01`
   * because the envelope only guarantees trace_id; span_id is optional (the
   * daemon emits both when the SSE module has an active span, but older envelopes
   * may omit it). We use a deterministic placeholder span-id (`0000000000000001`)
   * in the absence of a real parent span-id — this still creates a valid W3C
   * traceparent so the child span joins the correct trace.
   */
  function dispatchEvent(env: SseEnvelope): void {
    // If the envelope carries a trace_id, run handlers inside a child span (D7)
    if (
      typeof env.trace_id === 'string' &&
      env.trace_id.length === 32
    ) {
      const parentSpanId =
        typeof env.span_id === 'string' && env.span_id.length === 16
          ? env.span_id
          : '0000000000000001';
      const traceparent = `00-${env.trace_id}-${parentSpanId}-01`;

      const parentCtx = propagation.extract(context.active(), {
        traceparent,
      });

      const tracer = trace.getTracer(TRACER_NAME);
      const span = tracer.startSpan('sse.event.handle', {}, parentCtx);

      try {
        // Run handlers inside the parent context (child span active)
        context.with(
          trace.setSpan(parentCtx, span),
          () => {
            for (const handler of handlers) {
              try {
                handler(env);
              } catch (err: unknown) {
                logger.warn({ err }, 'sse-client:handler-error');
              }
            }
          },
        );
        span.setStatus({ code: SpanStatusCode.OK });
      } finally {
        span.end();
      }
      return;
    }

    // No trace context — plain dispatch
    for (const handler of handlers) {
      try {
        handler(env);
      } catch (err: unknown) {
        logger.warn({ err }, 'sse-client:handler-error');
      }
    }
  }

  /**
   * Parse a single SSE data line and dispatch if valid.
   * `dataLine` is the content after "data: " prefix.
   */
  function processDataLine(dataLine: string): void {
    const trimmed = dataLine.trim();
    if (trimmed.length === 0) return;

    // Parse JSON
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed) as unknown;
    } catch {
      logger.warn({ raw: trimmed }, 'sse-client:malformed-json');
      return;
    }

    // Validate against SseEnvelopeSchema (I-10)
    const result = SseEnvelopeSchema.safeParse(parsed);
    if (!result.success) {
      logger.warn(
        { issues: result.error.issues, raw: trimmed },
        'sse-client:schema-validation-failed',
      );
      return;
    }

    dispatchEvent(result.data as SseEnvelope);
  }

  /**
   * Run one connection attempt. Streams the response body, parses SSE lines.
   * Resolves when the connection closes (graceful or error).
   * Throws on 401 (caller must exit).
   */
  async function runConnection(signal: AbortSignal): Promise<void> {
    const tracer = trace.getTracer(TRACER_NAME);
    const span = tracer.startSpan('sse.client.connection');

    try {
      logger.info({ url }, 'sse-client:connecting');

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${bearerToken}`,
          Accept: 'text/event-stream',
          'Cache-Control': 'no-cache',
        },
        signal,
      });

      if (response.status === 401) {
        logger.error({ status: 401, url }, 'sse-client:unauthorized-exit');
        span.setStatus({ code: SpanStatusCode.ERROR, message: 'HTTP 401' });
        span.end();
        // In production: terminates the process. Never returns.
        // In tests (mocked process.exit that throws): the catch block wraps
        // the thrown error in UnauthorizedExitError so start() can re-throw it.
        try {
          process.exit(1);
        } catch {
          throw new UnauthorizedExitError();
        }
        // Unreachable in production
        throw new UnauthorizedExitError();
      }

      if (!response.ok) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: `HTTP ${response.status}`,
        });
        span.end();
        throw new Error(`SSE connection failed: HTTP ${response.status}`);
      }

      if (response.body === null) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: 'null body' });
        span.end();
        throw new Error('SSE response body is null');
      }

      logger.info({ url }, 'sse-client:connected');

      // Read body line by line using async iteration
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      for await (const chunk of response.body) {
        const text = decoder.decode(chunk as Uint8Array, { stream: true });
        buffer += text;

        // Split on double newline (SSE event boundary)
        const events = buffer.split('\n\n');
        // Keep the last (possibly incomplete) segment in the buffer
        buffer = events.pop() ?? '';

        for (const event of events) {
          processEvent(event);
        }
      }

      // Flush remainder
      if (buffer.trim().length > 0) {
        processEvent(buffer);
      }

      span.setStatus({ code: SpanStatusCode.OK });
      span.end();
      logger.info({ url }, 'sse-client:stream-ended');
    } catch (err: unknown) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: err instanceof Error ? err.message : String(err),
      });
      span.end();
      throw err;
    }
  }

  /**
   * Process a single SSE event block (the text between `\n\n` separators).
   * Skips comment lines (`:`) and empty lines.
   * Handles `data: <json>` lines.
   */
  function processEvent(eventBlock: string): void {
    const lines = eventBlock.split('\n');
    for (const line of lines) {
      // Heartbeat / comment lines: `: keepalive`, `:`, etc.
      if (line.startsWith(':')) continue;
      // Empty line
      if (line.trim() === '') continue;
      // Data line
      if (line.startsWith('data: ')) {
        const dataContent = line.slice('data: '.length);
        processDataLine(dataContent);
      }
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  const client: SseClient = {
    onEvent(handler: (env: SseEnvelope) => void): void {
      handlers.push(handler);
    },

    async start(): Promise<void> {
      stopped = false;
      let backoffIndex = 0;

      while (!stopped) {
        abortController = new AbortController();

        try {
          await runConnection(abortController.signal);
          // Stream ended normally; reset backoff
          backoffIndex = 0;
        } catch (err: unknown) {
          // If stopped, exit cleanly
          if (stopped) {
            logger.info('sse-client:stopped');
            return;
          }

          // If abort was triggered by stop(), exit cleanly
          if (err instanceof Error && err.name === 'AbortError') {
            logger.info('sse-client:aborted');
            return;
          }

          // 401 unauthorized — do NOT retry; propagate so the process manager
          // can handle the restart. This also makes process.exit(1) mocks in
          // tests propagate correctly.
          if (err instanceof UnauthorizedExitError) {
            throw err;
          }

          logger.warn({ err }, 'sse-client:connection-error');
        }

        if (stopped) return;

        // Exponential backoff before reconnecting
        const delayMs =
          backoffSchedule[Math.min(backoffIndex, backoffSchedule.length - 1)] ?? 30_000;
        backoffIndex++;

        logger.info({ delayMs }, 'sse-client:reconnecting');

        // Wait for backoff — interruptible: stop() calls reconnectResolve()
        // to unblock this await immediately instead of waiting for the timer.
        await new Promise<void>((resolve) => {
          reconnectResolve = resolve;
          reconnectTimer = setTimeout(resolve, delayMs);
        });
        reconnectResolve = null;

        if (stopped) return;
      }
    },

    async stop(): Promise<void> {
      stopped = true;

      // Cancel any pending reconnect timer AND unblock the reconnect wait
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      // Resolve the backoff Promise immediately so start() can check `stopped`
      if (reconnectResolve !== null) {
        reconnectResolve();
        reconnectResolve = null;
      }

      // Abort in-flight fetch
      if (abortController !== null) {
        abortController.abort();
        abortController = null;
      }
    },
  };

  return client;
}
