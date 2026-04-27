/**
 * core-client.ts — Fetch-based HTTP client for the Orch core daemon REST API.
 *
 * Pattern copied from packages/cli/src/lib/http-client.ts.
 *
 * I-4: NEVER imports @orch/core. Communicates via HTTP only.
 * I-10: All response shapes validated with zod.
 * I-3: No @anthropic-ai/sdk, no openai imports.
 * I-14: No NestJS imports.
 */

import { z } from 'zod';
import type { Logger } from 'pino';
import type { ActiveSessionDto, QueueItemDto, ProjectDto, TailResponseDto } from '@orch/shared';

// ── Zod schemas for API response validation (I-10) ────────────────────────────

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

const StopSessionResponseSchema = z.object({
  ok: z.boolean(),
  sessionId: z.string(),
});

const EnqueueResponseSchema = z.object({
  item: QueueItemDtoSchema,
});

// ── Tail / Logs schemas ───────────────────────────────────────────────────────

const TailResponseSchema = z.object({
  lines: z.array(z.string()),
  truncated: z.boolean(),
});

// ── Projects schemas ──────────────────────────────────────────────────────────

// Core daemon returns Profile objects directly from the project registry cache.
// The schema validates the subset of Profile fields we consume in the telegram bot.
const ProjectDtoSchema = z.object({
  projectId: z.string(),
  rootPath: z.string(),
  ccsProfile: z.string(),
  maxConcurrentSessions: z.number(),
}).passthrough(); // Profile has more fields; passthrough to avoid spurious failures

const ProjectsResponseSchema = z.object({
  projects: z.array(ProjectDtoSchema),
});

// ── Queue pause/resume schemas ────────────────────────────────────────────────

const QueuePauseResponseSchema = z.object({
  ok: z.boolean(),
  paused: z.boolean(),
});

const QueueResumeResponseSchema = z.object({
  ok: z.boolean(),
  paused: z.boolean(),
});

// ── Error types ────────────────────────────────────────────────────────────────

export class CoreApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'CoreApiError';
  }
}

// ── CoreApiClient ──────────────────────────────────────────────────────────────

export interface CoreApiClientOptions {
  baseUrl: string;
  bearerToken: string;
  logger: Logger;
}

/**
 * Fetch-based client for /api/v1/* with Bearer auth.
 *
 * All methods validate responses against zod schemas (I-10).
 * 404 on getActiveSession → returns null (no active session).
 * 5xx → throws CoreApiError with status code.
 */
export class CoreApiClient {
  private readonly baseUrl: string;
  private readonly bearerToken: string;
  private readonly logger: Logger;

