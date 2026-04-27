/**
 * PrismaService — NestJS-injectable wrapper for the Prisma client.
 *
 * Lifecycle:
 *   onModuleInit  → connects to the database, then applies pragmas:
 *                   PRAGMA journal_mode=WAL  (D2 — mandatory WAL, never DELETE)
 *                   PRAGMA foreign_keys=ON   (enforce FK constraints at runtime)
 *                   PRAGMA busy_timeout=5000 (wait up to 5s before SQLITE_BUSY)
 *   onModuleDestroy → disconnects cleanly
 *
 * I-14: No Prisma imports in domain layer — all Prisma code stays here.
 * I-13: DATABASE_URL is read from env; tests override it per-run.
 */

import * as os from 'node:os';
import * as path from 'node:path';
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

/** Expand $ORCH_HOME/orch.db — the default runtime database path. */
function defaultDatabaseUrl(): string {
  const orchHome = process.env['ORCH_HOME'] ?? path.join(os.homedir(), '.orch');
  const dbPath = path.join(orchHome, 'orch.db');
  return `file:${dbPath}`;
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const databaseUrl = process.env['DATABASE_URL'] ?? defaultDatabaseUrl();

    // Strip the "file:" prefix if present — better-sqlite3 expects a raw path or ":memory:"
    const rawPath = databaseUrl.startsWith('file:')
      ? databaseUrl.slice('file:'.length)
      : databaseUrl;

    const adapter = new PrismaBetterSqlite3({ url: rawPath });
    super({ adapter });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    // D2: WAL mode is mandatory. DELETE mode is rejected per nanoclaw.md §6.
    await this.$executeRawUnsafe('PRAGMA journal_mode=WAL;');
    await this.$executeRawUnsafe('PRAGMA foreign_keys=ON;');
    await this.$executeRawUnsafe('PRAGMA busy_timeout=5000;');
    this.logger.log('Database connected — WAL mode active, FK enforcement ON');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Database disconnected');
  }
}
