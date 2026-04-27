/**
 * use-sse-events-fixtures.ts — MockEventSource for jsdom test environments.
 *
 * jsdom has no native EventSource implementation. This module provides a
 * controllable fake that patches globalThis.EventSource in beforeEach/afterEach.
 *
 * Usage in tests:
 *   import { installMockEventSource, getLastMockEventSource } from './use-sse-events-fixtures';
 *   let restore: () => void;
 *   beforeEach(() => { restore = installMockEventSource(); });
 *   afterEach(() => { restore(); });
 *   it('connects', () => {
 *     renderHook(() => useSseEvents({ url: '/stream', onEvent: vi.fn() }));
 *     const es = getLastMockEventSource();
 *     es._emitOpen();
 *     ...
 *   });
 */

/** Minimal MessageEvent-like shape used in tests. */
export interface FakeMessageEvent {
  data: string;
}

/** Minimal Event-like shape for error events. */
export interface FakeEvent {
  type: string;
}

/**
 * MockEventSource — implements the EventSource API surface needed by useSseEvents.
 *
 * Constructed URL is stored as `url` so tests can assert which URL was opened.
 */
export class MockEventSource {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;

  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSED = 2;

  readyState: number = MockEventSource.CONNECTING;
  url: string;

  onmessage: ((ev: FakeMessageEvent) => void) | null = null;
  onerror: ((ev: FakeEvent) => void) | null = null;
  onopen: ((ev: FakeEvent) => void) | null = null;

  constructor(url: string) {
    this.url = url;
  }

  close(): void {
    this.readyState = MockEventSource.CLOSED;
  }

  /** Simulate a successful connection open event. */
  _emitOpen(): void {
    this.readyState = MockEventSource.OPEN;
    this.onopen?.({ type: 'open' });
  }

  /** Simulate a message event with the given JSON-stringified data. */
  _emitMessage(data: string): void {
    this.onmessage?.({ data });
  }

  /** Simulate a connection error event. */
  _emitError(): void {
    this.readyState = MockEventSource.CONNECTING;
    this.onerror?.({ type: 'error' });
  }
}

// ── Global patch helpers ──────────────────────────────────────────────────────

/** Tracks all MockEventSource instances created during a test. */
const _instances: MockEventSource[] = [];

/**
 * Installs MockEventSource as globalThis.EventSource.
 * Returns a restore function to call in afterEach.
 */
export function installMockEventSource(): () => void {
  _instances.length = 0;

  const originalEventSource = (globalThis as Record<string, unknown>)[
    'EventSource'
  ];

  // Wrap MockEventSource so we can track instances
  const TrackedMockEventSource = class extends MockEventSource {
    constructor(url: string) {
      super(url);
      _instances.push(this);
    }
  };

  (globalThis as Record<string, unknown>)['EventSource'] =
    TrackedMockEventSource;

  return function restore(): void {
    if (originalEventSource === undefined) {
      delete (globalThis as Record<string, unknown>)['EventSource'];
    } else {
      (globalThis as Record<string, unknown>)['EventSource'] =
        originalEventSource;
    }
    _instances.length = 0;
  };
}

/**
 * Returns the most recently constructed MockEventSource instance.
 * Throws if no instance exists (indicates renderHook did not trigger construction).
 */
export function getLastMockEventSource(): MockEventSource {
  const last = _instances[_instances.length - 1];
  if (!last) {
    throw new Error('No MockEventSource instance found — was installMockEventSource() called?');
  }
  return last;
}

/**
 * Returns all MockEventSource instances created since last installMockEventSource() call.
 * Useful for reconnect tests that verify multiple instances are created.
 */
export function getAllMockEventSources(): MockEventSource[] {
  return [..._instances];
}
