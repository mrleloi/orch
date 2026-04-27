/**
 * ApiController — REST API for Orch daemon management.
 *
 * Base path: /api/v1 (set on AppModule via global prefix or per-controller).
 *
 * Endpoints:
 *  GET  /api/v1/config                 — daemon runtime config (trace backend URL, etc.)
 *  GET  /api/v1/projects               — list registered projects
 *  GET  /api/v1/queue                  — list queue items (filters: status?, projectId?)
 *  POST /api/v1/queue                  — enqueue a plan (body: projectId, planPath, priority?)
 *  POST /api/v1/queue/pause            — pause queue processing (I-6: confirmed=true)
 *  POST /api/v1/queue/resume           — resume queue processing
 *  GET  /api/v1/sessions/active        — list active sessions
 *  GET  /api/v1/sessions/:id/tail      — tail last N stdout lines (default 20, max 100)
 *  GET  /api/v1/sessions/:id/logs      — full stdout ring-buffer as plain text
 *  GET  /api/v1/sessions/:id/usage     — per-session token/cost usage (charter O3, F6)
 *  POST /api/v1/sessions/:id/stop      — terminate a session (requires ?confirm=1, I-6)
 *
 * Auth is handled upstream by BearerAuthMiddleware (applied in ApiModule).
 *
 * I-6:  POST /sessions/:id/stop requires ?confirm=1 query param; without it → 400.
 *        Audit row written on every confirmed destructive op.
 * I-10: Every external body validated via zod (safeParse pattern).
 * I-12: DomainError subclasses handled and mapped to HTTP errors.
 * I-14: No domain/ imports beyond types and errors.
 */

import {
  BadRequestException,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  Inject,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  Param,
  Post,
  Body,
  Query,
} from '@nestjs/common';
import type { ZodError } from 'zod';
import { ProjectRegistryService } from '../project-registry/project-registry.service.js';
import { QueueService } from '../queue/queue.service.js';
import { QueueRepository } from '../queue/queue.repository.js';
import { SessionManager } from '../sessions/session-manager.js';
import { OperatorActionLogService } from '../audit/operator-action-log.service.js';
import { DomainError } from '../../domain/errors.js';
import type { Profile } from '../../domain/profile.js';
import type { QueueItem } from '../../domain/queue-item.js';
import type { ActiveSession } from '../../domain/session.js';
import {
  EnqueuePlanBodySchema,
  QueueListQuerySchema,
  SessionUsageQuerySchema,
} from './schemas/api.schemas.js';
import { DEFAULT_TAIL_LINES } from '../../config/defaults.js';
import { ContextBudgetService } from '../context-budget/context-budget.service.js';
import type { SessionUsageResponse } from '../context-budget/context-budget.types.js';

// ── Response shapes ────────────────────────────────────────────────────────────

interface ProjectsResponse {
  projects: Profile[];
}

interface QueueListResponse {
  items: QueueItem[];
}

interface EnqueueResponse {
  item: QueueItem;
}

interface ActiveSessionsResponse {
  sessions: readonly ActiveSession[];
}

interface StopSessionResponse {
  ok: boolean;
  sessionId: string;
}

interface TailResponse {
  lines: string[];
  truncated: boolean;
}

interface QueuePauseResponse {
  ok: boolean;
  paused: boolean;
}

interface QueueResumeResponse {
  ok: boolean;
  paused: boolean;
}

interface ConfigResponse {
  /** URL of the trace backend UI (empty string = no link). Exposed from ORCH_TRACE_BACKEND_UI_URL. */
  traceBackendUiUrl: string;
  /** Active trace backend type. Consumed by Web UI to branch the trace deep-link URL pattern. */
  traceBackend: 'otlp' | 'langfuse' | 'none';
}

// ── Actor extraction helper ────────────────────────────────────────────────────

/**
 * Derive the actor string from the X-Orch-Actor header.
 * Falls back to "unknown" if the header is absent.
 */
function deriveActor(actorHeader: string | undefined): string {
  return actorHeader?.trim() || 'unknown';
}

// ── Controller ─────────────────────────────────────────────────────────────────

@Controller('api/v1')
export class ApiController {
  private readonly logger = new Logger(ApiController.name);

