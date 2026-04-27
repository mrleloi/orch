/**
 * PrismaService spec
 *
 * Tests that onModuleInit applies the required SQLite PRAGMAs:
 *   - journal_mode = WAL  (D2 — mandatory, never DELETE)
 *   - foreign_keys  = 1  (FK enforcement)
 *   - busy_timeout  = 5000
 *
 * I-13: uses a per-test tmp-file SQLite DB. The DB is removed after each test.
 * No shared dev DB state leaks into tests.
 */

import * as os from 'node:os';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaService } from './prisma.service.js';

// ── migration SQL ─────────────────────────────────────────────────────────────
// Read the combined migration SQL so tests run without spawning the Prisma CLI.
import { readFileSync } from 'node:fs';

const MIGRATIONS_DIR = path.join(
  __dirname,
  '../../../prisma/migrations',
);

function readAllMigrations(): string {
  const migrationFolders = fs
    .readdirSync(MIGRATIONS_DIR)
    .sort() // lexicographic = chronological (Prisma timestamps)
    .filter((d) =>
      fs.statSync(path.join(MIGRATIONS_DIR, d)).isDirectory(),
    );

  return migrationFolders
    .map((folder) =>
      readFileSync(path.join(MIGRATIONS_DIR, folder, 'migration.sql'), 'utf8'),
    )
    .join('\n');
}

// ── helper: create a fresh test DB ────────────────────────────────────────────

let testDbPath: string;

function createTestDb(): string {
  const tmp = path.join(os.tmpdir(), `orch-test-${process.pid}-${Date.now()}.db`);
  // Apply migrations using better-sqlite3 directly (no CLI spawn needed — I-13)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require('better-sqlite3') as typeof import('better-sqlite3').default;
  const db = new Database(tmp);
  const sql = readAllMigrations();
  // Execute each statement individually (SQLite pragma execution)
  db.exec(sql);
  db.close();
  return tmp;
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('PrismaService', () => {
  let module: TestingModule;
  let prisma: PrismaService;

  beforeEach(async () => {
    testDbPath = createTestDb();
    process.env['DATABASE_URL'] = `file:${testDbPath}`;

    module = await Test.createTestingModule({
      providers: [PrismaService],
    }).compile();

    prisma = module.get(PrismaService);
    await prisma.onModuleInit();
  });

  afterEach(async () => {
    await prisma.onModuleDestroy();
    await module.close();
    // Clean up tmp DB files
    try {
      fs.unlinkSync(testDbPath);
      fs.unlinkSync(`${testDbPath}-wal`);
      fs.unlinkSync(`${testDbPath}-shm`);
    } catch {
      // files may not exist — ignore
    }
    delete process.env['DATABASE_URL'];
  });

  it('should set journal_mode to WAL after init', async () => {
    // D2: WAL mode is mandatory
    type PragmaRow = { journal_mode: string };
    const result = await prisma.$queryRawUnsafe<PragmaRow[]>(
      'PRAGMA journal_mode;',
    );
    expect(result[0]?.journal_mode).toBe('wal');
  });

  it('should enforce foreign keys (foreign_keys = 1)', async () => {
    // better-sqlite3 returns INTEGER PRAGMAs as BigInt via Prisma raw queries
    type PragmaRow = { foreign_keys: number | bigint };
    const result = await prisma.$queryRawUnsafe<PragmaRow[]>(
      'PRAGMA foreign_keys;',
    );
    expect(Number(result[0]?.foreign_keys)).toBe(1);
  });

  it('should set busy_timeout to 5000ms', async () => {
    type PragmaRow = { timeout: number | bigint };
    const result = await prisma.$queryRawUnsafe<PragmaRow[]>(
      'PRAGMA busy_timeout;',
    );
    expect(Number(result[0]?.timeout)).toBe(5000);
  });

  it('should disconnect cleanly on destroy', async () => {
    // If $disconnect throws, onModuleDestroy will reject — test fails automatically
    await expect(prisma.onModuleDestroy()).resolves.toBeUndefined();
  });
});
