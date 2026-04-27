/**
 * tracing-fastify.integration.spec.ts — Task 2.9 Directive 2
 *
 * Closes the gap that manual smoke testing covered: verifies that a real Fastify
 * request with a W3C traceparent header produces:
 *
 *   A. A span whose parentSpanId matches the traceparent's parent-id field.
 *   B. A pino log line (from fastify.log) with trace_id matching the
 *      traceparent's trace-id — this is the I-9 assertion that was previously
 *      only verified by otel-smoke.sh.
 *
 * Strategy:
 *   - Spin a minimal Fastify instance (no NestJS) with pino logger wired via
 *     createPinoOtelMixin(), writing to an in-memory Writable.
 *   - Register a NodeTracerProvider with InMemorySpanExporter as the global provider.
 *   - Use a custom request hook to extract traceparent from headers via
 *     propagation.extract() and run the handler inside that context.
 *   - Use Fastify's built-in inject() — no real TCP socket needed (I-13).
 *
 * Why manual context propagation (not FastifyInstrumentation):
 *   FastifyInstrumentation patches the Fastify module at import time. In the Jest
 *   test runner, Fastify is already loaded before the instrumentation can patch it,
 *   making automatic wrapping unreliable. Instead, we replicate what the
 *   instrumentation does (extract context from headers, run handler inside ctx.with)
 *   to test the same observable behaviour: span parentage + pino trace_id.
 *
 * I-13: No real network calls. InMemorySpanExporter + inject().
 * I-9:  Assert B closes the pino ↔ trace_id gap at test level.
 */

import { Writable } from 'node:stream';
import pino from 'pino';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  context,
  propagation,
  trace,
  TraceFlags,
} from '@opentelemetry/api';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { createPinoOtelMixin } from './modules/tracing/pino-otel.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a W3C traceparent string from explicit IDs.
 * Format: 00-<32hex traceId>-<16hex parentSpanId>-<2hex flags>
 */
function makeTraceparent(traceId: string, spanId: string, flags = '01'): string {
  return `00-${traceId}-${spanId}-${flags}`;
}

/**
 * Build a minimal Fastify instance that:
 *  1. Uses a pino logger capturing JSON to an in-memory stream.
 *  2. Exposes a single GET /healthz route that logs + returns { ok: true }.
 *  3. Manually extracts the incoming W3C traceparent header and runs the
 *     route handler inside the extracted context (replicating what
 *     FastifyInstrumentation would do automatically in production).
 */
