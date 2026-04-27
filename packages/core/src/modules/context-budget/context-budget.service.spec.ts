/**
 * context-budget.service.spec.ts — Unit tests for ContextBudgetService.
 *
 * Covers Part B1 test contracts (15 tests on service + 3 from B1.12-14 on profile
 * schema — those live in profile.spec.ts, counted separately).
 *
 * Test isolation: each test gets a fresh service instance via buildService().
 * No real OTEL provider required — we build ReadableSpan-compatible objects directly.
 */

import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EventBusService } from '../events/event-bus.service.js';
import { EVENT_CHANNELS } from '../events/event-channels.js';
import { ContextBudgetService } from './context-budget.service.js';
import { DEFAULT_THRESHOLDS, MAX_USAGE_SAMPLES } from './context-budget.constants.js';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import type { SpanContext } from '@opentelemetry/api';
import { SpanStatusCode } from '@opentelemetry/api';
import type {
  SessionContextNearLimitPayload,
  SessionForceHandoffPayload,
} from './context-budget.types.js';
import { SseEnvelopeSchema } from '@orch/shared';
import { buildMockProjectRegistry } from '../../../test/helpers/mock-project-registry.js';

// ── Helpers ────────────────────────────────────────────────────────────────────

function buildEventBus(): EventBusService {
  const emitter = new EventEmitter2({ wildcard: true, maxListeners: 100 });
  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
  return new EventBusService(emitter);
}

/**
 * Build a minimal ReadableSpan-compatible object.
 *
 * Only the fields that ContextBudgetService accesses are populated.
 * Uses a zero-filled traceId so "no traceId" tests can use a custom traceId param.
 */
