/**
 * activity.spec.tsx — Tests for ActivityPage.
 *
 * 10 tests covering the Agent-Monitor ring-buffer activity feed:
 *  1.  renders placeholder when no events yet
 *  2.  renders single event after emit
 *  3.  renders newest at top (reverse-chronological DOM order)
 *  4.  caps at 200 entries
 *  5.  drops malformed envelopes (list stays empty, no crash)
 *  6.  no filter — receives events of any known type
 *  7.  shows connected badge when open
 *  8.  shows disconnected badge on error
 *  9.  SSE URL includes ?token= from TokenGate
 * 10.  useSseEvents is called with filter = undefined (all-events paradigm)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import type { ReactNode, JSX } from 'react';
import { ActivityPage } from './ActivityPage.js';
import {
  installMockEventSource,
  getLastMockEventSource,
} from '../hooks/use-sse-events-fixtures.js';
import { TokenGateContext } from '../auth/token-gate-context.js';
import * as useSseEventsModule from '../hooks/use-sse-events.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

interface WrapperProps {
  token?: string;
  children: ReactNode;
}

function Wrapper({ token = 'test-token', children }: WrapperProps): JSX.Element {
  return (
    <TokenGateContext.Provider value={{ token, onUnauthorized: () => undefined }}>
      {children as JSX.Element}
    </TokenGateContext.Provider>
  );
}

function renderActivity(token?: string) {
  return render(
    <Wrapper token={token}>
      <ActivityPage />
    </Wrapper>,
  );
}

/** Build a valid SSE envelope JSON string for a given type and ts. */
function makeEnvelopeJson(
  type: string,
  ts: string = new Date().toISOString(),
  payload: unknown = {},
): string {
  return JSON.stringify({ type, payload, ts });
}

// ── MockEventSource install / restore ─────────────────────────────────────────

let restoreEventSource: () => void;

beforeEach(() => {
  restoreEventSource = installMockEventSource();
});

afterEach(() => {
  restoreEventSource();
  vi.restoreAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ActivityPage — empty state', () => {
  it('renders placeholder when no events yet', () => {
    renderActivity();
    expect(screen.getByText('Waiting for events...')).toBeInTheDocument();
    expect(screen.queryByRole('listitem')).toBeNull();
  });
});

describe('ActivityPage — single event', () => {
  it('renders single event after emit', async () => {
    renderActivity();

    const es = getLastMockEventSource();
    act(() => { es._emitOpen(); });
    act(() => {
      es._emitMessage(makeEnvelopeJson('session.started'));
    });

    await waitFor(() => {
      expect(screen.getAllByRole('listitem')).toHaveLength(1);
      expect(screen.getByRole('listitem')).toHaveTextContent('session.started');
    });
  });
});

describe('ActivityPage — ordering', () => {
  it('renders newest at top (reverse-chronological order)', async () => {
    renderActivity();
    const es = getLastMockEventSource();
    act(() => { es._emitOpen(); });

    const ts1 = '2026-01-01T10:00:00.000Z';
    const ts2 = '2026-01-01T10:00:01.000Z';
    const ts3 = '2026-01-01T10:00:02.000Z';

    act(() => {
      es._emitMessage(makeEnvelopeJson('session.started', ts1));
    });
    act(() => {
      es._emitMessage(makeEnvelopeJson('session.ended', ts2));
    });
    act(() => {
      es._emitMessage(makeEnvelopeJson('queue.enqueued', ts3));
    });

    await waitFor(() => {
      const items = screen.getAllByRole('listitem');
      expect(items).toHaveLength(3);
      // Newest (ts3, queue.enqueued) must appear first in DOM
      expect(items[0]).toHaveTextContent('queue.enqueued');
      expect(items[1]).toHaveTextContent('session.ended');
      expect(items[2]).toHaveTextContent('session.started');
    });
  });
});

describe('ActivityPage — ring buffer cap', () => {
  it('caps at 200 entries', async () => {
    renderActivity();
    const es = getLastMockEventSource();
    act(() => { es._emitOpen(); });

    // Emit 5 'oldest' events first, then 200 'newest' events.
    // After the cap, all 5 'oldest' entries must be dropped — verifies
    // drop-oldest semantics at integration level (not just length).
    act(() => {
      for (let i = 0; i < 5; i++) {
        es._emitMessage(makeEnvelopeJson('session.started', new Date(Date.now() + i).toISOString()));
      }
      for (let i = 0; i < 200; i++) {
        es._emitMessage(makeEnvelopeJson('hook.received', new Date(Date.now() + 5 + i).toISOString()));
      }
    });

    await waitFor(() => {
      const items = screen.getAllByRole('listitem');
      expect(items).toHaveLength(200);
      // Every retained entry must be from the newer 'hook.received' batch.
      for (const item of items) {
        expect(item).not.toHaveTextContent('session.started');
      }
    });
  });
});

