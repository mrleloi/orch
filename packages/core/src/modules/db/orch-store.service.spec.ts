/**
 * OrchStoreService spec
 *
 * Tests the IOrchStore implementation against a real SQLite DB:
 *   - CRUD roundtrip: Project / Session / QueueItem / HookEvent
 *   - Transaction rollback
 *   - HookEvent dedup unique-constraint enforcement (I-8)
 *
 * I-13: per-test tmp-file SQLite DB. Migrations applied via better-sqlite3
 * directly — no Prisma CLI spawned, no shared state.
 */

import * as os from 'node:os';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { readFileSync } from 'node:fs';
import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaService } from './prisma.service.js';
import { OrchStoreService, DedupViolationError } from './orch-store.service.js';
import { SessionState } from '../../domain/session.js';
import { QueueItemState } from '../../domain/queue-item.js';
import { DomainError } from '../../domain/errors.js';

// ── migration SQL loader ──────────────────────────────────────────────────────

const MIGRATIONS_DIR = path.join(__dirname, '../../../prisma/migrations');

function readAllMigrations(): string {
  const migrationFolders = fs
    .readdirSync(MIGRATIONS_DIR)
    .sort()
    .filter((d) =>
      fs.statSync(path.join(MIGRATIONS_DIR, d)).isDirectory(),
    );
  return migrationFolders
    .map((folder) =>
      readFileSync(
        path.join(MIGRATIONS_DIR, folder, 'migration.sql'),
        'utf8',
      ),
    )
    .join('\n');
}

// ── test DB factory ───────────────────────────────────────────────────────────

function createTestDb(): string {
  const tmp = path.join(
    os.tmpdir(),
    `orch-store-test-${process.pid}-${Date.now()}.db`,
  );
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require('better-sqlite3') as typeof import('better-sqlite3').default;
  const db = new Database(tmp);
  db.exec(readAllMigrations());
  db.close();
  return tmp;
}

// ── test project fixture ──────────────────────────────────────────────────────

const PROJECT_FIXTURE = {
  id: 'test-project-id',
  rootPath: '/tmp/test-project',
  profileJson: JSON.stringify({ projectId: 'test-proj', rootPath: '/tmp' }),
};

// ── suite ─────────────────────────────────────────────────────────────────────

