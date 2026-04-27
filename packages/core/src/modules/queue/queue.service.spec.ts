/**
 * QueueService spec — uses tmp-file SQLite for real DB behaviour (I-13).
 *
 * Tests:
 *  - enqueue happy path → event emitted → DB row exists
 *  - enqueue idempotent: same dedupKey twice → same row, one event
 *  - enqueue 10 parallel → exactly 10 rows
 *  - next() atomicity: 2 calls → exactly 1 Active item, other returns null
 *  - priority ordering
 *  - complete / fail / pause / resume state transitions
 *  - fail retry: 1st/2nd fail → Pending; 3rd fail → Quarantined
 *  - invalid transition throws
 */

import * as os from 'node:os';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { readFileSync } from 'node:fs';
import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaService } from '../db/prisma.service.js';
import { QueueRepository } from './queue.repository.js';
import { QueueService } from './queue.service.js';
import { QueueStateTransitionError } from './queue.errors.js';
import { QueueItemState } from '../../domain/queue-item.js';
import { EventBusService } from '../events/event-bus.service.js';
import { EVENT_CHANNELS } from '../events/event-channels.js';
import { TracingService } from '../tracing/tracing.service.js';

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

function createTestDb(): string {
  const tmp = path.join(
    os.tmpdir(),
    `orch-queue-svc-test-${process.pid}-${Date.now()}.db`,
  );
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require('better-sqlite3') as typeof import('better-sqlite3').default;
  const db = new Database(tmp);
  db.exec(readAllMigrations());
  db.close();
  return tmp;
}

// ── Mock event bus ─────────────────────────────────────────────────────────────

class MockEventBusService {
  emit = jest.fn();
  on = jest.fn().mockReturnValue(() => {});
  once = jest.fn().mockResolvedValue({});
}

// ── Mock tracing (pass-through) ────────────────────────────────────────────────

