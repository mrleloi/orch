/**
 * MailboxService spec — uses tmp-file SQLite with real DB migrations.
 *
 * 8 cases (architect §9.3.D):
 *  1. send persists a row with read=false
 *  2. pollUnread returns rows in createdAt ASC order (FIFO)
 *  3. pollUnread(limit=2) honors limit
 *  4. pollUnread(markRead=true) flips read=true in same call
 *  5. markRead updates only the supplied IDs
 *  6. markRead([]) is a no-op (returns 0)
 *  7. send is idempotent at SQL level (two identical sends → 2 distinct rows)
 *  8. archiveBefore deletes only rows older than the cutoff
 */

import * as os from 'node:os';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { readFileSync } from 'node:fs';
import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../db/prisma.service.js';
import { MailboxRepository } from './mailbox.repository.js';
import { MailboxService } from './mailbox.service.js';

// ── Migration loader ───────────────────────────────────────────────────────────

const MIGRATIONS_DIR = path.join(__dirname, '../../../../prisma/migrations');

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
    `orch-mailbox-svc-test-${process.pid}-${Date.now()}.db`,
  );
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require('better-sqlite3') as typeof import('better-sqlite3').default;
  const db = new Database(tmp);
  db.exec(readAllMigrations());
  db.close();
  return tmp;
}

// ── Suite ─────────────────────────────────────────────────────────────────────

const WORKER_A = 'worker-a';
const WORKER_B = 'worker-b';

