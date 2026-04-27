/**
 * tracing-http-propagation.integration.spec.ts — Task 2.9 Part B
 *
 * Integration tests verifying HTTP-level trace context propagation:
 *  1. Incoming traceparent header is honored (child span has correct parent)
 *  2. Pino log lines inside an HTTP request scope carry trace_id + span_id (I-9)
 *  3. ClaudeCodeAdapter spawn still receives TRACEPARENT env with correct span ID
 *     (regression guard — already worked in Phase 1, must survive OTEL bootstrap change)
 *
 * Strategy:
 *  - Create a real NodeTracerProvider with InMemorySpanExporter for assertions
 *  - Use the TracingService directly for assertion (c) — ClaudeCodeAdapter.spawn test
 *  - For assertions (a) and (b): test at the TracingService level using withSpan +
 *    pino logger wired with createPinoOtelMixin() — the same path used in production
 *
 * Why not spin up a real Fastify/NestJS app here:
 *  The auto-instrumentation hooks are installed at the process level when
 *  bootstrapTracing() runs. In the test runner (Jest) environment, the SDK is
 *  already started by earlier test files if they imported tracing-bootstrap.
 *  Spinning up a full NestJS+Fastify app inside Jest creates timing hazards with
 *  the global tracer provider. Instead, we use the TracingService directly, which
 *  already tests the critical path (active span → pino mixin → trace_id in log).
 *  The full end-to-end (daemon boot + real HTTP + Grafana Tempo) is in otel-smoke.sh.
 *
 * I-13: No real network calls. InMemorySpanExporter + unreachable OTLP endpoint.
 */

import { Writable } from 'node:stream';
import pino from 'pino';
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
import { redactLogObject } from './modules/security/redact-log-object.js';
import { TracingService } from './modules/tracing/tracing.service.js';

// ── Test harness ──────────────────────────────────────────────────────────────

function setupTestProvider(): {
  provider: NodeTracerProvider;
  exporter: InMemorySpanExporter;
  service: TracingService;
} {
  const exporter = new InMemorySpanExporter();
  const provider = new NodeTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  provider.register({ propagator: new W3CTraceContextPropagator() });
  const service = new TracingService();
  return { provider, exporter, service };
}

function buildCaptureLogger(): {
  logger: pino.Logger;
  getLines: () => Record<string, unknown>[];
} {
  let raw = '';
  const dest = new Writable({
    write(chunk: Buffer, _enc: BufferEncoding, cb: () => void) {
      raw += chunk.toString();
      cb();
    },
  });
  const logger = pino(
    {
      level: 'trace',
      mixin: createPinoOtelMixin(),
      formatters: {
        log: (obj: Record<string, unknown>) => redactLogObject(obj),
      },
    },
    dest,
  );
  return {
    logger,
    getLines: () =>
      raw
        .trim()
        .split('\n')
        .filter((l) => l.length > 0)
        .map((l) => JSON.parse(l) as Record<string, unknown>),
  };
}

