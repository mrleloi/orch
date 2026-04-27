/**
 * client.spec.ts — Tests for ApiClient typed fetch wrapper.
 *
 * Covers:
 * - Bearer token attached to all requests
 * - 401 invokes onUnauthorized callback + throws
 * - queue.list() happy + error paths + zod validation
 * - queue.enqueue() happy + error
 * - sessions.active() happy (returns session) + null on 404 + error
 * - sessions.stop() happy + error
 * - projects.list() happy + error
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ApiClient, ApiClientError } from './client.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BASE_URL = 'http://127.0.0.1:4141';

const mockQueueItem = {
  id: 'qi-1',
  projectId: 'proj-a',
  planPath: '/plans/task.md',
  priority: 0,
  state: 'pending' as const,
  sessionId: null,
  enqueuedAt: '2026-01-01T00:00:00Z',
  startedAt: null,
  endedAt: null,
};

const mockSession = {
  id: 'sess-1',
  projectId: 'proj-a',
  planPath: '/plans/task.md',
  state: 'active' as const,
  claudeSessionId: null,
  startedAt: '2026-01-01T00:00:00Z',
  endedAt: null,
  inputTokens: 100,
  outputTokens: 200,
  costUsd: 0.01,
  traceId: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const mockProject = {
  projectId: 'proj-a',
  rootPath: '/projects/proj-a',
  ccsProfile: 'default',
  maxConcurrentSessions: 1,
};

// ── Mock fetch ─────────────────────────────────────────────────────────────────

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// ── Helper factory ─────────────────────────────────────────────────────────────

function makeOkResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as unknown as Response;
}

function makeErrorResponse(status: number): Response {
  return {
    ok: false,
    status,
    json: async () => ({ error: 'something went wrong' }),
  } as unknown as Response;
}

function make401Response(): Response {
  return {
    ok: false,
    status: 401,
    json: async () => ({ error: 'Unauthorized' }),
  } as unknown as Response;
}

function make404Response(): Response {
  return {
    ok: false,
    status: 404,
    json: async () => ({ error: 'Not found' }),
  } as unknown as Response;
}

// ── Shared client factory ──────────────────────────────────────────────────────

function makeClient(token: string | null = 'test-token') {
  const onUnauthorized = vi.fn();
  const client = new ApiClient({
    baseUrl: BASE_URL,
    getToken: () => token,
    onUnauthorized,
  });
  return { client, onUnauthorized };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ApiClient — bearer token', () => {
  it('attaches Authorization header on every request', async () => {
    const { client } = makeClient('my-token');
    mockFetch.mockResolvedValueOnce(makeOkResponse({ items: [mockQueueItem] }));

    await client.queue.list();

    expect(mockFetch).toHaveBeenCalledOnce();
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(init.headers['Authorization']).toBe('Bearer my-token');
  });

  it('sends no Authorization header when token is null', async () => {
    const { client } = makeClient(null);
    mockFetch.mockResolvedValueOnce(makeOkResponse({ items: [] }));

    await client.queue.list();

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(init.headers['Authorization']).toBeUndefined();
  });

  it('calls onUnauthorized and throws ApiClientError on 401', async () => {
    const { client, onUnauthorized } = makeClient('stale-token');
    mockFetch.mockResolvedValueOnce(make401Response());

    await expect(client.queue.list()).rejects.toBeInstanceOf(ApiClientError);
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });
});

describe('ApiClient.queue.list()', () => {
  it('returns list of queue items on success', async () => {
    const { client } = makeClient();
    mockFetch.mockResolvedValueOnce(makeOkResponse({ items: [mockQueueItem] }));

    const items = await client.queue.list();

    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('qi-1');
    expect(items[0].state).toBe('pending');
  });

  it('throws ApiClientError on non-2xx (non-401)', async () => {
    const { client } = makeClient();
    mockFetch.mockResolvedValueOnce(makeErrorResponse(500));

    await expect(client.queue.list()).rejects.toBeInstanceOf(ApiClientError);
  });

  it('throws on invalid response shape (zod validation)', async () => {
    const { client } = makeClient();
    mockFetch.mockResolvedValueOnce(makeOkResponse({ wrong_shape: true }));

    await expect(client.queue.list()).rejects.toThrow();
  });
});

describe('ApiClient.queue.enqueue()', () => {
  it('POSTs and returns created queue item', async () => {
    const { client } = makeClient();
    mockFetch.mockResolvedValueOnce(makeOkResponse({ item: mockQueueItem }));

    const item = await client.queue.enqueue('proj-a', '/plans/task.md');

    expect(item.id).toBe('qi-1');
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/v1/queue');
    expect(init.method).toBe('POST');
  });

  it('throws ApiClientError on non-2xx', async () => {
    const { client } = makeClient();
    mockFetch.mockResolvedValueOnce(makeErrorResponse(422));

    await expect(client.queue.enqueue('proj-a', '/plans/task.md')).rejects.toBeInstanceOf(ApiClientError);
  });
});

describe('ApiClient.sessions.active()', () => {
  it('returns the active session when present', async () => {
    const { client } = makeClient();
    mockFetch.mockResolvedValueOnce(makeOkResponse({ sessions: [mockSession] }));

    const session = await client.sessions.active();

    expect(session).not.toBeNull();
    expect(session?.id).toBe('sess-1');
    expect(session?.state).toBe('active');
  });

  it('returns null when no sessions (empty list)', async () => {
    const { client } = makeClient();
    mockFetch.mockResolvedValueOnce(makeOkResponse({ sessions: [] }));

    const session = await client.sessions.active();

    expect(session).toBeNull();
  });

  it('returns null on 404', async () => {
    const { client } = makeClient();
    mockFetch.mockResolvedValueOnce(make404Response());

    const session = await client.sessions.active();

    expect(session).toBeNull();
  });

  it('throws ApiClientError on 500', async () => {
    const { client } = makeClient();
    mockFetch.mockResolvedValueOnce(makeErrorResponse(500));

    await expect(client.sessions.active()).rejects.toBeInstanceOf(ApiClientError);
  });
});

describe('ApiClient.sessions.stop()', () => {
  it('POSTs stop with confirm=true and succeeds', async () => {
    const { client } = makeClient();
    mockFetch.mockResolvedValueOnce(
      makeOkResponse({ ok: true, sessionId: 'sess-1' }),
    );

    await expect(client.sessions.stop('sess-1', true)).resolves.toBeUndefined();

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/v1/sessions/sess-1/stop');
    expect(url).toContain('confirm=1');
    expect(init.method).toBe('POST');
  });

  it('throws ApiClientError on non-2xx', async () => {
    const { client } = makeClient();
    mockFetch.mockResolvedValueOnce(makeErrorResponse(500));

    await expect(client.sessions.stop('sess-1', true)).rejects.toBeInstanceOf(ApiClientError);
  });
});

// ── Helper for text/plain responses ──────────────────────────────────────────

function makeTextResponse(body: string, contentType: string = 'text/plain; charset=utf-8'): Response {
  return {
    ok: true,
    status: 200,
    headers: { get: (h: string) => (h === 'content-type' ? contentType : null) },
    text: async () => body,
  } as unknown as Response;
}

// ── sessions.tail() ───────────────────────────────────────────────────────────

describe('ApiClient.sessions.tail()', () => {
  it('tail — happy path returns lines + truncated', async () => {
    const { client } = makeClient();
    mockFetch.mockResolvedValueOnce(
      makeOkResponse({ lines: ['line1', 'line2'], truncated: false }),
    );

    const result = await client.sessions.tail('s1', 20);

    expect(result.lines).toEqual(['line1', 'line2']);
    expect(result.truncated).toBe(false);
    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/sessions/s1/tail?lines=20');
  });

  it('tail — lines param omitted when undefined', async () => {
    const { client } = makeClient();
    mockFetch.mockResolvedValueOnce(
      makeOkResponse({ lines: [], truncated: false }),
    );

    await client.sessions.tail('s1');

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/sessions/s1/tail');
    expect(url).not.toContain('?lines=');
  });

  it('tail — 404 throws ApiClientError with status=404', async () => {
    const { client } = makeClient();
    mockFetch.mockResolvedValueOnce(make404Response());

    const err = await client.sessions.tail('s1').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiClientError);
    expect((err as ApiClientError).status).toBe(404);
  });

  it('tail — schema-invalid body throws validation error', async () => {
    const { client } = makeClient();
    mockFetch.mockResolvedValueOnce(makeOkResponse({ not_lines: true }));

    await expect(client.sessions.tail('s1')).rejects.toThrow(/Unexpected response shape/);
  });
});

// ── sessions.logs() ───────────────────────────────────────────────────────────

describe('ApiClient.sessions.logs()', () => {
  it('logs — happy path returns text body', async () => {
    const { client } = makeClient();
    mockFetch.mockResolvedValueOnce(makeTextResponse('log line 1\nlog line 2\n'));

    const text = await client.sessions.logs('s1');

    expect(text).toBe('log line 1\nlog line 2\n');
    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/sessions/s1/logs');
  });

  it('logs — wrong content-type throws ApiClientError(415)', async () => {
    const { client } = makeClient();
    mockFetch.mockResolvedValueOnce(makeTextResponse('{}', 'application/json'));

    const err = await client.sessions.logs('s1').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiClientError);
    expect((err as ApiClientError).status).toBe(415);
  });
});

describe('ApiClient.projects.list()', () => {
  it('returns list of projects on success', async () => {
    const { client } = makeClient();
    mockFetch.mockResolvedValueOnce(makeOkResponse({ projects: [mockProject] }));

    const projects = await client.projects.list();

    expect(projects).toHaveLength(1);
    expect(projects[0].projectId).toBe('proj-a');
  });

  it('throws ApiClientError on non-2xx', async () => {
    const { client } = makeClient();
    mockFetch.mockResolvedValueOnce(makeErrorResponse(503));

    await expect(client.projects.list()).rejects.toBeInstanceOf(ApiClientError);
  });

  it('validates response with zod (rejects wrong shape)', async () => {
    const { client } = makeClient();
    mockFetch.mockResolvedValueOnce(makeOkResponse({ data: 'not an array' }));

    await expect(client.projects.list()).rejects.toThrow();
  });
});

// ── Task 3.8: sessions.usage() + config.get() ─────────────────────────────────

const mockUsageResponse = {
  samples: [
    {
      ts: '2026-04-25T10:00:00.000Z',
      inputTokens: 1000,
      outputTokens: 500,
      cacheReadTokens: 0,
      model: 'claude-sonnet-4-6',
      costUsd: 0.0105,
    },
  ],
  totals: { inputTokens: 1000, outputTokens: 500, cacheReadTokens: 0, costUsd: 0.0105 },
};

describe('ApiClient.sessions.usage()', () => {
  it('GET /sessions/:id/usage returns usage data', async () => {
    const { client } = makeClient();
    mockFetch.mockResolvedValueOnce(makeOkResponse(mockUsageResponse));

    const result = await client.sessions.usage('sess-1');

    expect(result.samples).toHaveLength(1);
    expect(result.totals.inputTokens).toBe(1000);
    expect(result.totals.costUsd).toBeCloseTo(0.0105, 6);

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/v1/sessions/sess-1/usage');
  });

  it('appends since/until query params when provided', async () => {
    const { client } = makeClient();
    mockFetch.mockResolvedValueOnce(makeOkResponse(mockUsageResponse));

    await client.sessions.usage('sess-1', {
      since: '2026-01-01T00:00:00.000Z',
      until: '2026-01-02T00:00:00.000Z',
    });

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('since=');
    expect(url).toContain('until=');
  });

  it('validates response with zod (rejects wrong shape)', async () => {
    const { client } = makeClient();
    mockFetch.mockResolvedValueOnce(makeOkResponse({ unexpected: true }));

    await expect(client.sessions.usage('sess-1')).rejects.toThrow(/Unexpected response shape/);
  });

  it('throws ApiClientError on non-2xx', async () => {
    const { client } = makeClient();
    mockFetch.mockResolvedValueOnce(makeErrorResponse(500));

    await expect(client.sessions.usage('sess-1')).rejects.toBeInstanceOf(ApiClientError);
  });
});

describe('ApiClient.config.get()', () => {
  it('GET /api/v1/config returns traceBackendUiUrl', async () => {
    const { client } = makeClient();
    mockFetch.mockResolvedValueOnce(
      makeOkResponse({ traceBackendUiUrl: 'http://grafana.local:3000' }),
    );

    const config = await client.config.get();

    expect(config.traceBackendUiUrl).toBe('http://grafana.local:3000');

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/v1/config');
  });

  it('returns empty traceBackendUiUrl when not configured', async () => {
    const { client } = makeClient();
    mockFetch.mockResolvedValueOnce(makeOkResponse({ traceBackendUiUrl: '' }));

    const config = await client.config.get();

    expect(config.traceBackendUiUrl).toBe('');
  });

  it('throws ApiClientError on non-2xx', async () => {
    const { client } = makeClient();
    mockFetch.mockResolvedValueOnce(makeErrorResponse(500));

    await expect(client.config.get()).rejects.toBeInstanceOf(ApiClientError);
  });
});
