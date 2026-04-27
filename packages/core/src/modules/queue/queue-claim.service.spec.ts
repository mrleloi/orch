/**
 * QueueClaimService spec — uses tmp-file SQLite for real DB behaviour.
 *
 * Tests (6 required by SC-7 + architect §4.3):
 *  1. Happy path: free item → claim → { won: true }; row's claimedBy = workerId
 *  2. Already-claimed (live): item held by another worker with future expiry → { won: false }
 *  3. Already-claimed (expired): claim expired → { won: true } (on-claim sweep Q4)
 *  4. Concurrent contention: 4 parallel claim() calls → exactly 1 wins, 3 lose, no exception
 *  5. Non-existent item: claim('w', 'nonexistent-id') → { won: false }; no error thrown
 *  6. DomainError wrap: stub Prisma to throw → service throws DomainError('STORE_ERROR')
 */

import * as os from 'node:os';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { readFileSync } from 'node:fs';
import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaService } from '../db/prisma.service.js';
import { TracingService } from '../tracing/tracing.service.js';
import { DomainError } from '../../domain/errors.js';
import { QueueClaimService } from './queue-claim.service.js';

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
    `orch-queue-claim-test-${process.pid}-${Date.now()}.db`,
  );
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require('better-sqlite3') as typeof import('better-sqlite3').default;
  const db = new Database(tmp);
  db.exec(readAllMigrations());
  db.close();
  return tmp;
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

const PROJECT_ID = 'claim-test-project-id';

const PROJECT_FIXTURE = {
  id: PROJECT_ID,
  rootPath: '/tmp/claim-test-project',
  profileJson: JSON.stringify({ projectId: 'claim-test', rootPath: '/tmp' }),
};

/** Insert a free QueueItem and return its id. */
async function seedPendingItem(prisma: PrismaService): Promise<string> {
  const item = await prisma.queueItem.create({
    data: {
      projectId: PROJECT_ID,
      sessionKey: `${PROJECT_ID}:default:1`,
      state: 'Pending',
      priority: 5,
      dedupKey: `dedup-${Date.now()}-${Math.random()}`,
      payloadJson: '{}',
      maxAttempts: 3,
    },
  });
  return item.id;
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('QueueClaimService', () => {
  let module: TestingModule;
  let prisma: PrismaService;
  let claimService: QueueClaimService;
  let testDbPath: string;

  beforeEach(async () => {
    testDbPath = createTestDb();
    process.env['DATABASE_URL'] = `file:${testDbPath}`;

    module = await Test.createTestingModule({
      providers: [
        PrismaService,
        { provide: TracingService, useClass: MockTracingService },
        QueueClaimService,
      ],
    }).compile();

    prisma = module.get(PrismaService);
    claimService = module.get(QueueClaimService);
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
      // ignore cleanup errors
    }
    delete process.env['DATABASE_URL'];
  });

  // ── Case 1: Happy path ──────────────────────────────────────────────────────

  it('case 1 — happy path: free item → won:true; row claimedBy=workerId', async () => {
    const itemId = await seedPendingItem(prisma);
    const workerId = 'worker-happy';

    const result = await claimService.claim(workerId, itemId);

    expect(result.won).toBe(true);
    expect(result.itemId).toBe(itemId);
    expect(result.workerId).toBe(workerId);
    expect(result.expiresAt).toBeInstanceOf(Date);
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());

    const row = await prisma.queueItem.findUnique({ where: { id: itemId } });
    expect(row?.claimedBy).toBe(workerId);
    expect(row?.claimExpiresAt).toBeInstanceOf(Date);
  });

  // ── Case 2: Already-claimed (live) ─────────────────────────────────────────

  it('case 2 — already-claimed (live): another worker holds unexpired claim → won:false; row unchanged', async () => {
    const itemId = await seedPendingItem(prisma);
    const firstWorker = 'worker-first';
    const secondWorker = 'worker-second';

    // First worker claims successfully
    const first = await claimService.claim(firstWorker, itemId);
    expect(first.won).toBe(true);

    // Second worker tries to claim — should lose because expiry is in the future
    const second = await claimService.claim(secondWorker, itemId);
    expect(second.won).toBe(false);

    // Row should still be held by the first worker
    const row = await prisma.queueItem.findUnique({ where: { id: itemId } });
    expect(row?.claimedBy).toBe(firstWorker);
  });

  // ── Case 3: Already-claimed (expired) — on-claim sweep (Q4) ───────────────

  it('case 3 — expired claim: claimExpiresAt < now → on-claim sweep → won:true', async () => {
    const itemId = await seedPendingItem(prisma);
    const expiredWorker = 'worker-expired';
    const newWorker = 'worker-new';

    // Directly write an expired claim into the DB (bypassing service TTL)
    const pastExpiry = new Date(Date.now() - 1000); // 1 second in the past
    await prisma.queueItem.update({
      where: { id: itemId },
      data: { claimedBy: expiredWorker, claimExpiresAt: pastExpiry },
    });

    // New worker should win via the OR clause (on-claim sweep)
    const result = await claimService.claim(newWorker, itemId);
    expect(result.won).toBe(true);

    const row = await prisma.queueItem.findUnique({ where: { id: itemId } });
    expect(row?.claimedBy).toBe(newWorker);
    expect(row?.claimExpiresAt!.getTime()).toBeGreaterThan(Date.now());
  });

  // ── Case 4: Concurrent contention (SC-7) ───────────────────────────────────

  it('case 4 — 4-concurrent contention (SC-7): exactly 1 wins, 3 lose, no exception', async () => {
    const itemId = await seedPendingItem(prisma);
    const workers = ['w1', 'w2', 'w3', 'w4'];

    const results = await Promise.all(
      workers.map((w) => claimService.claim(w, itemId)),
    );

    const wins = results.filter((r) => r.won).length;
    const losses = results.filter((r) => !r.won).length;

    expect(wins).toBe(1);
    expect(losses).toBe(3);

    // The winner's worker id must be set on the row
    const row = await prisma.queueItem.findUnique({ where: { id: itemId } });
    expect(row?.claimedBy).not.toBeNull();
    expect(row?.claimedBy).toBeDefined();
    // claimedBy must be one of the contending workers
    const winnerResult = results.find((r) => r.won);
    expect(row?.claimedBy).toBe(winnerResult?.workerId);
    expect(row?.claimExpiresAt).toBeInstanceOf(Date);
  });

  // ── Case 5: Non-existent item ───────────────────────────────────────────────

  it('case 5 — non-existent item: claim returns won:false, no error thrown', async () => {
    const result = await claimService.claim('worker-x', 'nonexistent-id-abc123');

    expect(result.won).toBe(false);
    expect(result.itemId).toBe('nonexistent-id-abc123');
    expect(result.workerId).toBe('worker-x');
  });

  // ── Case 6: DomainError wrap ────────────────────────────────────────────────

  it('case 6 — DomainError wrap: Prisma error → DomainError(STORE_ERROR)', async () => {
    // Stub $executeRaw to throw a raw DB error on every call
    const dbError = new Error('SQLITE_CORRUPT: database disk image is malformed');
    jest.spyOn(prisma, '$executeRaw').mockRejectedValue(dbError);

    let caught: unknown;
    try {
      await claimService.claim('worker-z', 'some-item-id');
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(DomainError);
    expect((caught as DomainError).code).toBe('STORE_ERROR');
  });
});
