/**
 * ApiController spec
 *
 * Unit tests for all /api/v1 endpoints.
 *
 * Covers per endpoint:
 *  - Happy path
 *  - 400 on zod validation failure (where applicable)
 *  - Domain error propagation → 500
 *
 * Special coverage:
 *  - I-6 test: POST /sessions/:id/stop without ?confirm=1 → 400
 *  - I-6 test: POST /sessions/:id/stop with ?confirm=1 → calls terminate() + 200
 *  - Audit log tests (17-20): OperatorActionLog rows written on confirmed ops
 *  - POST /queue/pause + /queue/resume endpoints
 */

import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { ApiController } from './api.controller.js';
import { DomainError } from '../../domain/errors.js';
import type { ProjectRegistryService } from '../project-registry/project-registry.service.js';
import type { QueueService } from '../queue/queue.service.js';
import type { QueueRepository } from '../queue/queue.repository.js';
import type { SessionManager } from '../sessions/session-manager.js';
import type { OperatorActionLogService } from '../audit/operator-action-log.service.js';
import type { Profile } from '../../domain/profile.js';
import type { QueueItem } from '../../domain/queue-item.js';
import { QueueItemState } from '../../domain/queue-item.js';
import type { ActiveSession } from '../../domain/session.js';

// ── Mock factories ─────────────────────────────────────────────────────────────

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    projectId: 'proj-1',
    rootPath: '/home/user/project',
    ccsProfile: 'default',
    sessionTypes: [],
    hooks: {},
    ...overrides,
  } as unknown as Profile;
}