describe('ActivityPage — malformed envelopes', () => {
  it('drops malformed envelopes — list stays empty, no crash', async () => {
    renderActivity();
    const es = getLastMockEventSource();
    act(() => { es._emitOpen(); });

    // Emit non-JSON
    act(() => { es._emitMessage('not-json-at-all'); });
    // Emit JSON with invalid shape (missing required fields)
    act(() => { es._emitMessage(JSON.stringify({ wrong: 'shape' })); });

    // List should still be empty — no listitem rendered
    expect(screen.queryByRole('listitem')).toBeNull();
    expect(screen.getByText('Waiting for events...')).toBeInTheDocument();
  });
});

describe('ActivityPage — no filter', () => {
  it('receives events of any known type', async () => {
    renderActivity();
    const es = getLastMockEventSource();
    act(() => { es._emitOpen(); });

    act(() => {
      es._emitMessage(makeEnvelopeJson('hook.received'));
    });
    act(() => {
      es._emitMessage(makeEnvelopeJson('session.started'));
    });

    await waitFor(() => {
      const items = screen.getAllByRole('listitem');
      expect(items).toHaveLength(2);
      // Both event types present
      const text = items.map((el) => el.textContent ?? '').join(' ');
      expect(text).toContain('hook.received');
      expect(text).toContain('session.started');
    });
  });
});

describe('ActivityPage — connection badge', () => {
  it('shows connected badge when EventSource opens', async () => {
    renderActivity();
    const es = getLastMockEventSource();

    act(() => { es._emitOpen(); });

    await waitFor(() => {
      const badge = screen.getByTestId('activity-connection-badge');
      expect(badge).toHaveTextContent('Connected');
    });
  });

  it('shows disconnected badge on error', async () => {
    renderActivity();
    const es = getLastMockEventSource();

    act(() => { es._emitError(); });

    await waitFor(() => {
      const badge = screen.getByTestId('activity-connection-badge');
      expect(badge).toHaveTextContent('Disconnected');
    });
  });
});

describe('ActivityPage — SSE URL token', () => {
  it('SSE URL includes ?token= from TokenGate', () => {
    renderActivity('t-act');

    const es = getLastMockEventSource();
    expect(es.url).toContain('?token=t-act');
  });
});

describe('ActivityPage — useSseEvents filter', () => {
  it('useSseEvents is called with filter = undefined (all-events paradigm)', () => {
    const spy = vi.spyOn(useSseEventsModule, 'useSseEvents');

    renderActivity();

    expect(spy).toHaveBeenCalled();
    const opts = spy.mock.calls[0]?.[0];
    expect(opts?.filter).toBeUndefined();
  });
});

describe('ActivityPage — trace_id field (Task 2.9)', () => {
  it('stores trace_id from envelope on the ActivityEntry (Web UI trace-link prep)', async () => {
    renderActivity();
    const es = getLastMockEventSource();
    act(() => { es._emitOpen(); });

    const TRACE_ID = 'aabb112233445566aabb112233445566';
    // Envelope with trace_id present
    const envelopeWithTrace = JSON.stringify({
      type: 'session.started',
      payload: { projectId: 'proj-x' },
      trace_id: TRACE_ID,
      ts: new Date().toISOString(),
    });
    act(() => { es._emitMessage(envelopeWithTrace); });

    await waitFor(() => {
      const items = screen.getAllByRole('listitem');
      expect(items).toHaveLength(1);
      // The trace_id should be visible in the list item (Task 2.9 Web UI req)
      expect(items[0]).toHaveTextContent(TRACE_ID);
    });
  });

  it('renders event without trace_id when envelope omits it', async () => {
    renderActivity();
    const es = getLastMockEventSource();
    act(() => { es._emitOpen(); });

    const envelopeNoTrace = JSON.stringify({
      type: 'session.ended',
      payload: {},
      ts: new Date().toISOString(),
    });
    act(() => { es._emitMessage(envelopeNoTrace); });

    await waitFor(() => {
      const items = screen.getAllByRole('listitem');
      expect(items).toHaveLength(1);
      expect(items[0]).toHaveTextContent('session.ended');
      // Should not show any trace_id text (null case)
    });
  });
});