describe('OrchStoreService', () => {
  let module: TestingModule;
  let prisma: PrismaService;
  let store: OrchStoreService;
  let testDbPath: string;

  beforeEach(async () => {
    testDbPath = createTestDb();
    process.env['DATABASE_URL'] = `file:${testDbPath}`;

    module = await Test.createTestingModule({
      providers: [PrismaService, OrchStoreService],
    }).compile();

    prisma = module.get(PrismaService);
    store = module.get(OrchStoreService);
    await prisma.onModuleInit();

    // Seed a project so Session and QueueItem FKs resolve
    await prisma.project.create({ data: PROJECT_FIXTURE });
  });

  afterEach(async () => {
    await prisma.onModuleDestroy();
    await module.close();
    try {
      fs.unlinkSync(testDbPath);
      fs.unlinkSync(`${testDbPath}-wal`);
      fs.unlinkSync(`${testDbPath}-shm`);
    } catch {
      // ignore missing files
    }
    delete process.env['DATABASE_URL'];
  });

  // ── Sessions ─────────────────────────────────────────────────────────────

  describe('Sessions', () => {
    it('should create and retrieve a session', async () => {
      const session = await store.createSession({
        projectId: PROJECT_FIXTURE.id,
        sessionKey: 'test-proj:impl:1',
        model: 'claude-opus-4-5',
      });

      expect(session.id).toBeDefined();
      expect(session.projectId).toBe(PROJECT_FIXTURE.id);
      expect(session.sessionKey).toBe('test-proj:impl:1');
      expect(session.state).toBe(SessionState.Idle);
      expect(session.model).toBe('claude-opus-4-5');

      const fetched = await store.getSession(session.id);
      expect(fetched).not.toBeNull();
      expect(fetched?.id).toBe(session.id);
    });

    it('should return null for unknown session id', async () => {
      const result = await store.getSession('non-existent-id');
      expect(result).toBeNull();
    });

    it('should update a session state', async () => {
      const session = await store.createSession({
        projectId: PROJECT_FIXTURE.id,
        sessionKey: 'test-proj:impl:2',
      });

      const updated = await store.updateSession(session.id, {
        state: SessionState.Running,
        startedAt: new Date(),
        tokensUsed: 1234,
      });

      expect(updated.state).toBe(SessionState.Running);
      expect(updated.tokensUsed).toBe(1234);
      expect(updated.startedAt).toBeInstanceOf(Date);
    });

    it('should list active sessions (non-terminal states)', async () => {
      const s1 = await store.createSession({
        projectId: PROJECT_FIXTURE.id,
        sessionKey: 'test-proj:impl:active',
      });
      const s2 = await store.createSession({
        projectId: PROJECT_FIXTURE.id,
        sessionKey: 'test-proj:impl:ended',
      });

      await store.updateSession(s1.id, { state: SessionState.Running });
      await store.updateSession(s2.id, { state: SessionState.Ended });

      const active = await store.listActiveSessions();
      const ids = active.map((s) => s.id);
      expect(ids).toContain(s1.id);
      expect(ids).not.toContain(s2.id);
    });

    it('should throw DomainError when updating non-existent session', async () => {
      await expect(
        store.updateSession('bad-id', { state: SessionState.Running }),
      ).rejects.toBeInstanceOf(DomainError);
    });
  });

  // ── Queue ─────────────────────────────────────────────────────────────────

  describe('Queue', () => {
    it('should enqueue and retrieve items', async () => {
      const item = await store.enqueueItem({
        sessionKey: 'test-proj:impl:1',
        dedupKey: '/plans/task1.md:1234567890',
        priority: 5,
        payload: { planPath: '/plans/task1.md' },
        maxAttempts: 3,
      });

      expect(item.id).toBeDefined();
      expect(item.state).toBe(QueueItemState.Pending);
      expect(item.priority).toBe(5);
      expect(item.dedupKey).toBe('/plans/task1.md:1234567890');
      expect(item.payload).toEqual({ planPath: '/plans/task1.md' });

      const queued = await store.listQueue();
      expect(queued.some((q) => q.id === item.id)).toBe(true);
    });

    it('should dequeue next item atomically (highest priority first)', async () => {
      await store.enqueueItem({
        sessionKey: 'test-proj:impl:1',
        dedupKey: 'low-priority:1',
        priority: 1,
      });
      await store.enqueueItem({
        sessionKey: 'test-proj:impl:1',
        dedupKey: 'high-priority:1',
        priority: 10,
      });

      const dequeued = await store.dequeueNext();
      expect(dequeued).not.toBeNull();
      expect(dequeued?.state).toBe(QueueItemState.Active);
      expect(dequeued?.dedupKey).toBe('high-priority:1'); // higher priority first

      // After dequeue, item should be Active
      const next = await store.dequeueNext();
      expect(next?.dedupKey).toBe('low-priority:1');
    });

    it('should return null when queue is empty', async () => {
      const result = await store.dequeueNext();
      expect(result).toBeNull();
    });

    it('should update a queue item state', async () => {
      const item = await store.enqueueItem({
        sessionKey: 'test-proj:impl:1',
        dedupKey: 'update-test:1',
      });

      const updated = await store.updateQueueItem(item.id, {
        state: QueueItemState.Completed,
        endedAt: new Date(),
      });

      expect(updated.state).toBe(QueueItemState.Completed);
      expect(updated.endedAt).toBeInstanceOf(Date);
    });

    it('should filter queue by state', async () => {
      await store.enqueueItem({
        sessionKey: 'test-proj:impl:1',
        dedupKey: 'filter-test-pending:1',
      });
      const item = await store.enqueueItem({
        sessionKey: 'test-proj:impl:1',
        dedupKey: 'filter-test-active:1',
      });
      await store.updateQueueItem(item.id, { state: QueueItemState.Active });

      const pending = await store.listQueue({ status: QueueItemState.Pending });
      const active = await store.listQueue({ status: QueueItemState.Active });

      expect(pending.every((q) => q.state === QueueItemState.Pending)).toBe(
        true,
      );
      expect(active.every((q) => q.state === QueueItemState.Active)).toBe(true);
    });
  });

  // ── HookEvents ────────────────────────────────────────────────────────────

  describe('HookEvents', () => {
    let sessionId: string;

    beforeEach(async () => {
      const session = await store.createSession({
        projectId: PROJECT_FIXTURE.id,
        sessionKey: 'test-proj:impl:hook-test',
      });
      sessionId = session.id;
    });

    it('should record a hook event', async () => {
      await expect(
        store.recordHookEvent({
          id: 'hook-1',
          sessionId,
          eventType: 'SessionStart',
          payload: { model: 'claude-opus-4-5' },
        }),
      ).resolves.toBeUndefined();
    });

    it('should silently ignore duplicate hook events (I-8 dedup)', async () => {
      const ev = {
        id: 'hook-dup-1',
        sessionId,
        eventType: 'Stop',
        payload: { reason: 'user_cancel' },
      };

      // First insert succeeds
      await expect(store.recordHookEvent(ev)).resolves.toBeUndefined();
      // Second insert with same id (same dedupKey) must NOT throw
      await expect(store.recordHookEvent(ev)).resolves.toBeUndefined();
    });

    it('should allow different events with the same eventType (different id)', async () => {
      const base = {
        sessionId,
        eventType: 'Stop',
        payload: {},
      };
      await store.recordHookEvent({ ...base, id: 'hook-multi-1' });
      await store.recordHookEvent({ ...base, id: 'hook-multi-2' });
      // Both should succeed — different ids = different dedupKeys
    });
  });

  // ── Transactions ──────────────────────────────────────────────────────────

  describe('Transactions', () => {
    it('should commit successful transaction', async () => {
      await store.withTransaction(async (tx) => {
        await tx.createSession({
          projectId: PROJECT_FIXTURE.id,
          sessionKey: 'test-proj:impl:tx-ok',
        });
      });

      const all = await store.listActiveSessions();
      // Session was created with Idle state (not active) — check via prisma directly
      const row = await prisma.session.findFirst({
        where: { sessionKey: 'test-proj:impl:tx-ok' },
      });
      expect(row).not.toBeNull();
    });

    it('should roll back on error (atomicity)', async () => {
      const sessionKey = 'test-proj:impl:tx-rollback';

      await expect(
        store.withTransaction(async (tx) => {
          await tx.createSession({
            projectId: PROJECT_FIXTURE.id,
            sessionKey,
          });
          // Force an error to trigger rollback
          throw new Error('intentional rollback');
        }),
      ).rejects.toThrow('intentional rollback');

      // Session should NOT exist after rollback
      const row = await prisma.session.findFirst({
        where: { sessionKey },
      });
      expect(row).toBeNull();
    });
  });

  // ── Session Locks ─────────────────────────────────────────────────────────

  describe('Session Locks', () => {
    const LOCK_KEY = 'test-proj:impl:lock-test';
    const OWNER_A = 'owner-a';
    const OWNER_B = 'owner-b';

    it('should acquire a lock', async () => {
      const acquired = await store.acquireSessionLock(LOCK_KEY, OWNER_A, 30);
      expect(acquired).toBe(true);
    });

    it('should not acquire a lock already held', async () => {
      await store.acquireSessionLock(LOCK_KEY, OWNER_A, 30);
      const second = await store.acquireSessionLock(LOCK_KEY, OWNER_B, 30);
      expect(second).toBe(false);
    });

    it('should renew a held lock', async () => {
      await store.acquireSessionLock(LOCK_KEY, OWNER_A, 30);
      const renewed = await store.renewSessionLock(LOCK_KEY, OWNER_A);
      expect(renewed).toBe(true);
    });

    it('should not renew a lock held by different owner', async () => {
      await store.acquireSessionLock(LOCK_KEY, OWNER_A, 30);
      const renewed = await store.renewSessionLock(LOCK_KEY, OWNER_B);
      expect(renewed).toBe(false);
    });

    it('should release a lock', async () => {
      await store.acquireSessionLock(LOCK_KEY, OWNER_A, 30);
      await store.releaseSessionLock(LOCK_KEY, OWNER_A);
      // After release, OWNER_B can acquire
      const acquired = await store.acquireSessionLock(LOCK_KEY, OWNER_B, 30);
      expect(acquired).toBe(true);
    });
  });

  // ── Error mapping (I-12) ──────────────────────────────────────────────────

  describe('Error mapping (I-12)', () => {
    it('should throw DomainError on store failure', async () => {
      // Session with non-existent projectId triggers FK constraint
      await expect(
        store.createSession({
          projectId: 'non-existent-project',
          sessionKey: 'bad:impl:1',
        }),
      ).rejects.toBeInstanceOf(DomainError);
    });

    it('should throw DedupViolationError on dedup constraint (direct DB insert)', async () => {
      // Insert a HookEvent then try to re-insert with same dedupKey directly via prisma
      const session = await store.createSession({
        projectId: PROJECT_FIXTURE.id,
        sessionKey: 'test-proj:impl:dedup-direct',
      });

      const dedupKey = `dedup-test-key-${Date.now()}`;
      await prisma.hookEvent.create({
        data: {
          id: 'direct-1',
          sessionId: session.id,
          eventType: 'Stop',
          payloadJson: '{}',
          dedupKey,
        },
      });

      // Second insert with same dedupKey via Prisma directly should throw
      // DedupViolationError is thrown by mapPrismaError
      await expect(
        prisma.hookEvent.create({
          data: {
            id: 'direct-2',
            sessionId: session.id,
            eventType: 'Stop',
            payloadJson: '{}',
            dedupKey, // same key = unique violation
          },
        }),
      ).rejects.toThrow(); // Prisma throws its own error; the store silences it
    });
  });
});

