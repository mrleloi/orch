/**
 * ActivityPage — Agent-Monitor activity feed for route `/activity`.
 *
 * Part B signature (verbatim): export function ActivityPage(): JSX.Element
 *
 * Features:
 *   - Local ring-buffer state: events: ActivityEntry[] (NOT TanStack)
 *   - Subscribes to ALL SSE events (filter: undefined — all-events paradigm)
 *   - Prepend semantics: newest event at top (index 0 via appendBounded)
 *   - Capped at 200 entries via appendBounded (ring buffer)
 *   - Connection status badge (green = connected, red = disconnected)
 *   - Empty state: "Waiting for events..."
 *
 * I-4: No @orch/core imports.
 * I-3: No @anthropic-ai / openai imports.
 * I-10: SSE envelope validation handled inside useSseEvents (parseSseEnvelope).
 */

import { useState, useCallback, useRef, type JSX } from 'react';
import type { SseEnvelope, EventType } from '@orch/shared';
import { useSseEvents } from '../hooks/use-sse-events.js';
import { useTokenGate } from '../auth/token-gate-context.js';
import { appendBounded } from '../lib/bounded-ring.js';
import { buildSseStreamUrl } from '../lib/sse-url.js';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ActivityEntry {
  id: string;
  type: EventType;
  trace_id: string | null;
  ts: string;
  receivedAt: number;
  payloadPreview: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const MAX_EVENTS = 200;

// ── ActivityPage ───────────────────────────────────────────────────────────────

/**
 * ActivityPage — live activity feed rendered from the SSE stream.
 * Maintains local state via a bounded ring buffer; does NOT use TanStack Query.
 */
export function ActivityPage(): JSX.Element {
  const { token } = useTokenGate();

  // Monotonic counter to disambiguate events sharing the same `ts` millisecond.
  // Ref (not state) so it doesn't trigger re-renders.
  const counterRef = useRef(0);

  const [events, setEvents] = useState<ActivityEntry[]>([]);

  const handleSseEvent = useCallback((envelope: SseEnvelope): void => {
    const counter = counterRef.current++;

    // Risk #5: payloadPreview — guard against circular/huge payloads
    let payloadPreview: string;
    try {
      payloadPreview = JSON.stringify(envelope.payload).slice(0, 120);
    } catch {
      payloadPreview = '[unserializable]';
    }

    const entry: ActivityEntry = {
      id: `${envelope.ts}-${counter}`,
      type: envelope.type,
      trace_id: envelope.trace_id ?? null,
      ts: envelope.ts,
      receivedAt: Date.now(),
      payloadPreview,
    };

    setEvents((prev) => appendBounded(prev, entry, MAX_EVENTS));
  }, []);

  // filter: undefined — receives ALL event types (all-events paradigm)
  const { connected, lastError } = useSseEvents({
    url: buildSseStreamUrl(token),
    filter: undefined,
    onEvent: handleSseEvent,
  });

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <main data-testid="page-activity" className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Activity Feed</h1>

        {/* Connection status badge */}
        <span
          data-testid="activity-connection-badge"
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
            connected
              ? 'bg-green-100 text-green-800'
              : 'bg-red-100 text-red-800'
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`}
          />
          {connected ? 'Connected' : 'Disconnected'}
          {!connected && lastError != null && (
            <span className="ml-1 opacity-75">— {lastError.message}</span>
          )}
        </span>
      </div>

      {events.length === 0 ? (
        <p data-testid="activity-empty">Waiting for events...</p>
      ) : (
        <ul data-testid="activity-list" className="space-y-1 font-mono text-sm">
          {events.map((entry) => (
            <li key={entry.id} className="flex gap-2 rounded border px-3 py-1.5">
              <span className="text-muted-foreground shrink-0">
                {new Date(entry.ts).toLocaleTimeString()}
              </span>
              <span className="font-semibold shrink-0">{entry.type}</span>
              {entry.trace_id != null && (
                <span className="text-muted-foreground shrink-0 truncate max-w-[8rem]">
                  {entry.trace_id}
                </span>
              )}
              <span className="truncate text-muted-foreground">{entry.payloadPreview}</span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