function buildFastify(logDest: Writable, provider: NodeTracerProvider): FastifyInstance {
  const pinoLogger = pino(
    {
      level: 'trace',
      mixin: createPinoOtelMixin(),
    },
    logDest,
  );

  const app = Fastify({
    loggerInstance: pinoLogger,
  });

  // Manual context propagation: extract the traceparent from each request,
  // wrap the handler in that context. This is what FastifyInstrumentation does
  // automatically in production, but we replicate it here for test reliability.
  app.addHook('preHandler', async (request, _reply) => {
    const carrier: Record<string, string> = {};
    // Copy all headers into the carrier (pino-http sets them on request.raw)
    const rawHeaders = request.headers;
    for (const [key, value] of Object.entries(rawHeaders)) {
      if (typeof value === 'string') {
        carrier[key] = value;
      }
    }

    // Extract the W3C context from headers
    const parentCtx = propagation.extract(context.active(), carrier);

    // Create a child span inside the extracted context and store in request
    const tracer = provider.getTracer('fastify-test');
    const span = tracer.startActiveSpan(
      'GET /healthz',
      { root: false },
      parentCtx,
      () => {
        // We need to return the span — wrap with context.with
        return tracer.startSpan('GET /healthz', {}, parentCtx);
      },
    );

    // Attach span context to request for the handler to close
    (request as unknown as Record<string, unknown>).__testSpan = span;

    // We need to actually run subsequent hooks/handler inside parentCtx + span ctx
    // Store the active context for the route handler
    const spanCtx = trace.setSpan(parentCtx, span);
    (request as unknown as Record<string, unknown>).__testSpanCtx = spanCtx;
  });

  app.get('/healthz', async (request, reply) => {
    const span = (request as unknown as Record<string, unknown>).__testSpan;
    const spanCtx = (request as unknown as Record<string, unknown>).__testSpanCtx as
      | ReturnType<typeof context.active>
      | undefined;

    // Run the handler body inside the propagated context so pino mixin sees the span
    await context.with(spanCtx ?? context.active(), async () => {
      // I-9: This log line must carry trace_id from the active span
      request.log.info({ msg: 'check' });

      await reply.send({ ok: true });
    });

    // End the span after handler completes
    if (span && typeof (span as { end?: () => void }).end === 'function') {
      (span as { end: () => void }).end();
    }
  });

  return app;
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('Fastify real-request trace context integration', () => {
  let provider: NodeTracerProvider;
  let exporter: InMemorySpanExporter;
  let app: FastifyInstance;
  let logLines: () => Record<string, unknown>[];

  beforeEach(async () => {
    exporter = new InMemorySpanExporter();
    provider = new NodeTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    });
    provider.register({ propagator: new W3CTraceContextPropagator() });

    // Build in-memory log capture
    let rawLog = '';
    const dest = new Writable({
      write(chunk: Buffer, _enc: BufferEncoding, cb: () => void) {
        rawLog += chunk.toString();
        cb();
      },
    });

    logLines = () =>
      rawLog
        .trim()
        .split('\n')
        .filter((l) => l.length > 0)
        .map((l) => JSON.parse(l) as Record<string, unknown>);

    app = buildFastify(dest, provider);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    await provider.forceFlush();
    await provider.shutdown();
    trace.disable();
    propagation.disable();
    context.disable();
    exporter.reset();
  });

  // ── Test A: span parentage ────────────────────────────────────────────────

  it('(A) emitted span has parentSpanId matching the incoming traceparent', async () => {
    const traceId = 'aabb112233445566aabb112233445566';
    const parentSpanId = '0102030405060708';
    const traceparent = makeTraceparent(traceId, parentSpanId, '01');

    const response = await app.inject({
      method: 'GET',
      url: '/healthz',
      headers: { traceparent },
    });

    expect(response.statusCode).toBe(200);

    await provider.forceFlush();
    const spans = exporter.getFinishedSpans();

    // Find the span we created for this request
    const requestSpan = spans.find((s) => s.name === 'GET /healthz');
    expect(requestSpan).toBeDefined();

    // A: The span must share the incoming trace-id
    expect(requestSpan!.spanContext().traceId).toBe(traceId);

    // A: The span's parentSpanId must be the one from the traceparent header
    expect(requestSpan!.parentSpanId).toBe(parentSpanId);
  }, 10_000);

  // ── Test B: pino trace_id ─────────────────────────────────────────────────

  it('(B) pino log line from request handler carries trace_id matching incoming traceparent (I-9)', async () => {
    const traceId = 'ccdd112233445566ccdd112233445566';
    const parentSpanId = '0a0b0c0d0e0f0102';
    const traceparent = makeTraceparent(traceId, parentSpanId, '01');

    const response = await app.inject({
      method: 'GET',
      url: '/healthz',
      headers: { traceparent },
    });

    expect(response.statusCode).toBe(200);

    // Filter log lines to find the handler-emitted structured log
    const lines = logLines();
    const handlerLine = lines.find(
      (l) => typeof l['msg'] === 'string' && (l['msg'] as string).includes('check'),
    );

    // B: The log line must have trace_id
    expect(handlerLine).toBeDefined();
    expect(typeof handlerLine!['trace_id']).toBe('string');

    // B: trace_id must match the incoming traceparent's trace-id
    expect(handlerLine!['trace_id']).toBe(traceId);
  }, 10_000);
});
