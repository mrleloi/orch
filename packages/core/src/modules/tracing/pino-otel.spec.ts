/**
 * pino-otel mixin spec
 *
 * Tests the mixin function in isolation — no real pino logger is needed since
 * we just call the mixin directly and inspect its output.
 *
 * Covers:
 *  - Outside span: mixin returns empty object (no trace_id keys)
 *  - Inside span (via TracingService.withSpan): returns trace_id + span_id that
 *    match the active span context
 */

import {
  context,
  propagation,
  trace,
} from '@opentelemetry/api';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
// NodeTracerProvider registers AsyncLocalStorageContextManager, needed for
// trace.getActiveSpan() to work inside async functions in tests.
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { createPinoOtelMixin } from './pino-otel.js';
import { TracingService } from './tracing.service.js';

// ── Test harness setup ────────────────────────────────────────────────────────

function setupTestTracing(): {
  service: TracingService;
  exporter: InMemorySpanExporter;
  provider: NodeTracerProvider;
} {
  const exporter = new InMemorySpanExporter();
  const provider = new NodeTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  provider.register({ propagator: new W3CTraceContextPropagator() });
  const service = new TracingService();
  return { service, exporter, provider };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('createPinoOtelMixin', () => {
  let service: TracingService;
  let exporter: InMemorySpanExporter;
  let provider: NodeTracerProvider;

  beforeEach(() => {
    ({ service, exporter, provider } = setupTestTracing());
  });

  afterEach(async () => {
    exporter.reset();
    await provider.forceFlush();
    await provider.shutdown();
    trace.disable();
    propagation.disable();
    context.disable();
  });

  // ── Outside span ─────────────────────────────────────────────────────────

  it('returns empty object when no active span exists', () => {
    const mixin = createPinoOtelMixin();
    const result = mixin({}, 30) as Record<string, unknown>;

    expect(result).toEqual({});
    expect('trace_id' in result).toBe(false);
    expect('span_id' in result).toBe(false);
  });

  // ── Inside span ───────────────────────────────────────────────────────────

  it('returns trace_id + span_id inside an active span', async () => {
    const mixin = createPinoOtelMixin();
    let mixinResult: Record<string, unknown> = {};

    await service.withSpan('pino-otel.test', async () => {
      mixinResult = mixin({}, 30) as Record<string, unknown>;
      // Verify the mixin output matches the active span context via the OTEL API
      const activeSpan = trace.getActiveSpan();
      const spanCtx = activeSpan?.spanContext();

      expect(spanCtx).toBeDefined();
      expect(mixinResult['trace_id']).toBe(spanCtx!.traceId);
      expect(mixinResult['span_id']).toBe(spanCtx!.spanId);
    });

    // Just to confirm we actually entered the span
    expect(mixinResult['trace_id']).toBeDefined();
    expect(typeof mixinResult['trace_id']).toBe('string');
  });

  it('returns trace_flags as 2-char hex string inside span', async () => {
    const mixin = createPinoOtelMixin();
    let mixinResult: Record<string, unknown> = {};

    await service.withSpan('flags.test', async () => {
      mixinResult = mixin({}, 30) as Record<string, unknown>;
    });

    expect(typeof mixinResult['trace_flags']).toBe('string');
    expect((mixinResult['trace_flags'] as string).length).toBe(2);
  });

  it('returns empty object again after span ends', async () => {
    const mixin = createPinoOtelMixin();

    await service.withSpan('after-end.test', async () => {
      // Inside: has trace context
      expect(Object.keys(mixin({}, 30) as Record<string, unknown>)).toContain('trace_id');
    });

    // After: no active span
    const afterResult = mixin({}, 30) as Record<string, unknown>;
    expect('trace_id' in afterResult).toBe(false);
  });
});
