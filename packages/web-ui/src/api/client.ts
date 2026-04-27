/**
 * client.ts — Typed fetch wrapper for the Orch core daemon REST API.
 *
 * I-4: NEVER imports @orch/core. Communicates via HTTP only.
 * I-3: No @anthropic-ai/sdk, no openai imports.
 * I-10: All response shapes validated with zod.
 * Bearer token from opts.getToken(); 401 → opts.onUnauthorized().
 *
 * Task 3.8 additions:
 *  - sessions.usage(id, opts?) — GET /api/v1/sessions/:id/usage
 *  - config.get()              — GET /api/v1/config (trace backend URL)
 */

import { z } from 'zod';
import type {
  ActiveSessionDto,
  QueueItemDto,
  ProjectDto,
} from '@orch/shared';

// ── Zod schemas ────────────────────────────────────────────────────────────────

const SessionStateSchema = z.enum([
  'pending',
  'starting',
  'active',
  'rate_limited',
  'context_full',
  'stopping',
  'completed',
  'failed',
  'cancelled',
]);

const SessionDtoSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  planPath: z.string(),
  state: SessionStateSchema,
  claudeSessionId: z.string().nullable(),
  startedAt: z.string().nullable(),
  endedAt: z.string().nullable(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  costUsd: z.number(),
  traceId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const ActiveSessionsResponseSchema = z.object({
  sessions: z.array(SessionDtoSchema),
});

const QueueItemStateSchema = z.enum([
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled',
]);

const QueueItemDtoSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  planPath: z.string(),
  priority: z.number(),
  state: QueueItemStateSchema,
  sessionId: z.string().nullable(),
  enqueuedAt: z.string(),
  startedAt: z.string().nullable(),
  endedAt: z.string().nullable(),
});

const QueueResponseSchema = z.object({
  items: z.array(QueueItemDtoSchema),
});

const EnqueueResponseSchema = z.object({
  item: QueueItemDtoSchema,
});

const ProjectDtoSchema = z
  .object({
    projectId: z.string(),
    rootPath: z.string(),
    ccsProfile: z.string(),
    maxConcurrentSessions: z.number(),
  })
  .passthrough();

const ProjectsResponseSchema = z.object({
  projects: z.array(ProjectDtoSchema),
});

const StopSessionResponseSchema = z.object({
  ok: z.boolean(),
  sessionId: z.string(),
});

// ── Usage schemas (Task 3.8 — charter O3/F6) ──────────────────────────────────