  constructor(opts: CoreApiClientOptions) {
    // Strip trailing slash for consistent path joining
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.bearerToken = opts.bearerToken;
    this.logger = opts.logger;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private buildHeaders(actor?: string): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.bearerToken}`,
    };
    if (actor != null && actor.length > 0) {
      headers['X-Orch-Actor'] = actor;
    }
    return headers;
  }

  private async doFetch(
    path: string,
    init: RequestInit = {},
    actor?: string,
  ): Promise<Response> {
    const url = `${this.baseUrl}${path}`;
    this.logger.debug({ msg: 'core-client:fetch', method: init.method ?? 'GET', url });

    const response = await fetch(url, {
      ...init,
      headers: {
        ...this.buildHeaders(actor),
        ...(init.headers as Record<string, string> | undefined),
      },
    });

    return response;
  }

  private async parseJson<T>(
    response: Response,
    schema: z.ZodType<T>,
    path: string,
  ): Promise<T> {
    const raw: unknown = await response.json();
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(
        `Unexpected response shape from ${path}: ${parsed.error.message}`,
      );
    }
    // parsed.success narrows the union; cast is safe here
    return parsed.data as T;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * GET /api/v1/sessions/active
   *
   * Returns the first active session, or null if none are running.
   * Returns null on 404. Throws CoreApiError on 5xx.
   */
  async getActiveSession(): Promise<ActiveSessionDto | null> {
    const path = '/api/v1/sessions/active';
    let response: Response;

    try {
      response = await this.doFetch(path);
    } catch (err: unknown) {
      this.logger.error({ err }, 'core-client:getActiveSession:fetch-error');
      throw err;
    }

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new CoreApiError(
        response.status,
        `GET ${path} failed with status ${response.status}`,
      );
    }

    const data = await this.parseJson(response, ActiveSessionsResponseSchema, path);
    // Return first active session, or null if empty list
    return data.sessions[0] ?? null;
  }

  /**
   * GET /api/v1/queue
   *
   * Returns the list of queue items.
   * Throws CoreApiError on non-2xx.
   */
  async getQueue(): Promise<QueueItemDto[]> {
    const path = '/api/v1/queue';
    let response: Response;

    try {
      response = await this.doFetch(path);
    } catch (err: unknown) {
      this.logger.error({ err }, 'core-client:getQueue:fetch-error');
      throw err;
    }

    if (!response.ok) {
      throw new CoreApiError(
        response.status,
        `GET ${path} failed with status ${response.status}`,
      );
    }

    const data = await this.parseJson(response, QueueResponseSchema, path);
    return data.items;
  }

  /**
   * POST /api/v1/sessions/:id/stop?confirm=1
   *
   * The `confirm: true` parameter is a compile-time + runtime guard (I-6).
   * Without `confirm: true`, TypeScript will not accept the call.
   *
   * @param actor Optional actor string sent as X-Orch-Actor header for audit trail.
   * Throws CoreApiError on non-2xx.
   */
  async stopSession(id: string, confirm: true, actor?: string): Promise<void> {
    // Runtime guard — belt-and-suspenders in case TypeScript gets bypassed
    if (confirm !== true) {
      throw new Error('stopSession requires confirm=true (I-6)');
    }

    const path = `/api/v1/sessions/${encodeURIComponent(id)}/stop?confirm=1`;
    let response: Response;

    try {
      response = await this.doFetch(path, { method: 'POST' }, actor);
    } catch (err: unknown) {
      this.logger.error({ err }, 'core-client:stopSession:fetch-error');
      throw err;
    }

    if (!response.ok) {
      throw new CoreApiError(
        response.status,
        `POST ${path} failed with status ${response.status}`,
      );
    }

    await this.parseJson(response, StopSessionResponseSchema, path);
  }

  /**
   * POST /api/v1/queue
   *
   * Enqueues a plan for execution.
   * Returns the created QueueItemDto.
   * Response validated against EnqueueResponseSchema (I-10).
   *
   * @param actor Optional actor string sent as X-Orch-Actor header for audit trail.
   * Throws CoreApiError on non-2xx.
   */
  async enqueue(projectId: string, planPath: string, actor?: string): Promise<QueueItemDto> {
    const path = '/api/v1/queue';
    let response: Response;

    try {
      response = await this.doFetch(
        path,
        {
          method: 'POST',
          body: JSON.stringify({ projectId, planPath }),
        },
        actor,
      );
    } catch (err: unknown) {
      this.logger.error({ err }, 'core-client:enqueue:fetch-error');
      throw err;
    }

    if (!response.ok) {
      throw new CoreApiError(
        response.status,
        `POST ${path} failed with status ${response.status}`,
      );
    }

    const data = await this.parseJson(response, EnqueueResponseSchema, path);
    return data.item;
  }

  /**
   * POST /api/v1/queue/pause
   *
   * Pauses global queue processing on the daemon.
   * Sends X-Orch-Actor header for audit trail.
   * Throws CoreApiError on non-2xx.
   */
  async pauseQueue(actor: string): Promise<void> {
    const path = '/api/v1/queue/pause';
    let response: Response;

    try {
      response = await this.doFetch(path, { method: 'POST' }, actor);
    } catch (err: unknown) {
      this.logger.error({ err }, 'core-client:pauseQueue:fetch-error');
      throw err;
    }

    if (!response.ok) {
      throw new CoreApiError(
        response.status,
        `POST ${path} failed with status ${response.status}`,
      );
    }

    await this.parseJson(response, QueuePauseResponseSchema, path);
  }

  /**
   * POST /api/v1/queue/resume
   *
   * Resumes global queue processing on the daemon.
   * Sends X-Orch-Actor header for audit trail.
   * Throws CoreApiError on non-2xx.
   */
  async resumeQueue(actor: string): Promise<void> {
    const path = '/api/v1/queue/resume';
    let response: Response;

    try {
      response = await this.doFetch(path, { method: 'POST' }, actor);
    } catch (err: unknown) {
      this.logger.error({ err }, 'core-client:resumeQueue:fetch-error');
      throw err;
    }

    if (!response.ok) {
      throw new CoreApiError(
        response.status,
        `POST ${path} failed with status ${response.status}`,
      );
    }

    await this.parseJson(response, QueueResumeResponseSchema, path);
  }

  /**
   * GET /api/v1/sessions/:id/tail?lines=N
   *
   * Returns the last N lines of stdout from the active session.
   * Validates response against TailResponseSchema (I-10).
   * Throws CoreApiError on 404 (no active session) or 5xx.
   */
  async getTail(id: string, lines: number): Promise<TailResponseDto> {
    const clampedLines = Math.min(Math.max(1, lines), 100);
    const path = `/api/v1/sessions/${encodeURIComponent(id)}/tail?lines=${clampedLines}`;
    let response: Response;

    try {
      response = await this.doFetch(path);
    } catch (err: unknown) {
      this.logger.error({ err }, 'core-client:getTail:fetch-error');
      throw err;
    }

    if (!response.ok) {
      throw new CoreApiError(
        response.status,
        `GET ${path} failed with status ${response.status}`,
      );
    }

    return this.parseJson(response, TailResponseSchema, path);
  }

  /**
   * GET /api/v1/projects
   *
   * Returns the list of registered projects.
   * Validates response against ProjectsResponseSchema (I-10).
   * Throws CoreApiError on non-2xx.
   */
  async getProjects(): Promise<ProjectDto[]> {
    const path = '/api/v1/projects';
    let response: Response;

    try {
      response = await this.doFetch(path);
    } catch (err: unknown) {
      this.logger.error({ err }, 'core-client:getProjects:fetch-error');
      throw err;
    }

    if (!response.ok) {
      throw new CoreApiError(
        response.status,
        `GET ${path} failed with status ${response.status}`,
      );
    }

    const data = await this.parseJson(response, ProjectsResponseSchema, path);
    return data.projects;
  }

  /**
   * GET /api/v1/sessions/:id/logs
   *
   * Returns the full stdout ring-buffer content for the given session as a string.
   * Throws CoreApiError on 404 or 5xx.
   */
  async getLogs(id: string): Promise<string> {
    const path = `/api/v1/sessions/${encodeURIComponent(id)}/logs`;
    let response: Response;

    try {
      response = await this.doFetch(path);
    } catch (err: unknown) {
      this.logger.error({ err }, 'core-client:getLogs:fetch-error');
      throw err;
    }

    if (!response.ok) {
      throw new CoreApiError(
        response.status,
        `GET ${path} failed with status ${response.status}`,
      );
    }

    // Response is plain text (Content-Type: text/plain)
    return response.text();
  }
}