/** Build a W3C traceparent string from known IDs (for incoming-header simulation). */
function buildTraceparent(
  traceId: string,
  spanId: string,
  flags = '01',
): string {
  return `00-${traceId}-${spanId}-${flags}`;
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('HTTP-level trace context propagation (Integration)', () => {
  let provider: NodeTracerProvider;
  let exporter: InMemorySpanExporter;
  let service: TracingService;

  beforeEach(() => {
    ({ provider, exporter, service } = setupTestProvider());
  });

  afterEach(async () => {
    await provider.forceFlush();
    await provider.shutdown();
    trace.disable();
    propagation.disable();
    context.disable();
  });

  // ── Test A: incoming traceparent honored ──────────────────────────────────

  it('(A) child span has the correct parent from incoming traceparent header', async () => {
    const parentTraceId = 'aabb112233445566aabb112233445566';
    const parentSpanId = '0102030405060708';
    const traceparent = buildTraceparent(parentTraceId, parentSpanId);

    // Simulate what the Fastify instrumentation does: extract propagation context
    // from headers, then run the request handler inside that context.
    const carrier = { traceparent };
    const parentCtx = propagation.extract(context.active(), carrier);

    let childTraceId: string | undefined;
    let childParentSpanId: string | undefined;

    await context.with(parentCtx, async () => {
      await service.withSpan('http.request.handler', async (span) => {
        // Grab the span's context to check parent linkage
        const spanCtx = trace.getActiveSpan()?.spanContext();
        if (spanCtx) {
          childTraceId = spanCtx.traceId;
          // The parent span ID is stored on the ReadableSpan after the span ends
        }
        span.setAttribute('http.method', 'GET');
        span.setAttribute('http.route', '/healthz');
      });
    });

    await provider.forceFlush();
    const spans = exporter.getFinishedSpans();
    expect(spans.length).toBeGreaterThan(0);

    const httpSpan = spans.find((s) => s.name === 'http.request.handler');
    expect(httpSpan).toBeDefined();

    // The child span must share the parent's traceId
    expect(childTraceId).toBe(parentTraceId);
    expect(httpSpan!.spanContext().traceId).toBe(parentTraceId);

    // The child's parentSpanId must equal the original span that sent the traceparent
    expect(httpSpan!.parentSpanId).toBe(parentSpanId);
  });

  // ── Test B: every pino log line in request scope has trace_id ────────────

  it('(B) every pino log line inside a request span carries trace_id and span_id (I-9)', async () => {
    const { logger, getLines } = buildCaptureLogger();

    await service.withSpan('http.request.handler', async () => {
      // Simulate multiple log lines from different middleware layers
      logger.info({ msg: 'request-start', method: 'GET', path: '/healthz' });
      logger.debug({ msg: 'auth-check', result: 'pass' });
      logger.info({ msg: 'handler-invoked' });
      logger.info({ msg: 'response-sent', status: 200 });
    });

    const lines = getLines();
    // All 4 log lines should be captured
    expect(lines.length).toBe(4);

    // I-9: EVERY log line in the request scope must have trace_id + span_id
    for (const line of lines) {
      expect(typeof line['trace_id']).toBe('string');
      expect((line['trace_id'] as string).length).toBe(32);
      expect((line['trace_id'] as string)).toMatch(/^[0-9a-f]+$/);

      expect(typeof line['span_id']).toBe('string');
      expect((line['span_id'] as string).length).toBe(16);
      expect((line['span_id'] as string)).toMatch(/^[0-9a-f]+$/);
    }

    // All lines within the same span should share the same trace_id
    const traceIds = new Set(lines.map((l) => l['trace_id'] as string));
    expect(traceIds.size).toBe(1);
  });

  // ── Test C: TracingService.injectTraceparentIntoEnv passes correct span ──

  it('(C) TracingService.injectTraceparentIntoEnv produces W3C traceparent with active span ID', async () => {
    let capturedEnv: NodeJS.ProcessEnv | undefined;
    let capturedSpanId: string | undefined;

    await service.withSpan('session.spawn', async () => {
      const activeSpan = trace.getActiveSpan();
      capturedSpanId = activeSpan?.spanContext().spanId;

      // Simulate what ClaudeCodeAdapter.spawn does (D7)
      capturedEnv = service.injectTraceparentIntoEnv({ ...process.env });
    });

    // TRACEPARENT must be present in the env
    expect(capturedEnv).toBeDefined();
    const traceparent = capturedEnv!['TRACEPARENT'];
    expect(typeof traceparent).toBe('string');
    expect(traceparent).toBeDefined();

    // The traceparent must include the active span ID
    expect(capturedSpanId).toBeDefined();
    expect(traceparent!).toContain(capturedSpanId!);

    // Must be valid W3C format: 00-<32hexTraceId>-<16hexSpanId>-<flags>
    expect(traceparent!).toMatch(
      /^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/,
    );
  });

  // ── Test D: sampled span flags propagate correctly ────────────────────────

  it('(D) spans inside request context are sampled (flags & 0x01)', async () => {
    await service.withSpan('request.handler', async () => {
      const span = trace.getActiveSpan();
      expect(span).toBeDefined();
      const ctx = span!.spanContext();
      expect(ctx.traceFlags & TraceFlags.SAMPLED).toBe(TraceFlags.SAMPLED);
    });
  });

  // ── Test E: log line OUTSIDE request scope has no trace_id ───────────────

  it('(E) pino log line outside any span does NOT carry trace_id', () => {
    const { logger, getLines } = buildCaptureLogger();

    // Log outside any span
    logger.info({ msg: 'daemon-startup' });

    const lines = getLines();
    expect(lines.length).toBe(1);
    // No active span → mixin returns {} → no trace_id injected
    expect(lines[0]!['trace_id']).toBeUndefined();
    expect(lines[0]!['span_id']).toBeUndefined();
  });
});
