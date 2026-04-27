/**
 * TracingService spec
 *
 * Uses an in-memory span exporter + BasicTracerProvider for full control of
 * span lifecycle without a real OTLP endpoint (I-13: no real network calls).
 *
 * Covers:
 *  - withSpan: span emitted on success
 *  - withSpan: parent-child link correct for nested spans
 *  - withSpan: exception recorded + status=ERROR when fn throws
 *  - getActiveTraceparent(): returns 55-char W3C format inside span, undefined outside
 *  - injectTraceparentIntoEnv(): returns new env with TRACEPARENT; original untouched
 */

import {
  context,
  propagation,
  trace,
} from '@opentelemetry/api';
import type { ISpan } from '../../domain/types/tracer.js';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
// NodeTracerProvider registers AsyncLocalStorageContextManager, needed for
// trace.getActiveSpan() to work inside async functions in tests (I-13 isolation).
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
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
  // Register provider + W3C propagator globally for these tests
  provider.register({
    propagator: new W3CTraceContextPropagator(),
  });

  const service = new TracingService();
  return { service, exporter, provider };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TracingService', () => {
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
    // Reset global providers
    trace.disable();
    propagation.disable();
    context.disable();
  });

  // ── withSpan — basic ──────────────────────────────────────────────────────

  describe('withSpan', () => {
    it('emits a span to the exporter on success', async () => {
      await service.withSpan('test.operation', async (span) => {
        span.setAttribute('test.attr', 'hello');
        return 42;
      });

      const spans = exporter.getFinishedSpans();
      expect(spans).toHaveLength(1);
      expect(spans[0]?.name).toBe('test.operation');
      expect(spans[0]?.attributes['test.attr']).toBe('hello');
    });

    it('returns the value from fn', async () => {
      const result = await service.withSpan('result.test', async () => 'ok');
      expect(result).toBe('ok');
    });

    it('applies attrs option as span attributes', async () => {
      await service.withSpan('attrs.test', async () => undefined, {
        'custom.key': 'custom.value',
      });

      const span = exporter.getFinishedSpans()[0];
      expect(span?.attributes['custom.key']).toBe('custom.value');
    });
  });

  // ── withSpan — nested (parent-child link) ─────────────────────────────────

  describe('withSpan nested', () => {
    it('creates parent-child span relationship for nested withSpan calls', async () => {
      await service.withSpan('parent', async () => {
        await service.withSpan('child', async () => 'done');
      });

      const spans = exporter.getFinishedSpans();
      expect(spans).toHaveLength(2);

      const parent = spans.find((s) => s.name === 'parent');
      const child = spans.find((s) => s.name === 'child');

      expect(parent).toBeDefined();
      expect(child).toBeDefined();

      // Child's parentSpanId must equal parent's spanId
      expect(child?.parentSpanId).toBe(parent?.spanContext().spanId);

      // Both share the same traceId
      expect(child?.spanContext().traceId).toBe(parent?.spanContext().traceId);
    });
  });

  // ── withSpan — error handling ─────────────────────────────────────────────

  describe('withSpan error handling', () => {
    it('records exception event and sets status=ERROR when fn throws', async () => {
      const testErr = new Error('test-failure');

      await expect(
        service.withSpan('failing.span', async () => {
          throw testErr;
        }),
      ).rejects.toThrow('test-failure');

      const spans = exporter.getFinishedSpans();
      expect(spans).toHaveLength(1);

      const span = spans[0]!;
      // Status should be ERROR
      expect(span.status.code).toBe(2); // SpanStatusCode.ERROR = 2

      // An exception event should be recorded
      const exceptionEvent = span.events.find((e) => e.name === 'exception');
      expect(exceptionEvent).toBeDefined();
    });

    it('ends the span even when fn throws', async () => {
      await expect(
        service.withSpan('end-on-throw', async () => {
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');

      const spans = exporter.getFinishedSpans();
      expect(spans).toHaveLength(1);
      // endTime should be set (non-zero high-resolution time)
      const endTime = spans[0]?.endTime;
      expect(endTime).toBeDefined();
      expect(endTime![0]).toBeGreaterThan(0);
    });
  });

  // ── getActiveTraceparent ──────────────────────────────────────────────────

  describe('getActiveTraceparent', () => {
    it('returns undefined when no active span exists', () => {
      const result = service.getActiveTraceparent();
      expect(result).toBeUndefined();
    });

    it('returns a valid W3C traceparent string (55 chars) inside a span', async () => {
      let traceparent: string | undefined;

      await service.withSpan('traceparent.test', async () => {
        traceparent = service.getActiveTraceparent();
      });

      expect(traceparent).toBeDefined();
      expect(typeof traceparent).toBe('string');
      // W3C format: 00-<32-char traceId>-<16-char spanId>-<2-char flags>
      // = 2 + 1 + 32 + 1 + 16 + 1 + 2 = 55 chars
      expect(traceparent!.length).toBe(55);
      expect(traceparent!.startsWith('00-')).toBe(true);
    });

    it('traceparent is a valid 55-char W3C string captured inside an active span', async () => {
      let capturedSpan: ISpan | null = null;
      let traceparent: string | undefined;

      await service.withSpan('id.check', async (span) => {
        capturedSpan = span;
        traceparent = service.getActiveTraceparent();
      });

      expect(capturedSpan).not.toBeNull();
      expect(traceparent).toBeDefined();

      // Verify the traceparent is a valid W3C string inside the span
      // Format: 00-<32-char traceId>-<16-char spanId>-<2-char flags>
      expect(traceparent!.length).toBe(55);
      expect(traceparent!).toMatch(
        /^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/,
      );
    });
  });

  // ── injectTraceparentIntoEnv ──────────────────────────────────────────────

  describe('injectTraceparentIntoEnv', () => {
    it('returns a new env object with TRACEPARENT set when inside a span', async () => {
      const originalEnv: NodeJS.ProcessEnv = { FOO: 'bar', PATH: '/usr/bin' };

      let resultEnv: NodeJS.ProcessEnv | undefined;

      await service.withSpan('inject.test', async () => {
        resultEnv = service.injectTraceparentIntoEnv(originalEnv);
      });

      expect(resultEnv).toBeDefined();
      expect(resultEnv!['TRACEPARENT']).toBeDefined();
      expect(typeof resultEnv!['TRACEPARENT']).toBe('string');
      // The TRACEPARENT should be a valid 55-char W3C string
      expect(resultEnv!['TRACEPARENT']!.length).toBe(55);
    });

    it('does not mutate the original env', async () => {
      const originalEnv: NodeJS.ProcessEnv = { FOO: 'bar' };
      const snapshot = { ...originalEnv };

      await service.withSpan('no-mutate.test', async () => {
        service.injectTraceparentIntoEnv(originalEnv);
      });

      // Original must be identical to snapshot
      expect(originalEnv).toEqual(snapshot);
    });

    it('preserves existing env keys in the returned object', async () => {
      const originalEnv: NodeJS.ProcessEnv = { FOO: 'bar', BAZ: 'qux' };

      let resultEnv: NodeJS.ProcessEnv | undefined;
      await service.withSpan('preserve.test', async () => {
        resultEnv = service.injectTraceparentIntoEnv(originalEnv);
      });

      expect(resultEnv!['FOO']).toBe('bar');
      expect(resultEnv!['BAZ']).toBe('qux');
    });

    it('returns env without TRACEPARENT when outside a span', () => {
      const originalEnv: NodeJS.ProcessEnv = { FOO: 'bar' };
      const resultEnv = service.injectTraceparentIntoEnv(originalEnv);
      // Outside a span, no TRACEPARENT injected
      expect(resultEnv['TRACEPARENT']).toBeUndefined();
    });
  });
});
