/**
 * context-budget.span-processor.spec.ts — Unit tests for ContextBudgetSpanProcessor.
 *
 * Covers Part B1 tests 16–19:
 *  16. onEnd delegates to service.ingestSpan
 *  17. onEnd swallows service errors (OTLP pipeline integrity)
 *  18. onStart is a no-op
 *  19. shutdown / forceFlush resolve cleanly
 */

import type { ReadableSpan, Span as SdkSpan } from '@opentelemetry/sdk-trace-base';
import { SpanStatusCode } from '@opentelemetry/api';
import type { Context } from '@opentelemetry/api';
import { ContextBudgetSpanProcessor } from './context-budget.span-processor.js';
import type { ContextBudgetService } from './context-budget.service.js';

function buildMockService(): jest.Mocked<Pick<ContextBudgetService, 'ingestSpan'>> {
  return {
    ingestSpan: jest.fn(),
  };
}

function buildSpan(): ReadableSpan {
  return {
    name: 'gen_ai.completion',
    kind: 0,
    spanContext: () => ({
      traceId: 'a'.repeat(32),
      spanId: 'b'.repeat(16),
      traceFlags: 1,
    }),
    startTime: [0, 0],
    endTime: [1, 0],
    status: { code: SpanStatusCode.OK },
    attributes: { 'gen_ai.usage.input_tokens': 1000 },
    links: [],
    events: [],
    duration: [1, 0],
    ended: true,
    resource: {} as never,
    instrumentationLibrary: { name: 'test', version: '0.0.0' },
    droppedAttributesCount: 0,
    droppedEventsCount: 0,
    droppedLinksCount: 0,
  } as unknown as ReadableSpan;
}

describe('ContextBudgetSpanProcessor', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ── B1.16: onEnd delegates to service.ingestSpan ─────────────────────────────

  it('B1.16: onEnd delegates to service.ingestSpan once with the span', () => {
    const service = buildMockService();
    const processor = new ContextBudgetSpanProcessor(service as never);
    const span = buildSpan();

    processor.onEnd(span);

    expect(service.ingestSpan).toHaveBeenCalledTimes(1);
    expect(service.ingestSpan).toHaveBeenCalledWith(span);
  });

  // ── B1.17: onEnd swallows service errors ─────────────────────────────────────

  it('B1.17: onEnd swallows errors from service.ingestSpan (OTLP pipeline integrity)', () => {
    const service = buildMockService();
    service.ingestSpan.mockImplementation(() => {
      throw new Error('simulated service failure');
    });
    const processor = new ContextBudgetSpanProcessor(service as never);
    const span = buildSpan();

    // Must not throw
    expect(() => processor.onEnd(span)).not.toThrow();
  });

  // ── B1.18: onStart is a no-op ────────────────────────────────────────────────

  it('B1.18: onStart is a no-op — no service interaction', () => {
    const service = buildMockService();
    const processor = new ContextBudgetSpanProcessor(service as never);

    const fakeSdkSpan = {} as SdkSpan;
    const fakeCtx = {} as Context;
    processor.onStart(fakeSdkSpan, fakeCtx);

    expect(service.ingestSpan).not.toHaveBeenCalled();
  });

  // ── B1.19: shutdown / forceFlush resolve cleanly ─────────────────────────────

  it('B1.19: shutdown() resolves without error', async () => {
    const service = buildMockService();
    const processor = new ContextBudgetSpanProcessor(service as never);

    await expect(processor.shutdown()).resolves.toBeUndefined();
  });

  it('B1.19b: forceFlush() resolves without error', async () => {
    const service = buildMockService();
    const processor = new ContextBudgetSpanProcessor(service as never);

    await expect(processor.forceFlush()).resolves.toBeUndefined();
  });
});