  constructor(
    private readonly projectRegistry: ProjectRegistryService,
    private readonly queueService: QueueService,
    private readonly queueRepo: QueueRepository,
    private readonly sessionManager: SessionManager,
    private readonly auditLog: OperatorActionLogService,
    @Inject(ContextBudgetService)
    private readonly contextBudget: ContextBudgetService,
  ) {}

  // ── GET /api/v1/projects ───────────────────────────────────────────────────

  /**
   * List all registered projects from the in-memory project registry cache.
   */
  @Get('projects')
  async listProjects(): Promise<ProjectsResponse> {
    try {
      const projects = await this.projectRegistry.listProjects();
      return { projects };
    } catch (err) {
      this.handleError('api:list-projects', err);
    }
  }

  // ── GET /api/v1/queue ──────────────────────────────────────────────────────

  /**
   * List queue items with optional filters.
   *
   * Query params:
   *  - status?    Filter by QueueItemState enum value
   *  - projectId? Filter by project ID
   *
   * Validates query params via zod (I-10).
   */
  @Get('queue')
  async listQueue(@Query() rawQuery: unknown): Promise<QueueListResponse> {
    const parseResult = QueueListQuerySchema.safeParse(rawQuery);
    if (!parseResult.success) {
      const zodError = parseResult.error as ZodError;
      throw new BadRequestException({
        message: 'Invalid query parameters',
        issues: zodError.issues.map((i) => ({
          path: i.path,
          message: i.message,
        })),
      });
    }

    const { status, projectId } = parseResult.data;

    try {
      const items = await this.queueRepo.list(projectId, status);
      return { items };
    } catch (err) {
      this.handleError('api:list-queue', err);
    }
  }

  // ── POST /api/v1/queue/pause ───────────────────────────────────────────────

  /**
   * Pause queue processing.
   *
   * Bearer-auth gated (via ApiModule middleware).
   * Writes OperatorActionLog row (actor from X-Orch-Actor header).
   */
  @Post('queue/pause')
  @HttpCode(200)
  async pauseQueue(
    @Headers('x-orch-actor') actorHeader: string | undefined,
  ): Promise<QueuePauseResponse> {
    const actor = deriveActor(actorHeader);

    try {
      this.queueService.pauseGlobal();
    } catch (err) {
      this.handleError('api:queue-pause', err);
    }

    await this.auditLog.log({
      actor,
      action: 'queue.pause',
      confirmed: true,
    });

    return { ok: true, paused: true };
  }

  // ── POST /api/v1/queue/resume ──────────────────────────────────────────────

  /**
   * Resume queue processing.
   *
   * Bearer-auth gated (via ApiModule middleware).
   * Writes OperatorActionLog row (actor from X-Orch-Actor header).
   */
  @Post('queue/resume')
  @HttpCode(200)
  async resumeQueue(
    @Headers('x-orch-actor') actorHeader: string | undefined,
  ): Promise<QueueResumeResponse> {
    const actor = deriveActor(actorHeader);

    try {
      this.queueService.resumeGlobal();
    } catch (err) {
      this.handleError('api:queue-resume', err);
    }

    await this.auditLog.log({
      actor,
      action: 'queue.resume',
      confirmed: true,
    });

    return { ok: true, paused: false };
  }

  // ── POST /api/v1/queue ─────────────────────────────────────────────────────

  /**
   * Enqueue a plan file for processing.
   *
   * Body (validated via zod — I-10):
   *  - projectId: string   (required)
   *  - planPath:  string   (required)
   *  - priority?: number   (0-100, optional)
   *
   * Generates a stable dedupKey from projectId + planPath so repeated calls
   * with the same plan are idempotent (I-8).
   *
   * Writes OperatorActionLog row (actor from X-Orch-Actor header).
   */
  @Post('queue')
  @HttpCode(200)
  async enqueueItem(
    @Body() rawBody: unknown,
    @Headers('x-orch-actor') actorHeader: string | undefined,
  ): Promise<EnqueueResponse> {
    const parseResult = EnqueuePlanBodySchema.safeParse(rawBody);
    if (!parseResult.success) {
      const zodError = parseResult.error as ZodError;
      throw new BadRequestException({
        message: 'Request body validation failed',
        issues: zodError.issues.map((i) => ({
          path: i.path,
          message: i.message,
        })),
      });
    }

    const { projectId, planPath, priority } = parseResult.data;
    const actor = deriveActor(actorHeader);

    // Stable dedup key: same projectId+planPath always resolves to same key (I-8)
    const dedupKey = `${projectId}:${planPath}`;
    const mtime = Date.now();

    let item: QueueItem;
    try {
      item = await this.queueService.enqueue({
        projectId,
        planPath,
        priority,
        dedupKey,
        mtime,
      });
    } catch (err) {
      this.handleError('api:enqueue', err);
    }

    // Write audit row for enqueue (non-destructive but auditable)
    await this.auditLog.log({
      actor,
      action: 'queue.enqueue',
      target: item.id,
      confirmed: true,
    });

    return { item };
  }