describe('MailboxService', () => {
  let testingModule: TestingModule;
  let service: MailboxService;
  let prisma: PrismaService;
  let dbPath: string;

  beforeEach(async () => {
    dbPath = createTestDb();
    process.env['DATABASE_URL'] = `file:${dbPath}`;

    testingModule = await Test.createTestingModule({
      providers: [PrismaService, MailboxRepository, MailboxService],
    }).compile();

    prisma = testingModule.get(PrismaService);
    service = testingModule.get(MailboxService);
    await prisma.onModuleInit();
  });

  afterEach(async () => {
    await prisma.onModuleDestroy();
    await testingModule.close();
    try {
      fs.unlinkSync(dbPath);
      fs.unlinkSync(`${dbPath}-wal`);
      fs.unlinkSync(`${dbPath}-shm`);
    } catch {
      // ignore cleanup errors
    }
    delete process.env['DATABASE_URL'];
  });

  // ── Helpers ────────────────────────────────────────────────────────────────

  async function sendMsg(
    to: string = WORKER_A,
    from: string = WORKER_B,
    message: string = 'hello',
  ) {
    return service.send({ to, from, message });
  }

  // ── Cases ──────────────────────────────────────────────────────────────────

  // Case 1: send persists a row with read=false
  it('send persists a row with read=false', async () => {
    const { id } = await sendMsg();

    expect(id).toBeDefined();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);

    const row = await prisma.workerMailbox.findUnique({ where: { id } });
    expect(row).not.toBeNull();
    expect(row!.read).toBe(false);
    expect(row!.toWorker).toBe(WORKER_A);
    expect(row!.fromWorker).toBe(WORKER_B);
    expect(row!.message).toBe('hello');
  });

  // Case 2: pollUnread returns rows in createdAt ASC order (FIFO)
  it('pollUnread returns rows in createdAt ASC order (FIFO)', async () => {
    await sendMsg(WORKER_A, WORKER_B, 'first');
    await sendMsg(WORKER_A, WORKER_B, 'second');
    await sendMsg(WORKER_A, WORKER_B, 'third');

    const messages = await service.pollUnread(WORKER_A);

    expect(messages).toHaveLength(3);
    expect(messages[0].message).toBe('first');
    expect(messages[1].message).toBe('second');
    expect(messages[2].message).toBe('third');

    // Verify ASC ordering by createdAt
    for (let i = 1; i < messages.length; i++) {
      expect(messages[i].createdAt.getTime()).toBeGreaterThanOrEqual(
        messages[i - 1].createdAt.getTime(),
      );
    }
  });

  // Case 3: pollUnread(limit=2) honors limit
  it('pollUnread(limit=2) honors limit', async () => {
    await sendMsg(WORKER_A, WORKER_B, 'msg-1');
    await sendMsg(WORKER_A, WORKER_B, 'msg-2');
    await sendMsg(WORKER_A, WORKER_B, 'msg-3');

    const messages = await service.pollUnread(WORKER_A, { limit: 2 });

    expect(messages).toHaveLength(2);
  });

  // Case 4: pollUnread(markRead=true) flips read=true in same call
  it('pollUnread(markRead=true) flips read=true in same call', async () => {
    await sendMsg(WORKER_A, WORKER_B, 'mark-me');
    await sendMsg(WORKER_A, WORKER_B, 'mark-me-too');

    const messages = await service.pollUnread(WORKER_A, { markRead: true });

    expect(messages).toHaveLength(2);
    for (const msg of messages) {
      expect(msg.read).toBe(true);
    }

    // DB state: both rows should have read=true
    const allRows = await prisma.workerMailbox.findMany({
      where: { toWorker: WORKER_A },
    });
    for (const row of allRows) {
      expect(row.read).toBe(true);
    }

    // Subsequent pollUnread should return 0 messages (already read)
    const afterPoll = await service.pollUnread(WORKER_A);
    expect(afterPoll).toHaveLength(0);
  });

  // Case 5: markRead updates only the supplied IDs
  it('markRead updates only the supplied IDs', async () => {
    const { id: id1 } = await sendMsg(WORKER_A, WORKER_B, 'target');
    const { id: id2 } = await sendMsg(WORKER_A, WORKER_B, 'untouched');

    const result = await service.markRead([id1]);

    expect(result.updated).toBe(1);

    const row1 = await prisma.workerMailbox.findUnique({ where: { id: id1 } });
    const row2 = await prisma.workerMailbox.findUnique({ where: { id: id2 } });

    expect(row1!.read).toBe(true);
    expect(row2!.read).toBe(false);
  });

  // Case 6: markRead([]) is a no-op (returns 0)
  it('markRead([]) is a no-op (returns 0)', async () => {
    await sendMsg();

    const result = await service.markRead([]);

    expect(result.updated).toBe(0);

    // Verify no rows were modified
    const rows = await prisma.workerMailbox.findMany({
      where: { toWorker: WORKER_A },
    });
    for (const row of rows) {
      expect(row.read).toBe(false);
    }
  });

  // Case 7: send: two identical sends produce 2 distinct rows (no unique constraint)
  it('send: two identical sends produce 2 distinct rows', async () => {
    const input = { to: WORKER_A, from: WORKER_B, message: 'duplicate-me' };

    const result1 = await service.send(input);
    const result2 = await service.send(input);

    // IDs must be distinct
    expect(result1.id).not.toBe(result2.id);

    // Both rows must exist in DB
    const rows = await prisma.workerMailbox.findMany({
      where: { toWorker: WORKER_A, message: 'duplicate-me' },
    });
    expect(rows).toHaveLength(2);
  });

  // Case 9: markRead is count-idempotent — second call on already-read IDs returns 0
  it('markRead is count-idempotent: second call on already-read IDs returns updated=0', async () => {
    const { id: id1 } = await sendMsg(WORKER_A, WORKER_B, 'idempotent-1');
    const { id: id2 } = await sendMsg(WORKER_A, WORKER_B, 'idempotent-2');
    const { id: id3 } = await sendMsg(WORKER_A, WORKER_B, 'idempotent-3');

    const ids = [id1, id2, id3];

    // First call — all 3 rows are unread, expect count === 3
    const first = await service.markRead(ids);
    expect(first.updated).toBe(3);

    // Second call — all rows already read, expect count === 0 (count-idempotent)
    const second = await service.markRead(ids);
    expect(second.updated).toBe(0);
  });

  // Case 8: archiveBefore deletes only rows older than the cutoff
  it('archiveBefore deletes only rows older than the cutoff', async () => {
    // Insert an "old" row by directly writing to DB with a past createdAt
    const pastDate = new Date(Date.now() - 10_000); // 10 seconds ago

    await prisma.workerMailbox.create({
      data: {
        toWorker: WORKER_A,
        fromWorker: WORKER_B,
        message: 'old-message',
        read: false,
        createdAt: pastDate,
      },
    });

    // Insert a new row (will have createdAt ~ now)
    await sendMsg(WORKER_A, WORKER_B, 'new-message');

    // Archive everything before 5 seconds ago — should catch the old row but not the new one
    const midpoint = new Date(Date.now() - 5_000);
    const result = await service.archiveBefore(midpoint);

    expect(result.archived).toBe(1);

    const remaining = await prisma.workerMailbox.findMany({
      where: { toWorker: WORKER_A },
    });
    expect(remaining).toHaveLength(1);
    expect(remaining[0].message).toBe('new-message');
  });
});
