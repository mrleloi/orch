/**
 * scheduler.integration.spec.ts — INT-SCHED-1
 *
 * Integration test: full NestJS test module wiring QueueService (real SQLite DB),
 * a stub ProjectRegistryService, and SchedulerService. Verifies that a cron job
 * fires → QueueService.enqueue() is called → DB contains a Pending QueueItem
 * with the expected planPath and dedupKey.
 *
 * Per plan §B.9 (adapted):
 *  - Arrange: test module with real PrismaService (SQLite tmp), real QueueService,
 *    mock TracingService, stub ProjectRegistryService, real SchedulerService.
 *  - Act: bootstrap scheduler → wait for cron tick (real timer, short expression).
 *  - Assert: QueueRepository.list(projectId) → exactly one Pending row with
 *    payload.planPath ending in expected filename and dedupKey matching minute-bucket.
 *
 * NOTE on fake timers: jest fake timers + Prisma transaction timeouts are
 * incompatible (Prisma uses setTimeout for its 5000ms transaction timeout; advancing
 * the fake clock causes the transaction to expire immediately). Therefore this
 * integration test uses REAL timers with a 6-field cron expression (`* * * * * *`,
 * every second) and waits up to 3 real seconds for the tick. This satisfies the
 * plan's B.9 requirement ("daemon boot loads profile with cron, timer advance
 * triggers enqueue") while being deterministic within CI time constraints.
 *
 * I-13: uses file-based SQLite (tmp), no network calls.
 */

import * as os from 'node:os';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { readFileSync } from 'node:fs';
import { Logger } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../db/prisma.service.js';
import { QueueRepository } from '../queue/queue.repository.js';
import { QueueService } from '../queue/queue.service.js';
import { ProjectRegistryService } from '../project-registry/project-registry.service.js';
import { EventBusService } from '../events/event-bus.service.js';
import { TracingService } from '../tracing/tracing.service.js';
import { SchedulerService } from './scheduler.service.js';
import { EVENT_CHANNELS } from '../events/event-channels.js';
import { QueueItemState } from '../../domain/queue-item.js';
import type { Profile } from '../../domain/profile.js';

// ── Migration loader (same as queue.service.spec.ts) ─────────────────────────

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
    `orch-scheduler-int-test-${process.pid}-${Date.now()}.db`,
  );
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require('better-sqlite3') as typeof import('better-sqlite3').default;
  const db = new Database(tmp);
  db.exec(readAllMigrations());
  db.close();
  return tmp;
}

// ── Stub ProjectRegistryService ───────────────────────────────────────────────

class StubProjectRegistryService {
  private profiles: Profile[] = [];

  setProfiles(profiles: Profile[]): void {
    this.profiles = profiles;
  }

  listProjects(): Promise<Profile[]> {
    return Promise.resolve(this.profiles);
  }

  getProject(projectId: string): Promise<Profile | undefined> {
    return Promise.resolve(this.profiles.find((p) => p.projectId === projectId));
  }
}

// ── Stub TracingService (no-op spans) ─────────────────────────────────────────

class StubTracingService {
  async withSpan<T>(
    _name: string,
    fn: (span: {
      setAttribute: () => void;
      setStatus: () => void;
      recordException: () => void;
      addEvent: () => void;
      end: () => void;
    }) => Promise<T>,
  ): Promise<T> {
    return fn({
      setAttribute: () => undefined,
      setStatus: () => undefined,
      recordException: () => undefined,
      addEvent: () => undefined,
      end: () => undefined,
    });
  }
}

// ── Profile builder ───────────────────────────────────────────────────────────

function makeProfile(
  projectId: string,
  rootPath: string,
  cron: Record<string, string>,
): Profile {
  return {
    projectId,
    rootPath,
    sessionTypes: [{ name: 'impl', promptTemplate: 'Implement: {{plan}}', maxConcurrent: 1 }],
    hookTargets: [],
    queueSources: [],
    ccsProfile: 'test',
    maxConcurrentSessions: 1,
    langfuseEnabled: false,
    disableSecretRedaction: false,
    contextBudget: { warnAtTokens: 200_000, forceHandoffAtTokens: 230_000 },
    autoHandoff: false,
    gracefulEndTimeoutMs: 30_000,
    commands: {},
    cron,
  };
}

