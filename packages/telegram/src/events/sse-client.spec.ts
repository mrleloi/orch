/**
 * sse-client.spec.ts — Tests for the SSE client (Task 2.5 A1).
 *
 * Tests 1-8:
 *  1. Connects on start() with bearer header
 *  2. Parses valid data envelope → calls onEvent handler
 *  3. Malformed JSON → logger.warn, no throw, no onEvent call
 *  4. Envelope failing SseEnvelopeSchema → logger.warn, dropped
 *  5. Heartbeat `: keepalive` ignored (no onEvent call)
 *  6. Disconnect mid-stream → reconnects with first backoff [1000ms]
 *  7. HTTP 401 → logger.error + process.exit(1) called (mock process.exit)
 *  8. stop() aborts fetch + clears reconnect timer
 *
 * Strategy:
 *  - For parsing tests (2-5): create a body that completes instantly,
 *    then call stop() immediately so the loop doesn't wait for backoff.
 *  - For reconnect (6): use fake timers only for the backoff phase.
 *  - For 401 (7): process.exit mock throws, propagating through start().
 *  - For stop (8): stop() sets the stopped flag; verify no second fetch.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import pino from 'pino';

// Mock undici before importing sse-client
vi.mock('undici', () => ({
  fetch: vi.fn(),
}));

// Mock @opentelemetry/api to avoid needing SDK.
// We capture startSpan calls so tests can assert on per-event spans (Task 2.9).
const mockSpan = {
  setStatus: vi.fn(),
  end: vi.fn(),
};

// Shared mock tracer — always the same object so startSpan is always the same spy
const mockTracer = {
  startSpan: vi.fn(() => mockSpan),
};

const mockSpanContext = {
  traceId: 'aabb112233445566aabb112233445566',
  spanId: 'cafebabecafebabe',
  traceFlags: 1,
};

vi.mock('@opentelemetry/api', () => ({
  trace: {
    getTracer: vi.fn(() => mockTracer),
    setSpan: vi.fn((_ctx: unknown, _span: unknown) => 'mock-span-ctx'),
    getActiveSpan: vi.fn(() => ({
      spanContext: () => mockSpanContext,
    })),
  },
  context: {
    active: vi.fn(() => 'mock-root-ctx'),
    with: vi.fn((_ctx: unknown, fn: () => void) => fn()),
  },
  propagation: {
    extract: vi.fn((_ctx: unknown, _carrier: unknown) => 'mock-extracted-ctx'),
  },
  SpanStatusCode: {
    OK: 1,
    ERROR: 2,
  },
}));

import { fetch } from 'undici';
import { createSseClient } from './sse-client.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSilentLogger() {
  return pino({ level: 'silent' });
}

const encoder = new TextEncoder();

/**
 * Make a body from static chunks — the body resolves all chunks immediately
 * then signals done. The start() loop will then try to reconnect after backoff.
 */
function makeStaticBody(chunks: string[]): AsyncIterable<Uint8Array> {
  return {
    [Symbol.asyncIterator]() {
      let i = 0;
      return {
        async next() {
          if (i >= chunks.length) {
            return { value: undefined as unknown as Uint8Array, done: true };
          }
          return { value: encoder.encode(chunks[i++]), done: false as const };
        },
      };
    },
  };
}

/**
 * Body that blocks until the provided promise resolves, then emits done.
 * Used to simulate a hanging connection for stop() tests.
 */
function makeHangingBody(gate: Promise<void>): AsyncIterable<Uint8Array> {
  return {
    [Symbol.asyncIterator]() {
      let waited = false;
      return {
        async next() {
          if (!waited) {
            waited = true;
            await gate;
          }
          return { value: undefined as unknown as Uint8Array, done: true };
        },
      };
    },
  };
}

function makeOkResponse(body: AsyncIterable<Uint8Array>) {
  return { ok: true, status: 200, body };
}

function make401Response() {
  return { ok: false, status: 401, body: null };
}