const UsageSampleSchema = z.object({
  ts: z.string(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  cacheReadTokens: z.number(),
  model: z.string(),
  costUsd: z.number(),
});

export type UsageSample = z.infer<typeof UsageSampleSchema>;

const UsageTotalsSchema = z.object({
  inputTokens: z.number(),
  outputTokens: z.number(),
  cacheReadTokens: z.number(),
  costUsd: z.number(),
});

const SessionUsageResponseSchema = z.object({
  samples: z.array(UsageSampleSchema),
  totals: UsageTotalsSchema,
});

export type SessionUsageData = z.infer<typeof SessionUsageResponseSchema>;

// ── Config schema (Task 3.8 / 3.9) ───────────────────────────────────────────

const ConfigResponseSchema = z.object({
  traceBackendUiUrl: z.string(),
  /**
   * Trace backend type — used by Web UI to branch trace deep-link URL pattern.
   * Task 3.9: 'otlp' uses Grafana Tempo path, 'langfuse' uses Langfuse trace path,
   * 'none' renders trace ID as plain text with no link.
   * Falls back to 'otlp' if daemon version predates Task 3.9 (passthrough key missing).
   */
  traceBackend: z.enum(['otlp', 'langfuse', 'none']).default('otlp'),
});

export type OrchdConfig = z.infer<typeof ConfigResponseSchema>;

const TailResponseSchema = z.object({
  lines: z.array(z.string()),
  truncated: z.boolean(),
});

// ── Error type ─────────────────────────────────────────────────────────────────

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

// ── ApiClient ──────────────────────────────────────────────────────────────────

export interface ApiClientOptions {
  baseUrl: string;
  getToken: () => string | null;
  onUnauthorized: () => void;
}

/**
 * Typed fetch client for /api/v1/*.
 *
 * Attaches Authorization: Bearer <token> header from opts.getToken().
 * On 401 → evicts token (caller's responsibility via onUnauthorized callback).
 * All responses validated with zod schemas (I-10).
 */
export class ApiClient {
  private readonly baseUrl: string;
  private readonly getToken: () => string | null;
  private readonly onUnauthorized: () => void;

  // Namespaced sub-APIs (Part B contract)
  readonly queue: {
    list(): Promise<QueueItemDto[]>;
    enqueue(projectId: string, planPath: string): Promise<QueueItemDto>;
  };

  readonly sessions: {
    active(): Promise<ActiveSessionDto | null>;
    stop(id: string, confirm: true): Promise<void>;
    tail(id: string, lines?: number): Promise<{ lines: string[]; truncated: boolean }>;
    logs(id: string): Promise<string>;
    usage(id: string, opts?: { since?: string; until?: string }): Promise<SessionUsageData>;
  };

  readonly projects: {
    list(): Promise<ProjectDto[]>;
  };

  readonly config: {
    get(): Promise<OrchdConfig>;
  };

  constructor(opts: ApiClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.getToken = opts.getToken;
    this.onUnauthorized = opts.onUnauthorized;

    // Bind namespaces to `this` so methods have correct context
    this.queue = {
      list: () => this._listQueue(),
      enqueue: (projectId, planPath) => this._enqueue(projectId, planPath),
    };

    this.sessions = {
      active: () => this._activeSession(),
      stop: (id, confirm) => this._stopSession(id, confirm),
      tail: (id, lines) => this._tailSession(id, lines),
      logs: (id) => this._logsSession(id),
      usage: (id, opts) => this._sessionUsage(id, opts),
    };

    this.projects = {
      list: () => this._listProjects(),
    };

    this.config = {
      get: () => this._getConfig(),
    };
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private buildHeaders(): Record<string, string> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token != null) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  private async doFetch(path: string, init: RequestInit = {}): Promise<Response> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      ...init,
      headers: {
        ...this.buildHeaders(),
        ...(init.headers as Record<string, string> | undefined),
      },
    });

    if (response.status === 401) {
      this.onUnauthorized();
      throw new ApiClientError(401, `Unauthorized: ${path}`);
    }

    return response;
  }

  private async parseJson<T>(response: Response, schema: z.ZodType<T>, path: string): Promise<T> {
    const raw: unknown = await response.json();
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(`Unexpected response shape from ${path}: ${parsed.error.message}`);
    }
    return parsed.data as T;
  }

  // ── Queue methods ────────────────────────────────────────────────────────────

  private async _listQueue(): Promise<QueueItemDto[]> {
    const path = '/api/v1/queue';
    const response = await this.doFetch(path);
    if (!response.ok) {
      throw new ApiClientError(response.status, `GET ${path} failed with ${response.status}`);
    }
    const data = await this.parseJson(response, QueueResponseSchema, path);
    return data.items;
  }

  private async _enqueue(projectId: string, planPath: string): Promise<QueueItemDto> {
    const path = '/api/v1/queue';
    const response = await this.doFetch(path, {
      method: 'POST',
      body: JSON.stringify({ projectId, planPath }),
    });
    if (!response.ok) {
      throw new ApiClientError(response.status, `POST ${path} failed with ${response.status}`);
    }
    const data = await this.parseJson(response, EnqueueResponseSchema, path);
    return data.item;
  }

  // ── Session methods ──────────────────────────────────────────────────────────

  private async _activeSession(): Promise<ActiveSessionDto | null> {
    const path = '/api/v1/sessions/active';
    const response = await this.doFetch(path);

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new ApiClientError(response.status, `GET ${path} failed with ${response.status}`);
    }

    const data = await this.parseJson(response, ActiveSessionsResponseSchema, path);
    return data.sessions[0] ?? null;
  }

  private async _stopSession(id: string, confirm: true): Promise<void> {
    // Runtime guard — belt-and-suspenders in case TypeScript gets bypassed
    if (confirm !== true) {
      throw new Error('stopSession requires confirm=true (I-6)');
    }
    const path = `/api/v1/sessions/${encodeURIComponent(id)}/stop?confirm=1`;
    const response = await this.doFetch(path, { method: 'POST' });
    if (!response.ok) {
      throw new ApiClientError(response.status, `POST ${path} failed with ${response.status}`);
    }
    await this.parseJson(response, StopSessionResponseSchema, path);
  }

  private async _tailSession(id: string, lines?: number): Promise<{ lines: string[]; truncated: boolean }> {
    const query = lines !== undefined ? `?lines=${lines}` : '';
    const path = `/api/v1/sessions/${encodeURIComponent(id)}/tail${query}`;
    const response = await this.doFetch(path);

    if (response.status === 404) {
      throw new ApiClientError(404, `GET ${path} — session not found`);
    }

    if (!response.ok) {
      throw new ApiClientError(response.status, `GET ${path} failed with ${response.status}`);
    }

    return this.parseJson(response, TailResponseSchema, path);
  }

  private async _logsSession(id: string): Promise<string> {
    const path = `/api/v1/sessions/${encodeURIComponent(id)}/logs`;
    const response = await this.doFetch(path);

    if (response.status === 404) {
      throw new ApiClientError(404, `GET ${path} — session not found`);
    }

    if (!response.ok) {
      throw new ApiClientError(response.status, `GET ${path} failed with ${response.status}`);
    }

    // I-10: assert content-type is text/plain (defence against API drift)
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.startsWith('text/plain')) {
      throw new ApiClientError(415, `GET ${path} — unexpected content-type: ${contentType}`);
    }

    return response.text();
  }

  // ── Project methods ──────────────────────────────────────────────────────────

  private async _listProjects(): Promise<ProjectDto[]> {
    const path = '/api/v1/projects';
    const response = await this.doFetch(path);
    if (!response.ok) {
      throw new ApiClientError(response.status, `GET ${path} failed with ${response.status}`);
    }
    const data = await this.parseJson(response, ProjectsResponseSchema, path);
    return data.projects;
  }

  // ── Usage methods (Task 3.8) ─────────────────────────────────────────────────

  private async _sessionUsage(
    id: string,
    opts?: { since?: string; until?: string },
  ): Promise<SessionUsageData> {
    const params = new URLSearchParams();
    if (opts?.since !== undefined) params.set('since', opts.since);
    if (opts?.until !== undefined) params.set('until', opts.until);
    const query = params.toString() ? `?${params.toString()}` : '';
    const path = `/api/v1/sessions/${encodeURIComponent(id)}/usage${query}`;
    const response = await this.doFetch(path);
    if (!response.ok) {
      throw new ApiClientError(response.status, `GET ${path} failed with ${response.status}`);
    }
    return this.parseJson(response, SessionUsageResponseSchema, path);
  }

  // ── Config methods (Task 3.8) ─────────────────────────────────────────────────

  private async _getConfig(): Promise<OrchdConfig> {
    const path = '/api/v1/config';
    const response = await this.doFetch(path);
    if (!response.ok) {
      throw new ApiClientError(response.status, `GET ${path} failed with ${response.status}`);
    }
    return this.parseJson(response, ConfigResponseSchema, path);
  }
}
