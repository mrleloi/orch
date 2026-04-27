/**
 * context-budget.integration.spec.ts — Integration test using real NodeTracerProvider
 * + InMemorySpanExporter (Part B2 contract).
 *
 * Verifies:
 *  1. near-limit then force-handoff events fire in order with correct payloads.
 *  2. InMemorySpanExporter still receives all spans (OTLP chain integrity).
 *  3. Events carry the correct sessionKey, currentTokens, and threshold values.
 */

import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { trace } from '@opentelemetry/api';
import { EventBusService } from '../events/event-bus.service.js';
import { EVENT_CHANNELS } from '../events/event-channels.js';
import { ContextBudgetService } from './context-budget.service.js';
import { ContextBudgetSpanProcessor } from './context-budget.span-processor.js';
import { DEFAULT_THRESHOLDS } from './context-budget.constants.js';
import type {
  SessionContextNearLimitPayload,
  SessionForceHandoffPayload,
} from './context-budget.types.js';
import { fireSyntheticSpan } from '../../../test/helpers/fire-synthetic-span.js';
import { buildMockProjectRegistry } from '../../../test/helpers/mock-project-registry.js';

function buildEventBus(): EventBusService {
  const emitter = new EventEmitter2({ wildcard: true, maxListeners: 100 });
  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
  return new EventBusService(emitter);
}

describe('ContextBudgetSpanProcessor — integration with real NodeTracerProvider', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    trace.disable();
  });

  // ── B2: Main integration contract ────────────────────────────────────────────

  it('fires near-limit then force-handoff in order against real spans (B2 contract)', async () => {
    // Arrange
    const exporter = new InMemorySpanExporter();
    const provider = new NodeTracerProvider();
    provider.addSpanProcessor(new SimpleSpanProcessor(exporter));

    const bus = buildEventBus();
    const registry = buildMockProjectRegistry({
      'proj-1': { contextBudget: DEFAULT_THRESHOLDS },
    });
    const service = new ContextBudgetService(bus, registry as never);
    const budgetProcessor = new ContextBudgetSpanProcessor(service);
    provider.addSpanProcessor(budgetProcessor);
    provider.register();
    const tracer = provider.getTracer('integration-test');

    type CapturedEvent =
      | { type: 'near'; payload: SessionContextNearLimitPayload }
      | { type: 'force'; payload: SessionForceHandoffPayload };

    const captured: CapturedEvent[] = [];
    bus.on(EVENT_CHANNELS.session.contextNearLimit, (p) =>
      captured.push({ type: 'near', payload: p }),
    );
    bus.on(EVENT_CHANNELS.session.forceHandoff, (p) =>
      captured.push({ type: 'force', payload: p }),
    );

    // Act: emit synthetic spans summing past warn then past force.
    // Span 1: 100k   → total 100k  (no event)
    // Span 2: 100k+1 → total 200k+1 (crosses 200k warn threshold)
    // Span 3: 30k    → total 230k+1 (crosses 230k force threshold)
    fireSyntheticSpan(tracer, 'sess-A', 'proj-1', 100_000);
    fireSyntheticSpan(tracer, 'sess-A', 'proj-1', 100_001);
    fireSyntheticSpan(tracer, 'sess-A', 'proj-1', 30_000);

    // Assert events were emitted in order
    expect(captured).toHaveLength(2);
    expect(captured[0]?.type).toBe('near');
    expect(captured[1]?.type).toBe('force');

    const nearPayload = captured[0]?.payload as SessionContextNearLimitPayload;
    expect(nearPayload.sessionKey).toBe('sess-A');
    expect(nearPayload.currentTokens).toBe(200_001);
    expect(nearPayload.threshold).toBe(200_000);

    const forcePayload = captured[1]?.payload as SessionForceHandoffPayload;
    expect(forcePayload.sessionKey).toBe('sess-A');
    expect(forcePayload.currentTokens).toBe(230_001);
    expect(forcePayload.threshold).toBe(230_000);

    // Assert OTLP export integrity: all 3 spans still received by InMemoryExporter
    expect(exporter.getFinishedSpans().length).toBe(3);

    await provider.shutdown();
  });

  // ── Cross-session isolation in real provider ──────────────────────────────────

  it('does not cross-contaminate sessions when both active in same provider', async () => {
    const exporter = new InMemorySpanExporter();
    const provider = new NodeTracerProvider();
    provider.addSpanProcessor(new SimpleSpanProcessor(exporter));

    const bus = buildEventBus();
    const registry = buildMockProjectRegistry({
      'proj-multi': { contextBudget: DEFAULT_THRESHOLDS },
    });
    const service = new ContextBudgetService(bus, registry as never);
    provider.addSpanProcessor(new ContextBudgetSpanProcessor(service));
    provider.register();
    const tracer = provider.getTracer('integration-test-multi');

    const nearEvents: SessionContextNearLimitPayload[] = [];
    bus.on(EVENT_CHANNELS.session.contextNearLimit, (p) => nearEvents.push(p));

    // sess-B crosses near-limit, sess-C stays low
    fireSyntheticSpan(tracer, 'sess-B', 'proj-multi', 200_001);
    fireSyntheticSpan(tracer, 'sess-C', 'proj-multi', 1_000);

    expect(nearEvents).toHaveLength(1);
    expect(nearEvents[0]?.sessionKey).toBe('sess-B');

    expect(service.snapshot('sess-C')?.nearLimitFired).toBe(false);

    await provider.shutdown();
  });
});
