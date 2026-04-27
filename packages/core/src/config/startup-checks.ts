/**
 * startup-checks.ts — Non-blocking startup validation for the Orch daemon.
 *
 * All checks here warn but do NOT crash the process (P2 simplicity — fail fast
 * only on hard invariants like missing DB schema).
 *
 * Checks:
 *  1. ORCH_HOME directory exists — warn + suggest `orch init` if missing.
 *  2. DB schema applied — performs a cheap SELECT; fatal if schema missing.
 *  3. OTEL exporter reachable — HEAD request; warn-only on failure.
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import { Logger } from '@nestjs/common';
import type { PrismaService } from '../modules/db/prisma.service.js';

const logger = new Logger('StartupChecks');

/** Expand leading ~ to the OS home directory. */
function expandHome(p: string): string {
  if (p.startsWith('~/') || p === '~') {
    return p.replace('~', os.homedir());
  }
  return p;
}

/**
 * Check that ORCH_HOME exists.
 * Warn-only — daemon runs without it; some features will degrade.
 */
async function checkOrchHome(orchHome: string): Promise<void> {
  const expanded = expandHome(orchHome);
  try {
    await fs.access(expanded);
  } catch {
    logger.warn({
      msg: 'startup:orch-home-missing',
      path: expanded,
      hint: 'Run `orch init` to initialise the home directory.',
    });
  }
}

/**
 * Check that the DB schema is applied using a cheap SQLite master table query.
 * Avoids heavy Prisma model introspection — just checks that the 'Session'
 * table exists in sqlite_master (single row lookup, sub-millisecond).
 * Fatal if the schema is missing — daemon cannot operate without persistence.
 */
async function checkDbSchema(prisma: PrismaService): Promise<void> {
  try {
    // Cheapest possible SQLite schema check — no table scan, no index walk.
    // Returns one row if the Session table exists, zero rows otherwise.
    const rows = await prisma.$queryRawUnsafe<{ name: string }[]>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='Session' LIMIT 1`,
    );
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error('Session table not found in sqlite_master');
    }
  } catch (err) {
    // Schema not applied or DB not accessible — this is fatal
    logger.error({
      msg: 'startup:db-schema-missing',
      error: String(err),
      hint: 'Run `pnpm prisma migrate deploy` to apply migrations.',
    });
    throw new Error(
      '[orch] DB schema check failed — run prisma migrate before starting the daemon.',
    );
  }
}

/**
 * Check that the OTEL exporter endpoint is reachable.
 * Warn-only — tracing is non-critical; daemon continues without it (I-12).
 */
async function checkOtelExporter(endpoint: string | undefined): Promise<void> {
  if (!endpoint) return;

  const url = `${endpoint}/v1/traces`;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    try {
      await fetch(url, { method: 'HEAD', signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
  } catch {
    logger.warn({
      msg: 'startup:otel-unreachable',
      endpoint: url,
      hint: 'OTEL traces will be dropped until the collector is available.',
    });
  }
}

/** Run all startup checks. Throws only if the DB schema check fails. */
export async function runStartupChecks(
  prisma: PrismaService,
  opts: {
    orchHome: string;
    otelEndpoint: string | undefined;
  },
): Promise<void> {
  await checkOrchHome(opts.orchHome);
  await checkDbSchema(prisma);
  await checkOtelExporter(opts.otelEndpoint);
}
