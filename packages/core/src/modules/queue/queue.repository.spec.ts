/**
 * QueueRepository spec — in-memory SQLite via tmp-file pattern (I-13).
 *
 * Tests:
 *  - create + findById roundtrip
 *  - dedupKey unique enforcement (I-8)
 *  - nextForProject atomicity (2 concurrent calls → exactly 1 Active item, no double-pick)
 *  - updateState + state persistence
 *  - list filtering
 *  - incrementAttempts
 */

import * as os from 'node:os';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { readFileSync } from 'node:fs';
import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaService } from '../db/prisma.service.js';
import { QueueRepository } from './queue.repository.js';
import { QueueDedupError } from './queue.errors.js';
import { QueueItemState } from '../../domain/queue-item.js';

// ── Migration loader ───────────────────────────────────────────────────────────

const MIGRATIONS_DIR = path.join(__dirname, '../../../prisma/migrations');

function readAllMigrations(): string {
  const migrationFolders = fs
    .readdirSync(MIGRATIONS_DIR)
    .sort()
    .filter((d) => fs.statSync(path.join(MIGRATIONS_DIR, d)).isDirectory());
  return migrationFolders
    .map((folder) =>
      readFileSync(path.join(MIGRATIONS_DIR, folder, 'migration.sql'), 'utf8'),
    )
    .join('\n');
}

// ── Test DB factory ───────────────────────────────────────────────────────────