function makeQueueItem(overrides: Partial<QueueItem> = {}): QueueItem {
  return {
    id: 'item-1',
    sessionKey: 'proj-1:default:1',
    state: QueueItemState.Pending,
    priority: 5,
    dedupKey: 'proj-1:/plans/foo.md',
    payload: { planPath: '/plans/foo.md', mtime: 1000 },
    attempts: 0,
    maxAttempts: 3,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

function makeActiveSession(overrides: Partial<ActiveSession> = {}): ActiveSession {
  return {
    id: 'sess-1',
    projectId: 'proj-1',
    sessionKey: 'proj-1:default:prompt-prefix',
    startedAt: Date.now(),
    lastHeartbeatAt: null,
    ...overrides,
  };
}

function buildMockRegistry(): jest.Mocked<ProjectRegistryService> {
  return {
    listProjects: jest.fn(),
    getProject: jest.fn(),
    reload: jest.fn(),
    onModuleInit: jest.fn(),
    onModuleDestroy: jest.fn(),
  } as unknown as jest.Mocked<ProjectRegistryService>;
}

function buildMockQueueService(): jest.Mocked<QueueService> {
  return {
    enqueue: jest.fn(),
    next: jest.fn(),
    complete: jest.fn(),
    fail: jest.fn(),
    pause: jest.fn(),
    resume: jest.fn(),
    pauseGlobal: jest.fn(),
    resumeGlobal: jest.fn(),
    isPaused: false,
  } as unknown as jest.Mocked<QueueService>;
}

function buildMockQueueRepo(): jest.Mocked<QueueRepository> {
  return {
    list: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    findByDedupKey: jest.fn(),
    nextForProject: jest.fn(),
    updateState: jest.fn(),
    incrementAttempts: jest.fn(),
  } as unknown as jest.Mocked<QueueRepository>;
}

function buildMockSessionManager(): jest.Mocked<SessionManager> {
  return {
    getActiveSessions: jest.fn(),
    terminate: jest.fn(),
    cancelSession: jest.fn(),
    runSession: jest.fn(),
    recordHeartbeat: jest.fn(),
    getActive: jest.fn(),
    onModuleDestroy: jest.fn(),
    getSessionTail: jest.fn(),
    getSessionLogs: jest.fn(),
  } as unknown as jest.Mocked<SessionManager>;
}

function buildMockAuditLog(): jest.Mocked<OperatorActionLogService> {
  return {
    log: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<OperatorActionLogService>;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ApiController', () => {
  let controller: ApiController;
  let registry: jest.Mocked<ProjectRegistryService>;
  let queueService: jest.Mocked<QueueService>;
  let queueRepo: jest.Mocked<QueueRepository>;
  let sessionManager: jest.Mocked<SessionManager>;
  let auditLog: jest.Mocked<OperatorActionLogService>;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    registry = buildMockRegistry();
    queueService = buildMockQueueService();
    queueRepo = buildMockQueueRepo();
    sessionManager = buildMockSessionManager();
    auditLog = buildMockAuditLog();

    const mockContextBudget = { getUsage: jest.fn().mockReturnValue(null) } as unknown as import('../context-budget/context-budget.service.js').ContextBudgetService;
    controller = new ApiController(registry, queueService, queueRepo, sessionManager, auditLog, mockContextBudget);
  });

  afterEach(() => jest.restoreAllMocks());

  // ── GET /api/v1/projects ─────────────────────────────────────────────────────

  describe('GET /api/v1/projects', () => {
    it('returns list of registered projects', async () => {
      const profiles = [makeProfile({ projectId: 'proj-1' }), makeProfile({ projectId: 'proj-2' })];
      registry.listProjects.mockResolvedValue(profiles);

      const result = await controller.listProjects();

      expect(result.projects).toHaveLength(2);
      expect(result.projects[0].projectId).toBe('proj-1');
      expect(registry.listProjects).toHaveBeenCalledTimes(1);
    });

    it('returns empty array when no projects registered', async () => {
      registry.listProjects.mockResolvedValue([]);

      const result = await controller.listProjects();

      expect(result.projects).toEqual([]);
    });

    it('throws InternalServerErrorException on DomainError from registry', async () => {
      registry.listProjects.mockRejectedValue(
        new DomainError('STORE_ERROR', 'db failure'),
      );

      await expect(controller.listProjects()).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
    });
  });

  // ── GET /api/v1/queue ────────────────────────────────────────────────────────

  describe('GET /api/v1/queue', () => {
    it('returns all queue items when no filters supplied', async () => {
      const items = [makeQueueItem({ id: 'item-1' }), makeQueueItem({ id: 'item-2' })];
      queueRepo.list.mockResolvedValue(items);

      const result = await controller.listQueue({});

      expect(result.items).toHaveLength(2);
      expect(queueRepo.list).toHaveBeenCalledWith(undefined, undefined);
    });

    it('passes status filter to repository', async () => {
      queueRepo.list.mockResolvedValue([]);

      await controller.listQueue({ status: 'Pending' });

      expect(queueRepo.list).toHaveBeenCalledWith(undefined, QueueItemState.Pending);
    });

    it('passes projectId filter to repository', async () => {
      queueRepo.list.mockResolvedValue([]);

      await controller.listQueue({ projectId: 'proj-1' });

      expect(queueRepo.list).toHaveBeenCalledWith('proj-1', undefined);
    });

    it('passes both filters to repository', async () => {
      queueRepo.list.mockResolvedValue([]);

      await controller.listQueue({ status: 'Active', projectId: 'proj-1' });

      expect(queueRepo.list).toHaveBeenCalledWith('proj-1', QueueItemState.Active);
    });

    it('throws BadRequestException for invalid status value', async () => {
      await expect(
        controller.listQueue({ status: 'InvalidStatus' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws InternalServerErrorException on DomainError from repo', async () => {
      queueRepo.list.mockRejectedValue(
        new DomainError('STORE_ERROR', 'db failure'),
      );

      await expect(controller.listQueue({})).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
    });
  });

  // ── POST /api/v1/queue/pause ─────────────────────────────────────────────────

  describe('POST /api/v1/queue/pause', () => {
    // Audit log test 17: writes OperatorActionLog row with action="queue.pause"
    it('audit-17: writes OperatorActionLog row: action=queue.pause, actor from header, confirmed=true', async () => {
      const result = await controller.pauseQueue('telegram:123456');

      expect(result.ok).toBe(true);
      expect(result.paused).toBe(true);
      expect(queueService.pauseGlobal).toHaveBeenCalledTimes(1);
      expect(auditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({
          actor: 'telegram:123456',
          action: 'queue.pause',
          confirmed: true,
        }),
      );
    });

    it('uses "unknown" actor when X-Orch-Actor header absent', async () => {
      await controller.pauseQueue(undefined);

      expect(auditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ actor: 'unknown' }),
      );
    });
  });

  // ── POST /api/v1/queue/resume ────────────────────────────────────────────────

  describe('POST /api/v1/queue/resume', () => {
    it('calls resumeGlobal and writes audit row', async () => {
      const result = await controller.resumeQueue('telegram:999');

      expect(result.ok).toBe(true);
      expect(result.paused).toBe(false);
      expect(queueService.resumeGlobal).toHaveBeenCalledTimes(1);
      expect(auditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({
          actor: 'telegram:999',
          action: 'queue.resume',
          confirmed: true,
        }),
      );
    });
  });

  // ── POST /api/v1/queue ───────────────────────────────────────────────────────

  describe('POST /api/v1/queue', () => {
    it('returns enqueued item on valid body', async () => {
      const item = makeQueueItem();
      queueService.enqueue.mockResolvedValue(item);

      const result = await controller.enqueueItem({
        projectId: 'proj-1',
        planPath: '/plans/foo.md',
      }, undefined);

      expect(result.item).toEqual(item);
      expect(queueService.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'proj-1',
          planPath: '/plans/foo.md',
          dedupKey: 'proj-1:/plans/foo.md',
        }),
      );
    });

    it('passes priority when provided', async () => {
      const item = makeQueueItem();
      queueService.enqueue.mockResolvedValue(item);

      await controller.enqueueItem({
        projectId: 'proj-1',
        planPath: '/plans/bar.md',
        priority: 10,
      }, undefined);

      expect(queueService.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ priority: 10 }),
      );
    });

    it('throws BadRequestException when projectId is missing', async () => {
      await expect(
        controller.enqueueItem({ planPath: '/plans/foo.md' }, undefined),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws BadRequestException when planPath is missing', async () => {
      await expect(
        controller.enqueueItem({ projectId: 'proj-1' }, undefined),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws BadRequestException when body is empty', async () => {
      await expect(controller.enqueueItem({}, undefined)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('includes zod issues in BadRequestException response', async () => {
      try {
        await controller.enqueueItem({ projectId: '', planPath: '' }, undefined);
        fail('Expected BadRequestException');
      } catch (err) {
        expect(err).toBeInstanceOf(BadRequestException);
        const exc = err as BadRequestException;
        const response = exc.getResponse() as { issues?: unknown[] };
        expect(Array.isArray(response.issues)).toBe(true);
      }
    });

    it('throws InternalServerErrorException on DomainError from queue service', async () => {
      queueService.enqueue.mockRejectedValue(
        new DomainError('QUEUE_ERROR', 'enqueue failed'),
      );

      await expect(
        controller.enqueueItem({ projectId: 'proj-1', planPath: '/plans/foo.md' }, undefined),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
    });

    it('audit: enqueue writes OperatorActionLog row with target=item.id', async () => {
      const item = makeQueueItem({ id: 'item-xyz' });
      queueService.enqueue.mockResolvedValue(item);

      await controller.enqueueItem({
        projectId: 'proj-1',
        planPath: '/plans/foo.md',
      }, 'cli');

      expect(auditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({
          actor: 'cli',
          action: 'queue.enqueue',
          target: 'item-xyz',
          confirmed: true,
        }),
      );
    });
  });

  // ── GET /api/v1/sessions/active ──────────────────────────────────────────────

  describe('GET /api/v1/sessions/active', () => {
    it('returns snapshot of active sessions', () => {
      const sessions: ActiveSession[] = [
        makeActiveSession({ id: 'sess-1' }),
        makeActiveSession({ id: 'sess-2' }),
      ];
      sessionManager.getActiveSessions.mockReturnValue(sessions);

      const result = controller.listActiveSessions();

      expect(result.sessions).toHaveLength(2);
      expect(result.sessions[0].id).toBe('sess-1');
      expect(sessionManager.getActiveSessions).toHaveBeenCalledTimes(1);
    });

    it('returns empty array when no active sessions', () => {
      sessionManager.getActiveSessions.mockReturnValue([]);

      const result = controller.listActiveSessions();

      expect(result.sessions).toHaveLength(0);
    });

    it('throws InternalServerErrorException on unexpected error', () => {
      sessionManager.getActiveSessions.mockImplementation(() => {
        throw new DomainError('SESSION_ERROR', 'unexpected');
      });

      expect(() => controller.listActiveSessions()).toThrow(
        InternalServerErrorException,
      );
    });
  });

  // ── POST /api/v1/sessions/:id/stop ────────────────────────────────────────────

  describe('POST /api/v1/sessions/:id/stop', () => {
    // I-6 gate tests

    it('I-6: throws BadRequestException when ?confirm is missing', async () => {
      await expect(
        controller.stopSession('sess-1', undefined, undefined),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(sessionManager.terminate).not.toHaveBeenCalled();
    });

    it('I-6: throws BadRequestException when ?confirm=0', async () => {
      await expect(
        controller.stopSession('sess-1', '0', undefined),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(sessionManager.terminate).not.toHaveBeenCalled();
    });

    it('I-6: throws BadRequestException when ?confirm=true (not "1")', async () => {
      await expect(
        controller.stopSession('sess-1', 'true', undefined),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(sessionManager.terminate).not.toHaveBeenCalled();
    });

    it('I-6: calls terminate() and returns 200 when ?confirm=1', async () => {
      sessionManager.terminate.mockResolvedValue(undefined);

      const result = await controller.stopSession('sess-1', '1', undefined);

      expect(result.ok).toBe(true);
      expect(result.sessionId).toBe('sess-1');
      expect(sessionManager.terminate).toHaveBeenCalledWith('sess-1', 'api_stop');
    });

    it('I-6: BadRequestException message mentions ?confirm=1', async () => {
      try {
        await controller.stopSession('sess-1', undefined, undefined);
        fail('Expected BadRequestException');
      } catch (err) {
        expect(err).toBeInstanceOf(BadRequestException);
        const exc = err as BadRequestException;
        const msg = exc.message;
        expect(msg).toContain('confirm=1');
      }
    });

    // Audit log test 18: POST /sessions/:id/stop?confirm=1 writes audit row
    it('audit-18: writes OperatorActionLog row: action=session.stop, target=<id>', async () => {
      sessionManager.terminate.mockResolvedValue(undefined);

      await controller.stopSession('sess-abc', '1', 'telegram:555');

      expect(auditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({
          actor: 'telegram:555',
          action: 'session.stop',
          target: 'sess-abc',
          confirmed: true,
        }),
      );
    });

    // Audit log test 19: without confirm → 400; NO audit row written
    it('audit-19: stop without confirm=1 → 400; NO audit row written', async () => {
      await expect(
        controller.stopSession('sess-1', undefined, undefined),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(auditLog.log).not.toHaveBeenCalled();
    });

    it('throws InternalServerErrorException on DomainError from terminate()', async () => {
      sessionManager.terminate.mockRejectedValue(
        new DomainError('SESSION_ERROR', 'terminate failed'),
      );

      await expect(
        controller.stopSession('sess-1', '1', undefined),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
    });

    it('is idempotent: terminate() returns void for unknown session IDs', async () => {
      sessionManager.terminate.mockResolvedValue(undefined);

      const result = await controller.stopSession('unknown-session', '1', undefined);

      expect(result.ok).toBe(true);
      expect(result.sessionId).toBe('unknown-session');
    });
  });

  // ── GET /api/v1/sessions/:id/tail ─────────────────────────────────────────────

  describe('GET /api/v1/sessions/:id/tail', () => {
    it('returns tail lines for active session', () => {
      sessionManager.getSessionTail.mockReturnValue({
        lines: ['line 1', 'line 2', 'line 3'],
        truncated: false,
      });

      const result = controller.getSessionTail('sess-1', undefined);

      expect(result.lines).toHaveLength(3);
      expect(result.truncated).toBe(false);
      expect(sessionManager.getSessionTail).toHaveBeenCalledWith('sess-1', 20);
    });

    it('clamps lines param to max 100 and returns truncated=true when server caps', () => {
      const hundredLines = Array.from({ length: 100 }, (_, i) => `line ${i}`);
      sessionManager.getSessionTail.mockReturnValue({
        lines: hundredLines,
        truncated: true,
      });

      const result = controller.getSessionTail('sess-1', '999');

      // Server should have clamped to 100
      expect(sessionManager.getSessionTail).toHaveBeenCalledWith('sess-1', 100);
      expect(result.lines).toHaveLength(100);
      expect(result.truncated).toBe(true);
    });

    it('returns 404 when session is not found', async () => {
      sessionManager.getSessionTail.mockReturnValue(null);

      expect(() => controller.getSessionTail('unknown-sess', undefined)).toThrow(
        expect.objectContaining({ status: 404 }),
      );
    });

    it('uses default 20 lines when no lines param given', () => {
      sessionManager.getSessionTail.mockReturnValue({
        lines: [],
        truncated: false,
      });

      controller.getSessionTail('sess-1', undefined);

      expect(sessionManager.getSessionTail).toHaveBeenCalledWith('sess-1', 20);
    });
  });

  // ── GET /api/v1/sessions/:id/logs ─────────────────────────────────────────────

  describe('GET /api/v1/sessions/:id/logs', () => {
    it('returns full log content as string for active session', () => {
      const fullLog = 'line 1\nline 2\nline 3\n';
      sessionManager.getSessionLogs.mockReturnValue(fullLog);

      const result = controller.getSessionLogs('sess-1');

      expect(result).toBe(fullLog);
      expect(sessionManager.getSessionLogs).toHaveBeenCalledWith('sess-1');
    });

    it('returns 404 when session is not found', () => {
      sessionManager.getSessionLogs.mockReturnValue(null);

      expect(() => controller.getSessionLogs('unknown-sess')).toThrow(
        expect.objectContaining({ status: 404 }),
      );
    });
  });
});