  // ── GET /api/v1/sessions/active ────────────────────────────────────────────

  /**
   * Return a snapshot of all currently active (non-terminal) sessions.
   */
  @Get('sessions/active')
  listActiveSessions(): ActiveSessionsResponse {
    try {
      const sessions = this.sessionManager.getActiveSessions();
      return { sessions };
    } catch (err) {
      this.handleError('api:list-sessions', err);
    }
  }

  // ── GET /api/v1/sessions/:id/tail ─────────────────────────────────────────

  /**
   * Tail the last N lines of stdout from an active session.
   *
   * Query params:
   *  - lines? (default 20, max 100 server-side)
   *
   * Returns 404 if no active session with the given id.
   * Returns { lines: string[], truncated: boolean }.
   */
  @Get('sessions/:id/tail')
  getSessionTail(
    @Param('id') sessionId: string,
    @Query('lines') rawLines: string | undefined,
  ): TailResponse {
    // Parse and clamp lines param (default 20, max 100)
    const MAX_LINES = 100;
    let lines = DEFAULT_TAIL_LINES;
    if (rawLines !== undefined) {
      const parsed = parseInt(rawLines, 10);
      if (!isNaN(parsed) && parsed > 0) {
        lines = Math.min(parsed, MAX_LINES);
      }
    }

    try {
      const result = this.sessionManager.getSessionTail(sessionId, lines);
      if (result === null) {
        throw new NotFoundException(
          `Session ${sessionId} not found or not active`,
        );
      }
      return result;
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      this.handleError('api:session-tail', err);
    }
  }

  // ── GET /api/v1/sessions/:id/logs ──────────────────────────────────────────

  /**
   * Return the full stdout ring-buffer content for an active session as plain text.
   *
   * Returns 404 if no active session with the given id.
   * Content-Type: text/plain.
   */
  @Get('sessions/:id/logs')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  getSessionLogs(@Param('id') sessionId: string): string {
    try {
      const result = this.sessionManager.getSessionLogs(sessionId);
      if (result === null) {
        throw new NotFoundException(
          `Session ${sessionId} not found or not active`,
        );
      }
      return result;
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      this.handleError('api:session-logs', err);
    }
  }

  // ── POST /api/v1/sessions/:id/stop ─────────────────────────────────────────

  /**
   * Terminate an active session by its Orch-internal session ID.
   *
   * I-6 gate: requires `?confirm=1` query param.
   * Without it → 400 DomainError.
   *
   * Writes OperatorActionLog row on confirmed stop.
   * Actor derived from X-Orch-Actor header.
   *
   * Calls sessionManager.terminate() (by sessionKey-based lookup via terminate()).
   * Returns 200 on success. Idempotent: if session not found, still returns 200.
   */
  @Post('sessions/:id/stop')
  @HttpCode(200)
  async stopSession(
    @Param('id') sessionId: string,
    @Query('confirm') confirm: string | undefined,
    @Headers('x-orch-actor') actorHeader: string | undefined,
  ): Promise<StopSessionResponse> {
    // I-6: require explicit confirmation flag
    if (confirm !== '1') {
      throw new BadRequestException(
        'Destructive action requires ?confirm=1 query parameter (I-6)',
      );
    }

    const actor = deriveActor(actorHeader);

    try {
      await this.sessionManager.terminate(sessionId, 'api_stop');
    } catch (err) {
      this.handleError('api:stop-session', err);
    }

    // Audit row written AFTER successful op (I-6: confirmed=true, record of fact)
    await this.auditLog.log({
      actor,
      action: 'session.stop',
      target: sessionId,
      confirmed: true,
    });

    return { ok: true, sessionId };
  }

  // ── GET /api/v1/config ─────────────────────────────────────────────────────

