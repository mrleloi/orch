/**
 * use-sse-events.spec.ts — Tests for the useSseEvents hook.
 *
 * Uses MockEventSource from use-sse-events-fixtures to replace globalThis.EventSource
 * (jsdom has no native EventSource implementation).
 *
 * 8 tests:
 *  1. Connects on mount — mock opens → connected=true
 *  2. Dispatches valid envelopes — emit valid SseEnvelope JSON → onEvent called
 *  3. Drops malformed envelopes silently — emit non-JSON → onEvent NOT called, console.warn called
 *  3b. Drops valid-JSON invalid-shape envelopes — zod fail branch → onEvent NOT called, console.warn called
 *  4. Honours filter — set filter: ['session.started'], emit 'hook.received' → onEvent NOT called
 *  5. Reconnects after error with exponential backoff — 5 attempts; verifies 10000ms cap
 *  6. Cleans up on unmount — close() called; no further timers pending
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSseEvents } from './use-sse-events';
import {
  installMockEventSource,
  getLastMockEventSource,
  getAllMockEventSources,
} from './use-sse-events-fixtures';

// A valid SseEnvelope for use in tests
const VALID_ENVELOPE_OBJ = {
  type: 'session.started',
  payload: { sessionId: 'abc' },
  ts: '2024-01-15T10:00:00.000Z',
};
const VALID_ENVELOPE_JSON = JSON.stringify(VALID_ENVELOPE_OBJ);

describe('useSseEvents', () => {
  let restoreMockEventSource: () => void;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    restoreMockEventSource = installMockEventSource();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
    restoreMockEventSource();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  // ── Test 0: URL passed through opaquely ────────────────────────────────────

  it('opens EventSource with URL exactly as passed', () => {
    const onEvent = vi.fn();
    const url = '/api/v1/events/stream?token=abc%20%26def';
    renderHook(() => useSseEvents({ url, onEvent }));

    const es = getLastMockEventSource();
    expect(es.url).toBe(url);
  });

  // ── Test 1: Connects on mount ───────────────────────────────────────────────

  it('sets connected=true when EventSource opens', async () => {
    const onEvent = vi.fn();
    const { result } = renderHook(() =>
      useSseEvents({ url: '/api/v1/events/stream', onEvent }),
    );

    expect(result.current.connected).toBe(false);

    const es = getLastMockEventSource();
    act(() => {
      es._emitOpen();
    });

    expect(result.current.connected).toBe(true);
    expect(result.current.lastError).toBeNull();
  });

  // ── Test 2: Dispatches valid envelopes ─────────────────────────────────────

  it('calls onEvent with parsed envelope for valid messages', () => {
    const onEvent = vi.fn();
    renderHook(() => useSseEvents({ url: '/api/v1/events/stream', onEvent }));

    const es = getLastMockEventSource();
    act(() => {
      es._emitOpen();
      es._emitMessage(VALID_ENVELOPE_JSON);
    });

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'session.started' }),
    );
  });

  // ── Test 3: Drops malformed envelopes silently ─────────────────────────────

  it('drops malformed envelopes silently and warns', () => {
    const onEvent = vi.fn();

    renderHook(() => useSseEvents({ url: '/api/v1/events/stream', onEvent }));

    const es = getLastMockEventSource();
    act(() => {
      es._emitOpen();
      es._emitMessage('not valid json {{{');
    });

    expect(onEvent).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[useSseEvents]'),
      expect.anything(),
    );
  });

  // ── Test 3b: Drops valid-JSON invalid-shape envelopes (zod fail branch) ────

  it('drops valid JSON with invalid envelope shape and warns with [useSseEvents]', () => {
    const onEvent = vi.fn();

    renderHook(() => useSseEvents({ url: '/api/v1/events/stream', onEvent }));

    const es = getLastMockEventSource();
    act(() => {
      es._emitOpen();
      // Valid JSON, but type is not a known EventType — fails zod schema
      es._emitMessage(JSON.stringify({ type: 'unknown.event', payload: {}, ts: '2026-01-01T00:00:00.000Z' }));
    });

    expect(onEvent).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[useSseEvents]'),
      expect.anything(),
    );
  });

  // ── Test 4: Honours filter ──────────────────────────────────────────────────

  it('does not dispatch events not in the filter list', () => {
    const onEvent = vi.fn();

    const hookReceived = JSON.stringify({
      type: 'hook.received',
      payload: {},
      ts: '2024-01-15T10:00:00.000Z',
    });

    renderHook(() =>
      useSseEvents({
        url: '/api/v1/events/stream',
        filter: ['session.started'],
        onEvent,
      }),
    );

    const es = getLastMockEventSource();
    act(() => {
      es._emitOpen();
      es._emitMessage(hookReceived);
    });

    expect(onEvent).not.toHaveBeenCalled();
  });

  // ── Test 5: Reconnects with exponential backoff and 10000ms cap ───────────

  it('reconnects after error with exponential backoff and caps delay at 10000ms', () => {
    vi.useFakeTimers();
    const onEvent = vi.fn();

    renderHook(() => useSseEvents({ url: '/api/v1/events/stream', onEvent }));

    // Initial connection: 1 instance
    let es = getLastMockEventSource();
    act(() => { es._emitOpen(); });
    expect(getAllMockEventSources()).toHaveLength(1);

    // Error 1 → schedule reconnect at 500ms (attempt=0)
    act(() => { es._emitError(); });
    expect(getAllMockEventSources()).toHaveLength(1); // no reconnect yet
    act(() => { vi.advanceTimersByTime(500); });
    expect(getAllMockEventSources()).toHaveLength(2);

    // Error 2 → schedule reconnect at 1000ms (attempt=1)
    es = getLastMockEventSource();
    act(() => { es._emitError(); });
    expect(getAllMockEventSources()).toHaveLength(2);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(getAllMockEventSources()).toHaveLength(3);

    // Error 3 → schedule reconnect at 2000ms (attempt=2)
    es = getLastMockEventSource();
    act(() => { es._emitError(); });
    expect(getAllMockEventSources()).toHaveLength(3);
    act(() => { vi.advanceTimersByTime(2000); });
    expect(getAllMockEventSources()).toHaveLength(4);

    // Error 4 → schedule reconnect at 4000ms (attempt=3)
    es = getLastMockEventSource();
    act(() => { es._emitError(); });
    expect(getAllMockEventSources()).toHaveLength(4);
    act(() => { vi.advanceTimersByTime(4000); });
    expect(getAllMockEventSources()).toHaveLength(5);

    // Error 5 → schedule reconnect at 8000ms (attempt=4)
    es = getLastMockEventSource();
    act(() => { es._emitError(); });
    expect(getAllMockEventSources()).toHaveLength(5);
    act(() => { vi.advanceTimersByTime(8000); });
    expect(getAllMockEventSources()).toHaveLength(6);

    // Error 6 → uncapped would be 500*2^5=16000ms; cap enforces 10000ms
    es = getLastMockEventSource();
    act(() => { es._emitError(); });
    expect(getAllMockEventSources()).toHaveLength(6);

    // Advancing 9999ms should NOT yet trigger reconnect
    act(() => { vi.advanceTimersByTime(9999); });
    expect(getAllMockEventSources()).toHaveLength(6);

    // Advancing the final 1ms (total 10000ms) MUST trigger reconnect (not 16000ms)
    act(() => { vi.advanceTimersByTime(1); });
    expect(getAllMockEventSources()).toHaveLength(7);
  });

  // ── Test 6: Cleans up on unmount ───────────────────────────────────────────

  it('calls close() on the EventSource and cancels timers on unmount', () => {
    vi.useFakeTimers();
    const onEvent = vi.fn();

    const { unmount } = renderHook(() =>
      useSseEvents({ url: '/api/v1/events/stream', onEvent }),
    );

    const es = getLastMockEventSource();
    act(() => { es._emitOpen(); });

    // Trigger an error to set up a pending backoff timer
    act(() => { es._emitError(); });
    // Don't advance timers — there's a pending timer

    // Unmount should close the connection and cancel the timer
    unmount();

    expect(es.readyState).toBe(2); // CLOSED

    // After unmount, advancing timers should NOT create a new EventSource
    const countBefore = getAllMockEventSources().length;
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(getAllMockEventSources()).toHaveLength(countBefore); // no new instances
  });
});
