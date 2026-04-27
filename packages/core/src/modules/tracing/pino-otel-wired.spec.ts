/**
 * pino-otel-wired.spec.ts
 *
 * Integration test: builds a real pino instance with createPinoOtelMixin() +
 * redactLogObject formatter (exactly as main.ts does), logs inside an active
 * OTEL span, and asserts that the output JSON contains non-empty trace_id and
 * span_id keys (proving the mixin is wired and fires inside a span).
 *
 * Fix B verification: this is the test that proves main.ts's mixin config is correct.
 */

import { Writable } from 'node:stream';
import pino from 'pino';
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
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { createPinoOtelMixin } from './pino-otel.js';
import { redactLogObject } from '../security/redact-log-object.js';
import { TracingService } from './tracing.service.js';

function setupTestTracing(): {
  service: TracingService;
  provider: NodeTracerProvider;
} {
  const exporter = new InMemorySpanExporter();
  const provider = new NodeTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  provider.register({ propagator: new W3CTraceContextPropagator() });
  const service = new TracingService();
  return { service, provider };
}

function buildTestLogger(): { logger: pino.Logger; getLines: () => string[] } {
  let raw = '';
  const dest = new Writable({
    write(chunk: Buffer, _enc: BufferEncoding, cb: () => void) {
      raw += chunk.toString();
      cb();
    },
  });

  const logger = pino(
    {
      level: 'info',
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
        .filter((l) => l.length > 0),
  };
}

describe('pino-OTEL wired integration (Fix B)', () => {
  let service: TracingService;
  let provider: NodeTracerProvider;

  beforeEach(() => {
    ({ service, provider } = setupTestTracing());
  });

  afterEach(async () => {
    await provider.forceFlush();
    await provider.shutdown();
    trace.disable();
    propagation.disable();
    context.disable();
  });

  it('log record emitted inside an active span includes non-empty trace_id and span_id', async () => {
    const { logger, getLines } = buildTestLogger();

    await service.withSpan('healthz-request', async () => {
      logger.info({ msg: 'GET /healthz', status: 200 });
    });

    const lines = getLines();
    expect(lines.length).toBeGreaterThan(0);

    const parsed = JSON.parse(lines[0]!) as Record<string, unknown>;

    expect(typeof parsed['trace_id']).toBe('string');
    expect((parsed['trace_id'] as string).length).toBeGreaterThan(0);

    expect(typeof parsed['span_id']).toBe('string');
    expect((parsed['span_id'] as string).length).toBeGreaterThan(0);
  });

  it('log record emitted outside a span does NOT include trace_id', () => {
    const { logger, getLines } = buildTestLogger();

    logger.info({ msg: 'outside span' });

    const lines = getLines();
    const parsed = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(parsed['trace_id']).toBeUndefined();
    expect(parsed['span_id']).toBeUndefined();
  });

  it('trace_id and span_id are valid hex strings when inside a span', async () => {
    const { logger, getLines } = buildTestLogger();

    await service.withSpan('test-span', async () => {
      logger.info({ msg: 'inside span' });
    });

    const lines = getLines();
    const parsed = JSON.parse(lines[0]!) as Record<string, unknown>;

    const traceId = parsed['trace_id'] as string;
    const spanId = parsed['span_id'] as string;

    // Trace ID is a 32-char hex string; span ID is a 16-char hex string
    expect(traceId).toMatch(/^[0-9a-f]+$/);
    expect(spanId).toMatch(/^[0-9a-f]+$/);
    expect(traceId.length).toBe(32);
    expect(spanId.length).toBe(16);
  });
});
