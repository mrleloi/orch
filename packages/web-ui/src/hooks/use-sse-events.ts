/**
 * use-sse-events.ts — React hook for consuming the Orch SSE stream.
 *
 * Part B signature (verbatim):
 *   useSseEvents(opts: UseSseEventsOptions): UseSseEventsResult
 *
 * Implementation notes:
 *   - Uses browser EventSource. Tests replace globalThis.EventSource with MockEventSource.
 *   - Auth: caller is expected to pass a URL including `?token=<urlencoded>` query param —
 *     BearerAuthGuard accepts the fallback path (see `bearer-auth.guard.ts` lines 74-91).
 *   - On mount: open EventSource; set connected=true on `open`.
 *   - `message` event: parse JSON → zod-validate via parseSseEnvelope (I-10) → apply filter →
 *     call onEvent. Drop malformed with console.warn.
 *   - `error` event: set connected=false; reconnect with exponential backoff
 *     (500ms → 1000ms → 2000ms → 4000ms → capped at 10000ms).
 *   - On unmount: close EventSource, cancel pending backoff timer.
 *
 * I-3: No @anthropic-ai / openai imports.
 * I-4: No @orch/core imports — communicates only via HTTP/SSE.
 * I-10: Every SSE envelope zod-validated via parseSseEnvelope from @orch/shared.
 */

import { useEffect, useRef, useState } from 'react';
import type { SseEnvelope, EventType } from '@orch/shared';
import { parseSseEnvelope } from '@orch/shared';

export interface UseSseEventsOptions {
  url: string;
  filter?: EventType[];
  onEvent: (env: SseEnvelope) => void;
}

export interface UseSseEventsResult {
  connected: boolean;
  lastError: Error | null;
}

// ── Backoff configuration ─────────────────────────────────────────────────────

const BACKOFF_BASE_MS = 500;
const BACKOFF_MAX_MS = 10_000;

function getBackoffDelay(attempt: number): number {
  const delay = BACKOFF_BASE_MS * Math.pow(2, attempt);
  return Math.min(delay, BACKOFF_MAX_MS);
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useSseEvents(opts: UseSseEventsOptions): UseSseEventsResult {
  const [connected, setConnected] = useState(false);
  const [lastError, setLastError] = useState<Error | null>(null);

  // Stable refs hold latest option values without needing to re-run effects.
  // Updated inside a layout effect to keep them in sync without triggering linter.
  const onEventRef = useRef<(env: SseEnvelope) => void>(opts.onEvent);
  const filterRef = useRef<EventType[] | undefined>(opts.filter);
  const urlRef = useRef<string>(opts.url);

  // Sync latest prop values into refs each render via layout effect.
  useEffect(() => {
    onEventRef.current = opts.onEvent;
    filterRef.current = opts.filter;
    urlRef.current = opts.url;
  });

  useEffect(() => {
    let es: EventSource | null = null;
    let attempt = 0;
    let timerId: ReturnType<typeof setTimeout> | null = null;
    let unmounted = false;

    function openConnection(): void {
      if (unmounted) return;

      const EsConstructor = (
        globalThis as unknown as { EventSource: new (url: string) => EventSource }
      ).EventSource;

      es = new EsConstructor(urlRef.current);

      es.onopen = (): void => {
        if (unmounted) return;
        attempt = 0;
        setConnected(true);
        setLastError(null);
      };

      es.onmessage = (event: MessageEvent): void => {
        if (unmounted) return;

        let parsed: unknown;
        try {
          parsed = JSON.parse(event.data as string) as unknown;
        } catch {
          console.warn('[useSseEvents] Received non-JSON message — dropping:', event.data);
          return;
        }

        // I-10: validate via zod
        const envelope = parseSseEnvelope(parsed);
        if (!envelope) {
          console.warn('[useSseEvents] Malformed SSE envelope — dropping:', parsed);
          return;
        }

        // Apply filter if provided
        const filter = filterRef.current;
        if (filter !== undefined && filter.length > 0 && !filter.includes(envelope.type)) {
          return;
        }

        onEventRef.current(envelope);
      };

      es.onerror = (): void => {
        if (unmounted) return;

        setConnected(false);
        setLastError(new Error('SSE connection error'));

        // Close the current connection before reconnecting
        es?.close();
        es = null;

        // Schedule reconnect with exponential backoff
        const delay = getBackoffDelay(attempt);
        attempt += 1;

        timerId = setTimeout(() => {
          timerId = null;
          openConnection();
        }, delay);
      };
    }

    openConnection();

    return (): void => {
      unmounted = true;

      // Cancel pending backoff timer
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }

      // Close current EventSource
      if (es !== null) {
        es.close();
        es = null;
      }
    };
  }, []);

  return { connected, lastError };
}