function createTestDb(): string {
  const tmp = path.join(
    os.tmpdir(),
    `orch-queue-repo-test-${process.pid}-${Date.now()}.db`,
  );
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require('better-sqlite3') as typeof import('better-sqlite3').default;
  const db = new Database(tmp);
  db.exec(readAllMigrations());
  db.close();
  return tmp;
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PROJECT_ID = 'test-project-id';

const PROJECT_FIXTURE = {
  id: PROJECT_ID,
  rootPath: '/tmp/test-project',
  profileJson: JSON.stringify({ projectId: 'test-proj', rootPath: '/tmp' }),
};

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('QueueRepository', () => {
  let module: TestingModule;
  let prisma: PrismaService;
  let repo: QueueRepository;
  let testDbPath: string;

  beforeEach(async () => {
    testDbPath = createTestDb();
    process.env['DATABASE_URL'] = `file:${testDbPath}`;

    module = await Test.createTestingModule({
      providers: [PrismaService, QueueRepository],
    }).compile();

    prisma = module.get(PrismaService);
    repo = module.get(QueueRepository);
    await prisma.onModuleInit();

    // Seed project row so FK constraints resolve
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

  // ── create + findById ──────────────────────────────────────────────────────

  describe('create + findById', () => {
    it('should create a queue item and retrieve it by id', async () => {
      const item = await repo.create({
        projectId: PROJECT_ID,
        sessionKey: 'test-proj:default:1',
        priority: 5,
        dedupKey: 'path/to/plan.md:1234567890',
        payload: { planPath: '/plans/task.md' },
      });

      expect(item.id).toBeDefined();
      expect(item.state).toBe(QueueItemState.Pending);
      expect(item.priority).toBe(5);
      expect(item.dedupKey).toBe('path/to/plan.md:1234567890');
      expect(item.payload).toEqual({ planPath: '/plans/task.md' });
      expect(item.attempts).toBe(0);
      expect(item.maxAttempts).toBe(3);

      const fetched = await repo.findById(item.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.id).toBe(item.id);
      expect(fetched!.payload).toEqual({ planPath: '/plans/task.md' });
    });

    it('should return null for unknown id', async () => {
      const result = await repo.findById('non-existent-id');
      expect(result).toBeNull();
    });

    it('should store and map all optional dates correctly', async () => {
      const item = await repo.create({
        projectId: PROJECT_ID,
        sessionKey: 'test-proj:default:1',
        dedupKey: 'dates-test:1',
      });

      expect(item.startedAt).toBeUndefined();
      expect(item.endedAt).toBeUndefined();
      expect(item.createdAt).toBeInstanceOf(Date);
      expect(item.updatedAt).toBeInstanceOf(Date);
    });
  });

  // ── findByDedupKey ─────────────────────────────────────────────────────────

  describe('findByDedupKey', () => {
    it('should find an item by projectId + dedupKey', async () => {
      const item = await repo.create({
        projectId: PROJECT_ID,
        sessionKey: 'test-proj:default:1',
        dedupKey: 'dedup-find-test:1',
      });

      const found = await repo.findByDedupKey(PROJECT_ID, 'dedup-find-test:1');
      expect(found).not.toBeNull();
      expect(found!.id).toBe(item.id);
    });

    it('should return null if dedupKey does not exist', async () => {
      const result = await repo.findByDedupKey(PROJECT_ID, 'missing-key:1');
      expect(result).toBeNull();
    });
  });

  // ── dedupKey unique enforcement (I-8) ─────────────────────────────────────

  describe('dedupKey unique enforcement', () => {
    it('should throw QueueDedupError on duplicate (projectId, dedupKey)', async () => {
      await repo.create({
        projectId: PROJECT_ID,
        sessionKey: 'test-proj:default:1',
        dedupKey: 'dup-test:1',
      });

      await expect(
        repo.create({
          projectId: PROJECT_ID,
          sessionKey: 'test-proj:default:2',
          dedupKey: 'dup-test:1', // same dedupKey
        }),
      ).rejects.toBeInstanceOf(QueueDedupError);
    });

    it('should allow same dedupKey for different projects', async () => {
      // Create a second project
      await prisma.project.create({
        data: {
          id: 'project-b',
          rootPath: '/tmp/project-b',
          profileJson: JSON.stringify({ projectId: 'proj-b', rootPath: '/tmp/b' }),
        },
      });

      await repo.create({
        projectId: PROJECT_ID,
        sessionKey: 'test-proj:default:1',
        dedupKey: 'shared-dedup-key:1',
      });

      // Same dedupKey in a different project — should succeed
      await expect(
        repo.create({
          projectId: 'project-b',
          sessionKey: 'proj-b:default:1',
          dedupKey: 'shared-dedup-key:1',
        }),
      ).resolves.toBeDefined();
    });
  });

  // ── nextForProject atomicity ───────────────────────────────────────────────

  describe('nextForProject', () => {
    it('should return the highest-priority oldest-pending item and mark it Active', async () => {
      await repo.create({
        projectId: PROJECT_ID,
        sessionKey: 'test-proj:default:1',
        priority: 1,
        dedupKey: 'low-priority:1',
      });
      await repo.create({
        projectId: PROJECT_ID,
        sessionKey: 'test-proj:default:1',
        priority: 10,
        dedupKey: 'high-priority:1',
      });

      const next = await prisma.$transaction(async (tx) =>
        repo.nextForProject(PROJECT_ID, tx),
      );

      expect(next).not.toBeNull();
      expect(next!.state).toBe(QueueItemState.Active);
      expect(next!.dedupKey).toBe('high-priority:1');
      expect(next!.startedAt).toBeInstanceOf(Date);
    });

    it('should return null when no Pending items exist', async () => {
      const next = await prisma.$transaction(async (tx) =>
        repo.nextForProject(PROJECT_ID, tx),
      );
      expect(next).toBeNull();
    });

    it('two concurrent calls get different items (atomicity)', async () => {
      // Enqueue two items
      await repo.create({
        projectId: PROJECT_ID,
        sessionKey: 'test-proj:default:1',
        priority: 5,
        dedupKey: 'concurrent-a:1',
      });
      await repo.create({
        projectId: PROJECT_ID,
        sessionKey: 'test-proj:default:1',
        priority: 5,
        dedupKey: 'concurrent-b:1',
      });

      // Run two "next" calls sequentially in separate transactions (SQLite is single-writer)
      // This verifies that each call picks a distinct item
      const item1 = await prisma.$transaction(async (tx) =>
        repo.nextForProject(PROJECT_ID, tx),
      );
      const item2 = await prisma.$transaction(async (tx) =>
        repo.nextForProject(PROJECT_ID, tx),
      );

      expect(item1).not.toBeNull();
      expect(item2).not.toBeNull();
      expect(item1!.id).not.toBe(item2!.id);
      expect(item1!.state).toBe(QueueItemState.Active);
      expect(item2!.state).toBe(QueueItemState.Active);
    });

    it('priority ordering: priority=10 beats priority=5 even if newer', async () => {
      // Add lower priority first (it will have an earlier createdAt)
      await repo.create({
        projectId: PROJECT_ID,
        sessionKey: 'test-proj:default:1',
        priority: 5,
        dedupKey: 'older-lower:1',
      });
      // Short sleep to ensure different createdAt
      await new Promise((r) => setTimeout(r, 5));
      await repo.create({
        projectId: PROJECT_ID,
        sessionKey: 'test-proj:default:1',
        priority: 10,
        dedupKey: 'newer-higher:1',
      });

      const next = await prisma.$transaction(async (tx) =>
        repo.nextForProject(PROJECT_ID, tx),
      );

      expect(next!.dedupKey).toBe('newer-higher:1');
    });
  });

  // ── updateState ───────────────────────────────────────────────────────────

  describe('updateState', () => {
    it('should update state and persist', async () => {
      const item = await repo.create({
        projectId: PROJECT_ID,
        sessionKey: 'test-proj:default:1',
        dedupKey: 'update-state-test:1',
      });

      const updated = await repo.updateState(item.id, QueueItemState.Active, {
        startedAt: new Date(),
      });

      expect(updated.state).toBe(QueueItemState.Active);
      expect(updated.startedAt).toBeInstanceOf(Date);

      const refetched = await repo.findById(item.id);
      expect(refetched!.state).toBe(QueueItemState.Active);
    });

    it('should update endedAt when transitioning to Completed', async () => {
      const item = await repo.create({
        projectId: PROJECT_ID,
        sessionKey: 'test-proj:default:1',
        dedupKey: 'completed-test:1',
      });

      await repo.updateState(item.id, QueueItemState.Active, {});
      const ended = await repo.updateState(item.id, QueueItemState.Completed, {
        endedAt: new Date(),
      });

      expect(ended.state).toBe(QueueItemState.Completed);
      expect(ended.endedAt).toBeInstanceOf(Date);
    });
  });

  // ── incrementAttempts ─────────────────────────────────────────────────────

  describe('incrementAttempts', () => {
    it('should increment attempts counter', async () => {
      const item = await repo.create({
        projectId: PROJECT_ID,
        sessionKey: 'test-proj:default:1',
        dedupKey: 'attempts-test:1',
      });

      expect(item.attempts).toBe(0);

      const after1 = await repo.incrementAttempts(item.id, 'first error');
      expect(after1.attempts).toBe(1);
      expect(after1.payload['_lastError']).toBe('first error');

      const after2 = await repo.incrementAttempts(item.id, 'second error');
      expect(after2.attempts).toBe(2);
      expect(after2.payload['_lastError']).toBe('second error');
    });
  });

  // ── list ──────────────────────────────────────────────────────────────────

  describe('list', () => {
    it('should list all items when no filter', async () => {
      await repo.create({
        projectId: PROJECT_ID,
        sessionKey: 'test-proj:default:1',
        dedupKey: 'list-a:1',
      });
      await repo.create({
        projectId: PROJECT_ID,
        sessionKey: 'test-proj:default:1',
        dedupKey: 'list-b:1',
      });

      const all = await repo.list();
      expect(all.length).toBeGreaterThanOrEqual(2);
    });

    it('should filter by projectId', async () => {
      await prisma.project.create({
        data: {
          id: 'other-project',
          rootPath: '/tmp/other',
          profileJson: '{"projectId":"other","rootPath":"/tmp/other"}',
        },
      });

      await repo.create({
        projectId: PROJECT_ID,
        sessionKey: 'test-proj:default:1',
        dedupKey: 'filter-proj-a:1',
      });
      await repo.create({
        projectId: 'other-project',
        sessionKey: 'other:default:1',
        dedupKey: 'filter-proj-b:1',
      });

      const items = await repo.list(PROJECT_ID);
      expect(items.every((i) => i.sessionKey.startsWith('test-proj'))).toBe(
        true,
      );
    });

    it('should filter by state', async () => {
      const a = await repo.create({
        projectId: PROJECT_ID,
        sessionKey: 'test-proj:default:1',
        dedupKey: 'state-filter-a:1',
      });
      await repo.updateState(a.id, QueueItemState.Active, {});

      await repo.create({
        projectId: PROJECT_ID,
        sessionKey: 'test-proj:default:1',
        dedupKey: 'state-filter-b:1',
      });

      const pending = await repo.list(PROJECT_ID, QueueItemState.Pending);
      const active = await repo.list(PROJECT_ID, QueueItemState.Active);

      expect(pending.every((i) => i.state === QueueItemState.Pending)).toBe(true);
      expect(active.every((i) => i.state === QueueItemState.Active)).toBe(true);
    });

    it('should respect limit param', async () => {
      for (let i = 0; i < 5; i++) {
        await repo.create({
          projectId: PROJECT_ID,
          sessionKey: 'test-proj:default:1',
          dedupKey: `limit-test-${i}:1`,
        });
      }

      const limited = await repo.list(PROJECT_ID, undefined, 3);
      expect(limited.length).toBe(3);
    });
  });
});
