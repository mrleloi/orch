/**
 * core-client.spec.ts — Unit tests for CoreApiClient.
 *
 * All fetch calls are intercepted via vi.stubGlobal('fetch', ...).
 *
 * Tests:
 *  1. getActiveSession() returns null on 404
 *  2. getActiveSession() throws CoreApiError on 5xx with status in error
 *  3. Attaches Authorization: Bearer <token> header
 *  4. stopSession requires confirm=true (compile-time via TypeScript + runtime guard test)
 *  5. getQueue() returns array of QueueItemDto
 *  6. enqueue() posts correct body and returns QueueItemDto
 *  7. getActiveSession() throws on bad response shape (zod validation, I-10)
 *  8. getQueue() throws CoreApiError on 5xx
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import pino from 'pino';
import { CoreApiClient, CoreApiError } from './core-client.js';
import type { ActiveSessionDto, QueueItemDto } from '@orch/shared';

// ── Fixtures ───────────────────────────────────────────────────────────────────

const ACTIVE_SESSION: ActiveSessionDto = {
  id: 'session-1',
  projectId: 'proj-1',
  planPath: '/plans/test.md',
  state: 'active',
  claudeSessionId: null,
  startedAt: '2026-04-25T10:00:00.000Z',
  endedAt: null,
  inputTokens: 100,
  outputTokens: 50,
  costUsd: 0.001,
  traceId: null,
  createdAt: '2026-04-25T10:00:00.000Z',
  updatedAt: '2026-04-25T10:00:00.000Z',
};

const QUEUE_ITEM: QueueItemDto = {
  id: 'q-1',
  projectId: 'proj-1',
  planPath: '/plans/test.md',
  priority: 50,
  state: 'pending',
  sessionId: null,
  enqueuedAt: '2026-04-25T10:00:00.000Z',
  startedAt: null,
  endedAt: null,
};

function makeClient() {
  const logger = pino({ level: 'silent' });
  return new CoreApiClient({
    baseUrl: 'http://127.0.0.1:4141',
    bearerToken: 'test-token-abc123',
    logger,
  });
}

function mockFetch(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): ReturnType<typeof vi.fn> {
  const mockJson = vi.fn().mockResolvedValue(body);
  const mockResponse = {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: mockJson,
    headers: new Headers(headers),
  };
  return vi.fn().mockResolvedValue(mockResponse);
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('CoreApiClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getActiveSession()', () => {
    it('returns null on 404', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 404,
          statusText: 'Not Found',
          json: vi.fn().mockResolvedValue({}),
        }),
      );

      const client = makeClient();
      const result = await client.getActiveSession();
      expect(result).toBeNull();
    });

    it('returns first active session on success', async () => {
      vi.stubGlobal(
        'fetch',
        mockFetch({ sessions: [ACTIVE_SESSION] }),
      );

      const client = makeClient();
      const result = await client.getActiveSession();
      expect(result).toEqual(ACTIVE_SESSION);
    });

    it('returns null when sessions array is empty', async () => {
      vi.stubGlobal('fetch', mockFetch({ sessions: [] }));
      const client = makeClient();
      const result = await client.getActiveSession();
      expect(result).toBeNull();
    });

    it('throws CoreApiError on 500 with status in error', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          json: vi.fn().mockResolvedValue({}),
        }),
      );

      const client = makeClient();
      await expect(client.getActiveSession()).rejects.toThrow(CoreApiError);
      await expect(client.getActiveSession()).rejects.toMatchObject({ status: 500 });
    });

    it('throws on bad response shape (zod validation I-10)', async () => {
      vi.stubGlobal(
        'fetch',
        mockFetch({ sessions: [{ id: 123, missingFields: true }] }),
      );

      const client = makeClient();
      await expect(client.getActiveSession()).rejects.toThrow(/Unexpected response shape/);
    });
  });

  describe('getQueue()', () => {
    it('returns array of QueueItemDto on success', async () => {
      vi.stubGlobal('fetch', mockFetch({ items: [QUEUE_ITEM] }));
      const client = makeClient();
      const result = await client.getQueue();
      expect(result).toEqual([QUEUE_ITEM]);
    });

    it('throws CoreApiError on 503', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 503,
          statusText: 'Service Unavailable',
          json: vi.fn().mockResolvedValue({}),
        }),
      );

      const client = makeClient();
      await expect(client.getQueue()).rejects.toThrow(CoreApiError);
      await expect(client.getQueue()).rejects.toMatchObject({ status: 503 });
    });
  });

  describe('Authorization header', () => {
    it('attaches Authorization: Bearer <token> header to all requests', async () => {
      const fetchSpy = mockFetch({ sessions: [ACTIVE_SESSION] });
      vi.stubGlobal('fetch', fetchSpy);

      const client = makeClient();
      await client.getActiveSession();

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const callArgs = fetchSpy.mock.calls[0] as [string, RequestInit];
      const headers = callArgs[1]?.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer test-token-abc123');
    });
  });

  describe('stopSession()', () => {
    it('calls the correct URL with confirm=1 and succeeds', async () => {
      const fetchSpy = mockFetch({ ok: true, sessionId: 'session-1' });
      vi.stubGlobal('fetch', fetchSpy);

      const client = makeClient();
      await expect(client.stopSession('session-1', true)).resolves.toBeUndefined();

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const callArgs = fetchSpy.mock.calls[0] as [string, RequestInit];
      const url = callArgs[0] as string;
      expect(url).toContain('/api/v1/sessions/session-1/stop');
      expect(url).toContain('confirm=1');
      expect(callArgs[1]?.method).toBe('POST');
    });

    it('runtime-throws if confirm is not true (belt-and-suspenders I-6)', async () => {
      const client = makeClient();
      // TypeScript won't allow calling with false at compile time,
      // but we test the runtime guard by casting
      await expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (client.stopSession as (id: string, confirm: any) => Promise<void>)('session-1', false),
      ).rejects.toThrow('stopSession requires confirm=true');
    });
  });

  describe('enqueue()', () => {
    it('posts projectId + planPath and returns QueueItemDto', async () => {
      const fetchSpy = mockFetch({ item: QUEUE_ITEM });
      vi.stubGlobal('fetch', fetchSpy);

      const client = makeClient();
      const result = await client.enqueue('proj-1', '/plans/test.md');

      expect(result).toEqual(QUEUE_ITEM);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const callArgs = fetchSpy.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(callArgs[1]?.body as string) as Record<string, string>;
      expect(body.projectId).toBe('proj-1');
      expect(body.planPath).toBe('/plans/test.md');
    });
  });

  describe('getTail()', () => {
    it('returns TailResponseDto with lines and truncated flag', async () => {
      const tailResponse = { lines: ['line 1', 'line 2'], truncated: false };
      vi.stubGlobal('fetch', mockFetch(tailResponse));

      const client = makeClient();
      const result = await client.getTail('sess-1', 20);

      expect(result.lines).toEqual(['line 1', 'line 2']);
      expect(result.truncated).toBe(false);
    });

    it('clamps lines to max 100 in URL params', async () => {
      const fetchSpy = mockFetch({ lines: [], truncated: true });
      vi.stubGlobal('fetch', fetchSpy);

      const client = makeClient();
      await client.getTail('sess-1', 999); // should be clamped to 100

      const callArgs = fetchSpy.mock.calls[0] as [string, RequestInit];
      const url = callArgs[0] as string;
      expect(url).toContain('lines=100');
    });

    it('zod-validates response: throws on bad shape (I-10)', async () => {
      vi.stubGlobal('fetch', mockFetch({ wrong: 'shape' }));

      const client = makeClient();
      await expect(client.getTail('sess-1', 20)).rejects.toThrow(/Unexpected response shape/);
    });

    it('throws CoreApiError on 404 (no active session)', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 404,
          statusText: 'Not Found',
          json: vi.fn().mockResolvedValue({}),
        }),
      );

      const client = makeClient();
      await expect(client.getTail('unknown', 20)).rejects.toThrow(CoreApiError);
      await expect(client.getTail('unknown', 20)).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('getProjects()', () => {
    it('returns array of ProjectDto on success', async () => {
      const projectsResponse = {
        projects: [
          { projectId: 'proj-1', rootPath: '/home/user/proj-1', ccsProfile: 'default', maxConcurrentSessions: 1 },
          { projectId: 'proj-2', rootPath: '/home/user/proj-2', ccsProfile: 'premium', maxConcurrentSessions: 2 },
        ],
      };
      vi.stubGlobal('fetch', mockFetch(projectsResponse));

      const client = makeClient();
      const result = await client.getProjects();

      expect(result).toHaveLength(2);
      expect(result[0].projectId).toBe('proj-1');
      expect(result[1].ccsProfile).toBe('premium');
    });

    it('throws CoreApiError on 5xx', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          json: vi.fn().mockResolvedValue({}),
        }),
      );

      const client = makeClient();
      await expect(client.getProjects()).rejects.toThrow(CoreApiError);
    });
  });

  describe('getLogs()', () => {
    it('returns log text on success', async () => {
      const logText = 'line1\nline2\nline3';
      const mockResponse = {
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue(logText),
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

      const client = makeClient();
      const result = await client.getLogs('sess-1');

      expect(result).toBe(logText);
    });

    it('throws CoreApiError on 404 for unknown session', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 404,
          statusText: 'Not Found',
          json: vi.fn().mockResolvedValue({}),
        }),
      );

      const client = makeClient();
      await expect(client.getLogs('unknown-sess')).rejects.toThrow(CoreApiError);
      await expect(client.getLogs('unknown-sess')).rejects.toMatchObject({ status: 404 });
    });
  });

  // Test 21: pauseQueue sends X-Orch-Actor header
  describe('pauseQueue()', () => {
    it('test-21: sends X-Orch-Actor header with correct actor', async () => {
      const fetchSpy = mockFetch({ ok: true, paused: true });
      vi.stubGlobal('fetch', fetchSpy);

      const client = makeClient();
      await client.pauseQueue('telegram:12345');

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const callArgs = fetchSpy.mock.calls[0] as [string, RequestInit];
      const url = callArgs[0] as string;
      expect(url).toContain('/api/v1/queue/pause');
      expect(callArgs[1]?.method).toBe('POST');
      const headers = callArgs[1]?.headers as Record<string, string>;
      expect(headers['X-Orch-Actor']).toBe('telegram:12345');
    });

    it('throws CoreApiError on 5xx', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          json: vi.fn().mockResolvedValue({}),
        }),
      );

      const client = makeClient();
      await expect(client.pauseQueue('telegram:999')).rejects.toThrow(CoreApiError);
    });
  });

  describe('resumeQueue()', () => {
    it('sends X-Orch-Actor header with correct actor', async () => {
      const fetchSpy = mockFetch({ ok: true, paused: false });
      vi.stubGlobal('fetch', fetchSpy);

      const client = makeClient();
      await client.resumeQueue('telegram:99');

      const callArgs = fetchSpy.mock.calls[0] as [string, RequestInit];
      const url = callArgs[0] as string;
      expect(url).toContain('/api/v1/queue/resume');
      const headers = callArgs[1]?.headers as Record<string, string>;
      expect(headers['X-Orch-Actor']).toBe('telegram:99');
    });
  });

  // Test 22: enqueue response zod-validated
  describe('enqueue() zod validation (test-22)', () => {
    it('test-22: enqueue response is zod-validated; throws on bad shape', async () => {
      vi.stubGlobal('fetch', mockFetch({ item: { bad: 'shape', missing: 'fields' } }));

      const client = makeClient();
      await expect(client.enqueue('proj-1', '/plans/test.md')).rejects.toThrow(/Unexpected response shape/);
    });

    it('enqueue passes actor in X-Orch-Actor header when provided', async () => {
      const fetchSpy = mockFetch({ item: QUEUE_ITEM });
      vi.stubGlobal('fetch', fetchSpy);

      const client = makeClient();
      await client.enqueue('proj-1', '/plans/test.md', 'telegram:44444');

      const callArgs = fetchSpy.mock.calls[0] as [string, RequestInit];
      const headers = callArgs[1]?.headers as Record<string, string>;
      expect(headers['X-Orch-Actor']).toBe('telegram:44444');
    });
  });
});