  /**
   * Return runtime configuration consumed by Web UI clients.
   *
   * Exposes:
   *  - traceBackendUiUrl: value of ORCH_TRACE_BACKEND_UI_URL env var (empty = no link).
   *  - traceBackend: value of ORCH_TRACE_BACKEND env var ('otlp' | 'langfuse' | 'none').
   *
   * Task 3.9: traceBackend used by Web UI to branch trace deep-link URL pattern.
   * I-10: env vars validated via envSchema at daemon startup (validateEnv in main.ts).
   */
  @Get('config')
  getConfig(): ConfigResponse {
    const rawBackend = process.env['ORCH_TRACE_BACKEND'] ?? 'otlp';
    const traceBackend: 'otlp' | 'langfuse' | 'none' =
      rawBackend === 'langfuse'
        ? 'langfuse'
        : rawBackend === 'none'
          ? 'none'
          : 'otlp';

    return {
      traceBackendUiUrl: process.env['ORCH_TRACE_BACKEND_UI_URL'] ?? '',
      traceBackend,
    };
  }

  // ── GET /api/v1/sessions/:id/usage ────────────────────────────────────────

  /**
   * Return per-session token/cost usage aggregated from in-process OTEL span data.
   *
   * Data source: ContextBudgetService in-memory accumulator (per session).
   * If no spans have been observed for the session, returns an empty sample list
   * with all-zero totals (NOT a 404 — session may exist but have no LLM calls yet).
   *
   * Query params (I-10 zod-validated):
   *  - since?: ISO-8601 — exclude samples before this time
   *  - until?: ISO-8601 — exclude samples after this time
   *
   * Response: { samples: UsageSample[], totals: { inputTokens, outputTokens, cacheReadTokens, costUsd } }
   *
   * Auth: gated by BearerAuthMiddleware (same as all /api/v1/* routes).
   * Charter: O3 (cost queryable per session), F6 (chart rendered in Web UI).
   */
  @Get('sessions/:id/usage')
  getSessionUsage(
    @Param('id') sessionId: string,
    @Query() rawQuery: unknown,
  ): SessionUsageResponse {
    const parseResult = SessionUsageQuerySchema.safeParse(rawQuery);
    if (!parseResult.success) {
      const zodError = parseResult.error;
      throw new BadRequestException({
        message: 'Invalid query parameters',
        issues: zodError.issues.map((i) => ({
          path: i.path,
          message: i.message,
        })),
      });
    }

    const { since, until } = parseResult.data;

    // Get aggregated usage from in-memory context budget accumulator.
    // Returns null if no spans observed yet (session exists but no LLM calls).
    const raw = this.contextBudget.getUsage(sessionId);

    if (raw === null) {
      // No spans observed yet — return empty response (not a 404)
      return {
        samples: [],
        totals: {
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          costUsd: 0,
        },
      };
    }

    // Apply optional time filters
    let samples = raw.samples;
    if (since !== undefined) {
      const sinceMs = new Date(since).getTime();
      samples = samples.filter((s) => new Date(s.ts).getTime() >= sinceMs);
    }
    if (until !== undefined) {
      const untilMs = new Date(until).getTime();
      samples = samples.filter((s) => new Date(s.ts).getTime() <= untilMs);
    }

    // Recompute totals from filtered samples
    const totals = samples.reduce(
      (acc, s) => ({
        inputTokens: acc.inputTokens + s.inputTokens,
        outputTokens: acc.outputTokens + s.outputTokens,
        cacheReadTokens: acc.cacheReadTokens + s.cacheReadTokens,
        costUsd: acc.costUsd + s.costUsd,
      }),
      { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, costUsd: 0 },
    );

    return { samples, totals };
  }

  // ── Error handling ─────────────────────────────────────────────────────────

  /**
   * Log and rethrow domain errors as appropriate HTTP exceptions.
   *
   * I-12: DomainErrors are mapped; raw errors never surface as 200.
   */
  private handleError(context: string, err: unknown): never {
    if (err instanceof DomainError) {
      this.logger.error({
        msg: `${context}:domain-error`,
        code: err.code,
        error: err.message,
      });
      throw new InternalServerErrorException(`Operation failed: ${err.code}`);
    }

    this.logger.error({
      msg: `${context}:unexpected-error`,
      error: String(err),
    });
    throw new InternalServerErrorException('Operation failed');
  }
}