class MockTracingService {
  async withSpan<T>(
    _name: string,
    fn: (span: { setAttribute: jest.Mock }) => Promise<T>,
  ): Promise<T> {
    return fn({ setAttribute: jest.fn() });
  }
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PROJECT_ID = 'svc-test-project-id';

const PROJECT_FIXTURE = {
  id: PROJECT_ID,
  rootPath: '/tmp/svc-test-project',
  profileJson: JSON.stringify({ projectId: 'svc-test', rootPath: '/tmp' }),
};

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('QueueService', () => {
  let module: TestingModule;
  let prisma: PrismaService;
  let service: QueueService;
  let eventBus: MockEventBusService;
  let testDbPath: string;

  beforeEach(async () => {
    testDbPath = createTestDb();
    process.env['DATABASE_URL'] = `file:${testDbPath}`;

    eventBus = new MockEventBusService();

    module = await Test.createTestingModule({
      providers: [
        PrismaService,
        QueueRepository,
        { provide: EventBusService, useValue: eventBus },
        { provide: TracingService, useClass: MockTracingService },
        QueueService,
      ],
    }).compile();

    prisma = module.get(PrismaService);
    service = module.get(QueueService);
    await prisma.onModuleInit();

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
      // ignore
    }
    delete process.env['DATABASE_URL'];
  });

  // ── Helpers ────────────────────────────────────────────────────────────────

  function makeEnqueueInput(overrides: { dedupKey?: string; priority?: number } = {}) {
    return {
      projectId: PROJECT_ID,
      planPath: '/tmp/plans/test.md',
      dedupKey: overrides.dedupKey ?? `dedup-key-${Date.now()}-${Math.random()}`,
      mtime: Date.now(),
      priority: overrides.priority,
    };
  }

  // ── Enqueue happy path ─────────────────────────────────────────────────────

  describe('enqueue', () => {
    it('should create a queue item and emit queue.enqueued', async () => {
      const item = await service.enqueue(makeEnqueueInput({ dedupKey: 'happy-path:1' }));

      expect(item.id).toBeDefined();
      expect(item.state).toBe(QueueItemState.Pending);
      expect(item.payload['planPath']).toBe('/tmp/plans/test.md');

      expect(eventBus.emit).toHaveBeenCalledWith(
        EVENT_CHANNELS.queue.enqueued,
        expect.objectContaining({ item: expect.objectContaining({ id: item.id }) }),
      );

      // Verify DB row exists
      const dbRow = await prisma.queueItem.findUnique({ where: { id: item.id } });
      expect(dbRow).not.toBeNull();
    });

    it('should be idempotent: same dedupKey returns existing item, one event emission', async () => {
      const input = makeEnqueueInput({ dedupKey: 'idempotent-test:1' });

      const first = await service.enqueue(input);
      eventBus.emit.mockClear();

      const second = await service.enqueue(input);

      expect(second.id).toBe(first.id);
      // No new event emitted on second call (dedup hit)
      expect(eventBus.emit).not.toHaveBeenCalledWith(
        EVENT_CHANNELS.queue.enqueued,
        expect.anything(),
      );
    });

    it('should enqueue 10 items in parallel with different dedupKeys → exactly 10 rows', async () => {
      const inputs = Array.from({ length: 10 }, (_, i) =>
        makeEnqueueInput({ dedupKey: `parallel-test-${i}:1` }),
      );

      const results = await Promise.all(inputs.map((i) => service.enqueue(i)));

      const ids = new Set(results.map((r) => r.id));
      expect(ids.size).toBe(10);

      const rows = await prisma.queueItem.findMany({
        where: { projectId: PROJECT_ID },
      });
      expect(rows.length).toBe(10);
    });

    it('should use default priority 5 when not specified', async () => {
      const item = await service.enqueue(makeEnqueueInput({ dedupKey: 'default-prio:1' }));
      expect(item.priority).toBe(5);
    });

    it('should use specified priority', async () => {
      const item = await service.enqueue(makeEnqueueInput({ dedupKey: 'custom-prio:1', priority: 8 }));
      expect(item.priority).toBe(8);
    });
  });

  // ── next() atomicity ───────────────────────────────────────────────────────

  describe('next', () => {
    it('should return null when no Pending items', async () => {
      const result = await service.next(PROJECT_ID);
      expect(result).toBeNull();
    });

    it('should return and activate the next Pending item, emitting queue.started', async () => {
      await service.enqueue(makeEnqueueInput({ dedupKey: 'next-test:1' }));

      const item = await service.next(PROJECT_ID);

      expect(item).not.toBeNull();
      expect(item!.state).toBe(QueueItemState.Active);
      expect(eventBus.emit).toHaveBeenCalledWith(
        EVENT_CHANNELS.queue.started,
        expect.objectContaining({ item: expect.objectContaining({ id: item!.id }) }),
      );
    });

    it('atomicity: two sequential next() calls get different items', async () => {
      await service.enqueue(makeEnqueueInput({ dedupKey: 'atomic-a:1', priority: 5 }));
      await service.enqueue(makeEnqueueInput({ dedupKey: 'atomic-b:1', priority: 5 }));

      const item1 = await service.next(PROJECT_ID);
      const item2 = await service.next(PROJECT_ID);

      expect(item1).not.toBeNull();
      expect(item2).not.toBeNull();
      expect(item1!.id).not.toBe(item2!.id);
    });

    it('next() returns null when only Active items remain', async () => {
      await service.enqueue(makeEnqueueInput({ dedupKey: 'one-item:1' }));
      await service.next(PROJECT_ID); // activates the item

      const second = await service.next(PROJECT_ID);
      expect(second).toBeNull();
    });

    it('priority ordering: priority=10 beats priority=5', async () => {
      await service.enqueue(makeEnqueueInput({ dedupKey: 'low:1', priority: 5 }));
      await service.enqueue(makeEnqueueInput({ dedupKey: 'high:1', priority: 10 }));

      const item = await service.next(PROJECT_ID);
      expect(item!.dedupKey).toBe('high:1');
    });
  });

  // ── complete ──────────────────────────────────────────────────────────────

  describe('complete', () => {
    it('should transition Active → Completed and emit queue.completed', async () => {
      await service.enqueue(makeEnqueueInput({ dedupKey: 'complete-test:1' }));
      const active = await service.next(PROJECT_ID);

      const completed = await service.complete(active!.id);

      expect(completed.state).toBe(QueueItemState.Completed);
      expect(completed.endedAt).toBeInstanceOf(Date);
      expect(eventBus.emit).toHaveBeenCalledWith(
        EVENT_CHANNELS.queue.completed,
        expect.objectContaining({ item: expect.objectContaining({ id: active!.id }) }),
      );
    });

    it('should throw on invalid transition (Pending → Completed)', async () => {
      const item = await service.enqueue(makeEnqueueInput({ dedupKey: 'invalid-complete:1' }));

      await expect(service.complete(item.id)).rejects.toBeInstanceOf(
        QueueStateTransitionError,
      );
    });
  });

  // ── fail & retry ──────────────────────────────────────────────────────────

  describe('fail', () => {
    it('1st fail → state back to Pending, attempts=1, emit queue.failed', async () => {
      await service.enqueue(makeEnqueueInput({ dedupKey: 'fail-retry:1' }));
      const active = await service.next(PROJECT_ID);

      const failed = await service.fail(active!.id, 'first failure');

      expect(failed.state).toBe(QueueItemState.Pending);
      expect(failed.attempts).toBe(1);
      expect(eventBus.emit).toHaveBeenCalledWith(
        EVENT_CHANNELS.queue.failed,
        expect.objectContaining({ item: expect.objectContaining({ id: active!.id }) }),
      );
    });

    it('2nd fail → still Pending, attempts=2', async () => {
      await service.enqueue(makeEnqueueInput({ dedupKey: 'fail-2nd:1' }));
      const active1 = await service.next(PROJECT_ID);
      await service.fail(active1!.id, 'first');

      // Re-activate (Pending → Active again)
      const active2 = await service.next(PROJECT_ID);
      const failed2 = await service.fail(active2!.id, 'second');

      expect(failed2.state).toBe(QueueItemState.Pending);
      expect(failed2.attempts).toBe(2);
    });

    it('3rd fail → Quarantined, emit queue.quarantined', async () => {
      // maxAttempts default = 3
      await service.enqueue(makeEnqueueInput({ dedupKey: 'quarantine-test:1' }));

      // Fail 3 times
      for (let i = 0; i < 2; i++) {
        const active = await service.next(PROJECT_ID);
        await service.fail(active!.id, `failure ${i + 1}`);
      }
      const active3 = await service.next(PROJECT_ID);

      eventBus.emit.mockClear();
      const quarantined = await service.fail(active3!.id, 'third failure');

      expect(quarantined.state).toBe(QueueItemState.Quarantined);
      expect(quarantined.attempts).toBe(3);
      expect(eventBus.emit).toHaveBeenCalledWith(
        EVENT_CHANNELS.queue.quarantined,
        expect.objectContaining({
          item: expect.objectContaining({ state: QueueItemState.Quarantined }),
        }),
      );
    });

    it('should throw on invalid transition (Pending → Failed)', async () => {
      const item = await service.enqueue(makeEnqueueInput({ dedupKey: 'invalid-fail:1' }));

      await expect(service.fail(item.id, 'bad call')).rejects.toBeInstanceOf(
        QueueStateTransitionError,
      );
    });
  });

  // ── pause & resume ────────────────────────────────────────────────────────

  describe('pause + resume', () => {
    it('should pause all Pending items and emit queue.paused for each', async () => {
      await service.enqueue(makeEnqueueInput({ dedupKey: 'pause-a:1' }));
      await service.enqueue(makeEnqueueInput({ dedupKey: 'pause-b:1' }));

      eventBus.emit.mockClear();
      await service.pause(PROJECT_ID);

      const pausedItems = await prisma.queueItem.findMany({
        where: { projectId: PROJECT_ID, state: QueueItemState.Paused },
      });
      expect(pausedItems.length).toBe(2);

      const pausedEmits = (eventBus.emit as jest.Mock).mock.calls.filter(
        ([channel]) => channel === EVENT_CHANNELS.queue.paused,
      );
      expect(pausedEmits.length).toBe(2);
    });

    it('should resume all Paused items and emit queue.resumed for each', async () => {
      await service.enqueue(makeEnqueueInput({ dedupKey: 'resume-a:1' }));
      await service.enqueue(makeEnqueueInput({ dedupKey: 'resume-b:1' }));
      await service.pause(PROJECT_ID);

      eventBus.emit.mockClear();
      await service.resume(PROJECT_ID);

      const pendingItems = await prisma.queueItem.findMany({
        where: { projectId: PROJECT_ID, state: QueueItemState.Pending },
      });
      expect(pendingItems.length).toBe(2);

      const resumedEmits = (eventBus.emit as jest.Mock).mock.calls.filter(
        ([channel]) => channel === EVENT_CHANNELS.queue.resumed,
      );
      expect(resumedEmits.length).toBe(2);
    });

    it('pause should not affect Active items', async () => {
      await service.enqueue(makeEnqueueInput({ dedupKey: 'pause-active:1' }));
      const active = await service.next(PROJECT_ID);
      expect(active).not.toBeNull();

      await service.pause(PROJECT_ID); // no Pending items to pause

      const row = await prisma.queueItem.findUnique({
        where: { id: active!.id },
      });
      expect(row!.state).toBe(QueueItemState.Active);
    });
  });
});