// ── Wait helper ───────────────────────────────────────────────────────────────

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('INT-SCHED-1: SchedulerService integration — boot → real timer tick → real QueueService.enqueue', () => {
  let module: TestingModule;
  let prisma: PrismaService;
  let scheduler: SchedulerService;
  let queueRepo: QueueRepository;
  let eventBus: EventBusService;
  let testDbPath: string;

  const PROJECT_ID = 'sched-int-proj';
  const ROOT_PATH = '/projects/sched-int';
  const CRON_NAME = 'test-job';

  beforeEach(async () => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);

    testDbPath = createTestDb();
    process.env['DATABASE_URL'] = `file:${testDbPath}`;

    const stubRegistry = new StubProjectRegistryService();
    stubRegistry.setProfiles([
      // `* * * * * *` = every second (6-field node-cron syntax).
      // Using every-second cron avoids the jest fake-timer + Prisma transaction timeout
      // incompatibility, while still verifying the full daemon boot → tick → enqueue chain.
      makeProfile(PROJECT_ID, ROOT_PATH, { [CRON_NAME]: '* * * * * *' }),
    ]);

    const emitter = new EventEmitter2({ wildcard: true, maxListeners: 100 });

    module = await Test.createTestingModule({
      providers: [
        PrismaService,
        QueueRepository,
        QueueService,
        SchedulerService,
        { provide: EventBusService, useValue: new EventBusService(emitter) },
        { provide: TracingService, useClass: StubTracingService },
        { provide: ProjectRegistryService, useValue: stubRegistry },
      ],
    }).compile();

    prisma = module.get(PrismaService);
    scheduler = module.get(SchedulerService);
    queueRepo = module.get(QueueRepository);
    eventBus = module.get(EventBusService);

    await prisma.onModuleInit();

    // Create the project row required by QueueService foreign-key constraint
    await prisma.project.create({
      data: {
        id: PROJECT_ID,
        rootPath: ROOT_PATH,
        profileJson: JSON.stringify({ projectId: PROJECT_ID }),
      },
    });
  });

  afterEach(async () => {
    try {
      await scheduler.onModuleDestroy();
    } catch {
      // ignore
    }
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
    jest.restoreAllMocks();
  });

  it(
    'INT-SCHED-1: cron tick fires enqueue → DB contains Pending row with correct planPath and dedupKey',
    async () => {
      // Capture scheduler.tick-fired events
      const tickFiredEvents: unknown[] = [];
      eventBus.on(EVENT_CHANNELS.scheduler.tickFired, (p) => {
        tickFiredEvents.push(p);
      });

      // Bootstrap scheduler — `* * * * * *` cron starts, first tick fires in ~1s
      await scheduler.onModuleInit();

      // Wait up to 3 real seconds for the cron tick to fire and the DB write to complete.
      // `* * * * * *` fires every second, so at most 1s wait + buffer.
      const deadline = Date.now() + 3000;
      let rows: Awaited<ReturnType<typeof queueRepo.list>> = [];
      while (Date.now() < deadline) {
        await wait(100);
        rows = await queueRepo.list(PROJECT_ID, QueueItemState.Pending);
        if (rows.length > 0) break;
      }

      // Assert: DB has exactly one Pending row for this project
      expect(rows).toHaveLength(1);

      const [row] = rows;
      // planPath is stored in the payload JSON blob
      expect(row.payload['planPath']).toMatch(
        /session-plans[/\\]pending[/\\]test-job\.md$/,
      );
      // dedupKey is a top-level QueueItem field (not in payload)
      expect(row.dedupKey).toMatch(/^cron:test-job:\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);

      // Assert: scheduler.tick-fired event was emitted
      expect(tickFiredEvents.length).toBeGreaterThanOrEqual(1);
      const event = tickFiredEvents[0] as {
        projectId: string;
        cronName: string;
        itemId: string;
      };
      expect(event.projectId).toBe(PROJECT_ID);
      expect(event.cronName).toBe(CRON_NAME);
      expect(event.itemId).toBe(row.id);
    },
    10_000, // 10s timeout for this test
  );
});