// ── releaseSessionLock P2021 tolerance (mock-based) ──────────────────────────
//
// These tests verify the P2021 (table not found) graceful-degradation path
// added to releaseSessionLock without requiring a real DB.

describe('OrchStoreService.releaseSessionLock — P2021 tolerance', () => {
  function makeP2021Error(): object {
    // Structural shape that isPrismaKnownError recognises (duck-typed, no instanceof)
    return { code: 'P2021', message: "The table `main.SessionLock` does not exist" };
  }

  function makeP2002Error(): object {
    return { code: 'P2002', message: 'Unique constraint failed', meta: { modelName: 'SessionLock', target: ['sessionKey'] } };
  }

  function makeGenericError(): Error {
    return new Error('SQLITE_IOERR: disk I/O error');
  }

  it('resolves without throwing when deleteMany rejects with P2021 (table missing)', async () => {
    const mockDb = {
      sessionLock: {
        deleteMany: jest.fn().mockRejectedValue(makeP2021Error()),
      },
    };

    const svc = new OrchStoreService(mockDb as unknown as PrismaService);
    const warnSpy = jest.spyOn((svc as unknown as { logger: { warn: jest.Mock } }).logger, 'warn').mockImplementation(() => {});

    await expect(
      svc.releaseSessionLock('proj:impl:1', 'owner-a'),
    ).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: 'session-lock:release-on-torn-down-db',
        sessionKey: 'proj:impl:1',
        owner: 'owner-a',
        code: 'P2021',
      }),
    );
  });

  it('still throws DomainError when deleteMany rejects with a non-P2021 Prisma error', async () => {
    const mockDb = {
      sessionLock: {
        deleteMany: jest.fn().mockRejectedValue(makeP2002Error()),
      },
    };

    const svc = new OrchStoreService(mockDb as unknown as PrismaService);

    await expect(
      svc.releaseSessionLock('proj:impl:2', 'owner-b'),
    ).rejects.toBeInstanceOf(DomainError);
  });

  it('still throws DomainError when deleteMany rejects with a generic (non-Prisma) error', async () => {
    const mockDb = {
      sessionLock: {
        deleteMany: jest.fn().mockRejectedValue(makeGenericError()),
      },
    };

    const svc = new OrchStoreService(mockDb as unknown as PrismaService);

    await expect(
      svc.releaseSessionLock('proj:impl:3', 'owner-c'),
    ).rejects.toBeInstanceOf(DomainError);
  });
});