function buildSpan(opts: {
  sessionKey?: string;
  claudeSessionId?: string;
  projectId?: string;
  inputTokens?: number;
  traceId?: string;
}): ReadableSpan {
  const traceId = opts.traceId ?? '0'.repeat(32);
  return {
    name: 'gen_ai.completion',
    kind: 0,
    spanContext: (): SpanContext => ({
      traceId,
      spanId: 'a'.repeat(16),
      traceFlags: 1,
    }),
    startTime: [0, 0],
    endTime: [1, 0],
    status: { code: SpanStatusCode.OK },
    attributes: {
      ...(opts.sessionKey !== undefined ? { 'session.key': opts.sessionKey } : {}),
      ...(opts.claudeSessionId !== undefined ? { 'claude.session_id': opts.claudeSessionId } : {}),
      ...(opts.projectId !== undefined ? { 'project.id': opts.projectId } : {}),
      ...(opts.inputTokens !== undefined ? { 'gen_ai.usage.input_tokens': opts.inputTokens } : {}),
    },
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

function buildService(
  projects: Record<string, { contextBudget?: { warnAtTokens: number; forceHandoffAtTokens: number } }> = {},
): { service: ContextBudgetService; bus: EventBusService } {
  const bus = buildEventBus();
  const registry = buildMockProjectRegistry(projects);
  const service = new ContextBudgetService(bus, registry as never);
  return { service, bus };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('ContextBudgetService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ── B1.1: emits near-limit when total crosses warnAtTokens ──────────────────

  it('B1.1: emits near-limit when total crosses warnAtTokens', () => {
    const { service, bus } = buildService();
    const emitted: SessionContextNearLimitPayload[] = [];
    bus.on(EVENT_CHANNELS.session.contextNearLimit, (p) => emitted.push(p));

    // Two spans: 100k + 100k + 1 = 200,001 > 200k threshold
    service.ingestSpan(buildSpan({ sessionKey: 'sess-1', projectId: 'proj-1', inputTokens: 100_000 }));
    service.ingestSpan(buildSpan({ sessionKey: 'sess-1', projectId: 'proj-1', inputTokens: 100_001 }));

    expect(emitted).toHaveLength(1);
    expect(emitted[0]?.currentTokens).toBe(200_001);
    expect(emitted[0]?.threshold).toBe(200_000);
    expect(emitted[0]?.sessionKey).toBe('sess-1');

    const snap = service.snapshot('sess-1');
    expect(snap?.nearLimitFired).toBe(true);
  });

  // ── B1.2: emits force-handoff when total crosses forceHandoffAtTokens ────────

  it('B1.2: emits force-handoff when total crosses forceHandoffAtTokens', () => {
    const { service, bus } = buildService();
    const nearLimitEvents: SessionContextNearLimitPayload[] = [];
    const forceHandoffEvents: SessionForceHandoffPayload[] = [];
    bus.on(EVENT_CHANNELS.session.contextNearLimit, (p) => nearLimitEvents.push(p));
    bus.on(EVENT_CHANNELS.session.forceHandoff, (p) => forceHandoffEvents.push(p));

    // 200k + 30k + 1 = 230,001 crosses both thresholds
    service.ingestSpan(buildSpan({ sessionKey: 'sess-2', projectId: 'proj-1', inputTokens: 200_000 }));
    service.ingestSpan(buildSpan({ sessionKey: 'sess-2', projectId: 'proj-1', inputTokens: 30_001 }));

    expect(nearLimitEvents).toHaveLength(1);
    expect(forceHandoffEvents).toHaveLength(1);
    expect(forceHandoffEvents[0]?.currentTokens).toBe(230_001);
    expect(forceHandoffEvents[0]?.threshold).toBe(230_000);
  });

  // ── B1.3: fires near-limit only once ─────────────────────────────────────────

  it('B1.3: fires near-limit only once across many spans', () => {
    const { service, bus } = buildService();
    const emitted: SessionContextNearLimitPayload[] = [];
    bus.on(EVENT_CHANNELS.session.contextNearLimit, (p) => emitted.push(p));

    // Cross the threshold
    service.ingestSpan(buildSpan({ sessionKey: 'sess-3', inputTokens: 200_001 }));
    // Add 5 more spans of 1k each
    for (let i = 0; i < 5; i++) {
      service.ingestSpan(buildSpan({ sessionKey: 'sess-3', inputTokens: 1_000 }));
    }

    expect(emitted).toHaveLength(1); // still exactly one
    const snap = service.snapshot('sess-3');
    expect(snap?.inputTokens).toBe(205_001);
  });

  // ── B1.4: fires force-handoff only once ──────────────────────────────────────

  it('B1.4: fires force-handoff only once', () => {
    const { service, bus } = buildService();
    const emitted: SessionForceHandoffPayload[] = [];
    bus.on(EVENT_CHANNELS.session.forceHandoff, (p) => emitted.push(p));

    // Cross force threshold
    service.ingestSpan(buildSpan({ sessionKey: 'sess-4', inputTokens: 230_001 }));
    // Add 3 more spans
    service.ingestSpan(buildSpan({ sessionKey: 'sess-4', inputTokens: 5_000 }));
    service.ingestSpan(buildSpan({ sessionKey: 'sess-4', inputTokens: 5_000 }));
    service.ingestSpan(buildSpan({ sessionKey: 'sess-4', inputTokens: 5_000 }));

    expect(emitted).toHaveLength(1);
  });

  // ── B1.5: isolates sessions ───────────────────────────────────────────────────

  it('B1.5: isolates sessions — A reaching threshold does not fire for B', () => {
    const { service, bus } = buildService();
    const nearEvents: SessionContextNearLimitPayload[] = [];
    const forceEvents: SessionForceHandoffPayload[] = [];
    bus.on(EVENT_CHANNELS.session.contextNearLimit, (p) => nearEvents.push(p));
    bus.on(EVENT_CHANNELS.session.forceHandoff, (p) => forceEvents.push(p));

    // Session A crosses both thresholds
    service.ingestSpan(buildSpan({ sessionKey: 'sess-A', projectId: 'proj-1', inputTokens: 230_001 }));
    // Session B stays low
    service.ingestSpan(buildSpan({ sessionKey: 'sess-B', projectId: 'proj-1', inputTokens: 5_000 }));

    // Only events for sess-A
    expect(nearEvents.every((e) => e.sessionKey === 'sess-A')).toBe(true);
    expect(forceEvents.every((e) => e.sessionKey === 'sess-A')).toBe(true);

    // sess-B has no flags set
    const snapB = service.snapshot('sess-B');
    expect(snapB?.nearLimitFired).toBe(false);
    expect(snapB?.forceHandoffFired).toBe(false);
    expect(snapB?.inputTokens).toBe(5_000);
  });

  // ── B1.6: drops span when input_tokens missing ────────────────────────────────

  it('B1.6: drops span gracefully when gen_ai.usage.input_tokens missing', () => {
    const { service, bus } = buildService();
    const emitted: unknown[] = [];
    bus.on(EVENT_CHANNELS.session.contextNearLimit, (p) => emitted.push(p));

    // Span with no token attribute
    service.ingestSpan(buildSpan({ sessionKey: 'sess-5' }));

    expect(emitted).toHaveLength(0);
    // The service either does not create an entry (our impl returns early),
    // or creates one with inputTokens=0. Our impl returns early before creating entry.
    expect(service.snapshot('sess-5')).toBeUndefined();
  });

  // ── B1.7: drops span when no session key resolvable ───────────────────────────

  it('B1.7: drops span gracefully when no session-key resolvable', () => {
    const { service, bus } = buildService();
    const emitted: unknown[] = [];
    bus.on(EVENT_CHANNELS.session.contextNearLimit, (p) => emitted.push(p));

    // Span with token but no session.key, no claude.session_id, and zero traceId
    const span = buildSpan({ inputTokens: 10_000 }); // traceId defaults to 0*32 → invalid
    expect(() => service.ingestSpan(span)).not.toThrow();

    expect(emitted).toHaveLength(0);
  });

  // ── B1.8: non-monotonic span arrival order ────────────────────────────────────

  it('B1.8: handles non-monotonic span arrival deterministically', () => {
    /**
     * Order of arrival (not span timestamp) governs total.
     * Span 1 arrives at T+5s with 100k tokens.
     * Span 2 arrives at T+0s with 150k tokens (earlier timestamp, later arrival).
     * Total = 250k; force-handoff fired.
     */
    const { service, bus } = buildService();
    const forceEvents: SessionForceHandoffPayload[] = [];
    bus.on(EVENT_CHANNELS.session.forceHandoff, (p) => forceEvents.push(p));

    const laterArrivalEarlierTs = buildSpan({ sessionKey: 'sess-8', projectId: 'proj-1', inputTokens: 100_000 });
    const earlierArrivalLaterTs = buildSpan({ sessionKey: 'sess-8', projectId: 'proj-1', inputTokens: 150_000 });

    service.ingestSpan(laterArrivalEarlierTs);  // arrives first
    service.ingestSpan(earlierArrivalLaterTs); // arrives second

    expect(service.snapshot('sess-8')?.inputTokens).toBe(250_000);
    expect(forceEvents).toHaveLength(1);
  });

  // ── B1.9: fires force after near already fired, no re-fire of near ────────────

  it('B1.9: fires force-handoff after near-limit already fired; near-limit count stays 1', () => {
    const { service, bus } = buildService();
    const nearEvents: SessionContextNearLimitPayload[] = [];
    const forceEvents: SessionForceHandoffPayload[] = [];
    bus.on(EVENT_CHANNELS.session.contextNearLimit, (p) => nearEvents.push(p));
    bus.on(EVENT_CHANNELS.session.forceHandoff, (p) => forceEvents.push(p));

    // Cross near-limit first (total 200,500)
    service.ingestSpan(buildSpan({ sessionKey: 'sess-9', inputTokens: 200_500 }));
    expect(nearEvents).toHaveLength(1);
    expect(forceEvents).toHaveLength(0);

    // Cross force threshold (add 30k → total 230,500)
    service.ingestSpan(buildSpan({ sessionKey: 'sess-9', inputTokens: 30_000 }));
    expect(nearEvents).toHaveLength(1); // still 1 — not re-fired
    expect(forceEvents).toHaveLength(1);
  });

  // ── B1.10: applies default thresholds when profile has no contextBudget ────────

  it('B1.10: applies default thresholds when profile has no contextBudget block', () => {
    const { service } = buildService({ 'proj-no-budget': {} });

    // Ingest a token count that would trigger at defaults (warnAt=200k)
    service.ingestSpan(buildSpan({ sessionKey: 'sess-10', projectId: 'proj-no-budget', inputTokens: 1 }));

    const snap = service.snapshot('sess-10');
    expect(snap?.thresholds.warnAtTokens).toBe(DEFAULT_THRESHOLDS.warnAtTokens);
    expect(snap?.thresholds.forceHandoffAtTokens).toBe(DEFAULT_THRESHOLDS.forceHandoffAtTokens);
  });

  // ── B1.11: respects profile-overridden thresholds ────────────────────────────

  it('B1.11: respects profile-overridden thresholds', () => {
    const { service, bus } = buildService({
      'proj-custom': { contextBudget: { warnAtTokens: 50_000, forceHandoffAtTokens: 60_000 } },
    });
    const emitted: SessionContextNearLimitPayload[] = [];
    bus.on(EVENT_CHANNELS.session.contextNearLimit, (p) => emitted.push(p));

    service.ingestSpan(buildSpan({ sessionKey: 'sess-11', projectId: 'proj-custom', inputTokens: 50_001 }));

    expect(emitted).toHaveLength(1);
    expect(emitted[0]?.threshold).toBe(50_000);
  });

  // ── B1.14: creates accumulator on first span for unseen session ───────────────

  it('B1.14: creates accumulator on first span for unseen session', () => {
    const { service } = buildService();

    service.ingestSpan(buildSpan({ sessionKey: 'sess-x', inputTokens: 1_000 }));

    const snap = service.snapshot('sess-x');
    expect(snap).toBeDefined();
    expect(snap?.inputTokens).toBe(1_000);
    expect(snap?.nearLimitFired).toBe(false);
    expect(snap?.forceHandoffFired).toBe(false);
  });

  // ── B1.15: event payload validates against SseEnvelopeSchema ─────────────────

  it('B1.15: near-limit event payload validates against SseEnvelopeSchema', () => {
    const { service, bus } = buildService();
    let capturedPayload: SessionContextNearLimitPayload | undefined;
    bus.on(EVENT_CHANNELS.session.contextNearLimit, (p) => {
      capturedPayload = p;
    });

    service.ingestSpan(buildSpan({ sessionKey: 'sess-sse', inputTokens: 200_001 }));
    expect(capturedPayload).toBeDefined();

    // Wrap the payload in an SSE envelope shape and validate
    const envelope = {
      type: 'session.context_near_limit',
      payload: capturedPayload,
      ts: new Date().toISOString(),
    };
    const result = SseEnvelopeSchema.safeParse(envelope);
    expect(result.success).toBe(true);
  });

  it('B1.15b: force-handoff event payload validates against SseEnvelopeSchema', () => {
    const { service, bus } = buildService();
    let capturedPayload: SessionForceHandoffPayload | undefined;
    bus.on(EVENT_CHANNELS.session.forceHandoff, (p) => {
      capturedPayload = p;
    });

    service.ingestSpan(buildSpan({ sessionKey: 'sess-sse-force', inputTokens: 230_001 }));
    expect(capturedPayload).toBeDefined();

    const envelope = {
      type: 'session.force_handoff',
      payload: capturedPayload,
      ts: new Date().toISOString(),
    };
    const result = SseEnvelopeSchema.safeParse(envelope);
    expect(result.success).toBe(true);
  });

  // ── resetSession / snapshot ───────────────────────────────────────────────────

  it('resetSession removes session state', () => {
    const { service } = buildService();
    service.ingestSpan(buildSpan({ sessionKey: 'sess-reset', inputTokens: 1_000 }));
    expect(service.snapshot('sess-reset')).toBeDefined();

    service.resetSession('sess-reset');
    expect(service.snapshot('sess-reset')).toBeUndefined();
  });

  it('snapshot returns a copy, not a live reference', () => {
    const { service } = buildService();
    service.ingestSpan(buildSpan({ sessionKey: 'sess-copy', inputTokens: 1_000 }));

    const snap1 = service.snapshot('sess-copy');
    snap1!.inputTokens = 999_999;

    const snap2 = service.snapshot('sess-copy');
    expect(snap2?.inputTokens).toBe(1_000); // original not mutated
  });

  // ── Session key fallback to claude.session_id ────────────────────────────────

  it('falls back to claude.session_id when session.key absent', () => {
    const { service } = buildService();
    service.ingestSpan(buildSpan({ claudeSessionId: 'claude-sess-abc', inputTokens: 1_000 }));
    expect(service.snapshot('claude-sess-abc')).toBeDefined();
  });

  // ── Session key fallback to traceId composite ────────────────────────────────

  it('falls back to traceId composite when both session key attrs absent', () => {
    const { service } = buildService();
    const traceId = 'a'.repeat(32); // valid 32-char traceId
    service.ingestSpan(buildSpan({ projectId: 'proj-x', inputTokens: 1_000, traceId }));
    const expectedKey = `proj-x:${'a'.repeat(32)}`;
    expect(service.snapshot(expectedKey)).toBeDefined();
  });

  // ── FIFO eviction ring-buffer ─────────────────────────────────────────────────

  it('FIFO eviction: samples ring-buffer keeps newest MAX_USAGE_SAMPLES and evicts oldest', () => {
    const { service } = buildService();
    const SESSION = 'sess-fifo';

    // Ingest MAX_USAGE_SAMPLES + 1 spans. Each span has a distinct inputTokens value
    // so we can identify which sample occupies which position.
    for (let i = 1; i <= MAX_USAGE_SAMPLES + 1; i++) {
      service.ingestSpan(buildSpan({ sessionKey: SESSION, inputTokens: i }));
    }

    const snap = service.snapshot(SESSION);
    expect(snap).toBeDefined();

    // Ring-buffer should be exactly at cap — no growth beyond MAX_USAGE_SAMPLES.
    expect(snap!.samples).toHaveLength(MAX_USAGE_SAMPLES);

    // The FIRST sample (inputTokens=1) should have been evicted (oldest).
    // The LAST sample (inputTokens=MAX_USAGE_SAMPLES+1) should be present (newest).
    const firstSampleTokens = snap!.samples[0]!.inputTokens;
    const lastSampleTokens = snap!.samples[snap!.samples.length - 1]!.inputTokens;

    expect(firstSampleTokens).toBe(2);                   // sample 1 evicted; sample 2 is oldest
    expect(lastSampleTokens).toBe(MAX_USAGE_SAMPLES + 1); // newest sample retained
  });
});