const mockedFetch = vi.mocked(fetch);

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SseClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Test 1: Connects with bearer header
  it('test-1: connects with Authorization bearer header', async () => {
    // Body that yields one event then ends
    const body = makeStaticBody([
      'data: {"type":"session.ended","payload":{},"ts":"2026-04-25T10:00:00Z"}\n\n',
    ]);
    mockedFetch.mockResolvedValue(makeOkResponse(body) as never);

    const logger = makeSilentLogger();
    const client = createSseClient({
      url: 'http://localhost:4141/api/v1/events/stream',
      bearerToken: 'my-token',
      logger,
      // Large backoff — we'll stop() before it fires
      reconnectBackoffMs: [600_000],
    });

    // start() in background; stop() before reconnect backoff timer fires
    const startPromise = client.start();

    // Give the connection cycle enough time to complete
    // The body finishes synchronously, then start() sets a 600s timer
    // We stop before the timer fires
    await new Promise((resolve) => setTimeout(resolve, 50));
    await client.stop();
    await startPromise;

    expect(mockedFetch).toHaveBeenCalledWith(
      'http://localhost:4141/api/v1/events/stream',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer my-token',
        }),
      }),
    );
  }, 10_000);

  // Test 2: Parses valid data envelope → calls onEvent handler
  it('test-2: parses valid SSE envelope and calls onEvent handler', async () => {
    const body = makeStaticBody([
      'data: {"type":"session.started","payload":{"projectId":"proj-1"},"ts":"2026-04-25T10:00:00Z"}\n\n',
    ]);
    mockedFetch.mockResolvedValue(makeOkResponse(body) as never);

    const logger = makeSilentLogger();
    const client = createSseClient({
      url: 'http://localhost:4141/api/v1/events/stream',
      bearerToken: 'tok',
      logger,
      reconnectBackoffMs: [600_000],
    });

    const received: unknown[] = [];
    client.onEvent((env) => received.push(env));

    const startPromise = client.start();
    await new Promise((resolve) => setTimeout(resolve, 50));
    await client.stop();
    await startPromise;

    expect(received).toHaveLength(1);
    expect((received[0] as { type: string }).type).toBe('session.started');
  }, 10_000);

  // Test 3: Malformed JSON → logger.warn, no throw, no onEvent call
  it('test-3: malformed JSON → logger.warn, no throw, no onEvent', async () => {
    const body = makeStaticBody(['data: {not valid json}\n\n']);
    mockedFetch.mockResolvedValue(makeOkResponse(body) as never);

    const logger = makeSilentLogger();
    const warnSpy = vi.spyOn(logger, 'warn');
    const client = createSseClient({
      url: 'http://localhost:4141/api/v1/events/stream',
      bearerToken: 'tok',
      logger,
      reconnectBackoffMs: [600_000],
    });

    const received: unknown[] = [];
    client.onEvent((env) => received.push(env));

    const startPromise = client.start();
    await new Promise((resolve) => setTimeout(resolve, 50));
    await client.stop();
    await startPromise;

    expect(received).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ raw: expect.any(String) }),
      'sse-client:malformed-json',
    );
  }, 10_000);

  // Test 4: Envelope failing SseEnvelopeSchema → logger.warn, dropped
  it('test-4: schema validation failure → logger.warn, no onEvent', async () => {
    // Valid JSON but missing required 'ts' field
    const body = makeStaticBody(['data: {"type":"session.started","payload":{}}\n\n']);
    mockedFetch.mockResolvedValue(makeOkResponse(body) as never);

    const logger = makeSilentLogger();
    const warnSpy = vi.spyOn(logger, 'warn');
    const client = createSseClient({
      url: 'http://localhost:4141/api/v1/events/stream',
      bearerToken: 'tok',
      logger,
      reconnectBackoffMs: [600_000],
    });

    const received: unknown[] = [];
    client.onEvent((env) => received.push(env));

    const startPromise = client.start();
    await new Promise((resolve) => setTimeout(resolve, 50));
    await client.stop();
    await startPromise;

    expect(received).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ issues: expect.any(Array) }),
      'sse-client:schema-validation-failed',
    );
  }, 10_000);

  // Test 5: Heartbeat comment lines are ignored
  it('test-5: heartbeat `: keepalive` lines are ignored', async () => {
    const body = makeStaticBody([
      ': keepalive\n\n',
      'data: {"type":"session.ended","payload":{},"ts":"2026-04-25T10:00:00Z"}\n\n',
    ]);
    mockedFetch.mockResolvedValue(makeOkResponse(body) as never);

    const logger = makeSilentLogger();
    const client = createSseClient({
      url: 'http://localhost:4141/api/v1/events/stream',
      bearerToken: 'tok',
      logger,
      reconnectBackoffMs: [600_000],
    });

    const received: unknown[] = [];
    client.onEvent((env) => received.push(env));

    const startPromise = client.start();
    await new Promise((resolve) => setTimeout(resolve, 50));
    await client.stop();
    await startPromise;

    // Heartbeat ignored; only the session.ended event received
    expect(received).toHaveLength(1);
    expect((received[0] as { type: string }).type).toBe('session.ended');
  }, 10_000);

  // Test 6: Disconnect → reconnects with first backoff delay
  it('test-6: connection error triggers reconnect with first backoff', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    // First call: throws network error
    mockedFetch.mockRejectedValueOnce(new Error('Connection reset'));

    // Second call: immediate empty body
    const body2 = makeStaticBody([]);
    mockedFetch.mockResolvedValue(makeOkResponse(body2) as never);

    const logger = makeSilentLogger();
    const client = createSseClient({
      url: 'http://localhost:4141/api/v1/events/stream',
      bearerToken: 'tok',
      logger,
      reconnectBackoffMs: [1_000, 600_000],
    });

    const startPromise = client.start();

    // Tick through: first fetch rejects, backoff timer set for 1000ms
    await vi.advanceTimersByTimeAsync(1_100);

    // Reconnect should have happened
    expect(mockedFetch).toHaveBeenCalledTimes(2);

    // Stop before the second reconnect's backoff
    await client.stop();
    await startPromise;

    vi.useRealTimers();
  }, 10_000);

  // Test 7: HTTP 401 → logger.error + process.exit(1)
  it('test-7: HTTP 401 → logger.error + process.exit(1)', async () => {
    mockedFetch.mockResolvedValueOnce(make401Response() as never);

    const logger = makeSilentLogger();
    const errorSpy = vi.spyOn(logger, 'error');
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((_code) => {
      throw new Error('process.exit called');
    });

    const client = createSseClient({
      url: 'http://localhost:4141/api/v1/events/stream',
      bearerToken: 'tok',
      logger,
      reconnectBackoffMs: [600_000],
    });

    // process.exit is mocked to throw; the client wraps it in UnauthorizedExitError
    // which is re-thrown from start() (not swallowed by retry loop)
    await expect(client.start()).rejects.toThrow('401');

    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({ status: 401 }),
      'sse-client:unauthorized-exit',
    );
    expect(exitSpy).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
  }, 10_000);

  // Test 8: stop() aborts fetch + clears reconnect timer
  it('test-8: stop() aborts in-flight connection, no reconnect', async () => {
    // Hanging body — blocks until gate resolves
    let gateResolve: (() => void) | undefined;
    const gate = new Promise<void>((r) => { gateResolve = r; });
    const body = makeHangingBody(gate);
    mockedFetch.mockResolvedValue(makeOkResponse(body) as never);

    const logger = makeSilentLogger();
    const client = createSseClient({
      url: 'http://localhost:4141/api/v1/events/stream',
      bearerToken: 'tok',
      logger,
      reconnectBackoffMs: [600_000],
    });

    const startPromise = client.start();

    // Give connection time to establish and start waiting on body
    await new Promise((resolve) => setTimeout(resolve, 30));

    // Verify fetch was called
    expect(mockedFetch).toHaveBeenCalledTimes(1);

    // Stop the client
    await client.stop();

    // Resolve the hanging gate so the body can end
    gateResolve?.();

    // Start should resolve cleanly
    await startPromise;

    // Only one fetch call — stop() prevented reconnect
    expect(mockedFetch).toHaveBeenCalledTimes(1);
  }, 10_000);

  // Test 9 (Task 2.9): envelope with trace_id creates child span via propagation.extract
  it('test-9: envelope with trace_id triggers propagation.extract + per-event span', async () => {
    const TRACE_ID = 'aabb112233445566aabb112233445566';
    const SPAN_ID = 'cafebabecafebabe';
    const envelope = JSON.stringify({
      type: 'session.started',
      payload: { projectId: 'proj-x' },
      trace_id: TRACE_ID,
      span_id: SPAN_ID,
      ts: '2026-04-25T10:00:00Z',
    });
    const body = makeStaticBody([`data: ${envelope}\n\n`]);
    mockedFetch.mockResolvedValue(makeOkResponse(body) as never);

    // Reset mock call counts before this test
    mockSpan.end.mockClear();
    mockTracer.startSpan.mockClear();

    // Import the mocked propagation to spy on it
    const { propagation: mockedPropagation } =
      await import('@opentelemetry/api');
    const extractSpy = vi.mocked(mockedPropagation.extract);
    extractSpy.mockClear();

    const logger = makeSilentLogger();
    const received: unknown[] = [];
    const client = createSseClient({
      url: 'http://localhost:4141/api/v1/events/stream',
      bearerToken: 'tok',
      logger,
      reconnectBackoffMs: [600_000],
    });
    client.onEvent((env) => received.push(env));

    const startPromise = client.start();
    await new Promise((resolve) => setTimeout(resolve, 50));
    await client.stop();
    await startPromise;

    // Event should be dispatched
    expect(received).toHaveLength(1);

    // propagation.extract must have been called with the synthetic traceparent
    expect(extractSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        traceparent: `00-${TRACE_ID}-${SPAN_ID}-01`,
      }),
    );

    // A per-event span must have been started
    expect(mockTracer.startSpan).toHaveBeenCalledWith(
      'sse.event.handle',
      expect.anything(),
      expect.anything(),
    );

    // The span must have been ended
    expect(mockSpan.end).toHaveBeenCalled();
  }, 10_000);
});
