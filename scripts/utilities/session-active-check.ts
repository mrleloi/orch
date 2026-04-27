/**
 * session-active-check.ts — Read-only DB helper for the orphan-worktree sweep.
 *
 * Queries the Orch SQLite database for a Session row matching the given ID
 * whose state is 'Running' or 'Spawning' (i.e. actively occupying a worker slot).
 *
 * Prints "yes" if found, "no" otherwise.
 * Pure read — no DB writes, no side effects beyond the query.
 *
 * CLI usage (from session-start-bootstrap.sh sweep stanza):
 *   npx --no-install tsx scripts/utilities/session-active-check.ts <sessionId>
 *
 * Exit codes:
 *   0 — always (even for "no"); non-zero only on unrecoverable error.
 *
 * DATABASE_URL resolution:
 *   Reads process.env.DATABASE_URL or falls back to $ORCH_HOME/orch.db
 *   (same logic as PrismaService in packages/core).
 *
 * I-1: No LLM SDK imports.
 * I-14: NestJS is NOT imported here — this is a standalone CLI script.
 * SC-26: Phase 6.3 orphan-worktree sweep (session-start-bootstrap.sh).
 */

import * as os from 'node:os';
import * as path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

function buildDatabaseUrl(): string {
  const envUrl = process.env['DATABASE_URL'];
  if (envUrl) return envUrl;
  const orchHome = process.env['ORCH_HOME'] ?? path.join(os.homedir(), '.orch');
  return `file:${path.join(orchHome, 'orch.db')}`;
}

function rawPathFromUrl(databaseUrl: string): string {
  return databaseUrl.startsWith('file:')
    ? databaseUrl.slice('file:'.length)
    : databaseUrl;
}

// ---------------------------------------------------------------------------
// Core query
// ---------------------------------------------------------------------------

/** Active session states that mean the session is still occupying a worktree. */
const ACTIVE_STATES = ['Running', 'Spawning'] as const;

/**
 * Returns true if a session with `sessionId` exists in an active state.
 */
async function isSessionActive(
  prisma: PrismaClient,
  sessionId: string,
): Promise<boolean> {
  const row = await prisma.session.findFirst({
    where: {
      id: sessionId,
      state: { in: [...ACTIVE_STATES] },
    },
    select: { id: true },
  });
  return row !== null;
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const sessionId = process.argv[2];
  if (!sessionId) {
    process.stderr.write(
      'Usage: session-active-check.ts <sessionId>\n',
    );
    process.exit(1);
  }

  const databaseUrl = buildDatabaseUrl();
  const rawPath = rawPathFromUrl(databaseUrl);

  const adapter = new PrismaBetterSqlite3({ url: rawPath });
  const prisma = new PrismaClient({ adapter });

  try {
    await prisma.$connect();
    const active = await isSessionActive(prisma, sessionId);
    process.stdout.write(active ? 'yes\n' : 'no\n');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  process.stderr.write(
    `session-active-check: error: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  // Print "no" on error so the sweep treats an error as "not active" (safe default).
  process.stdout.write('no\n');
  process.exit(0);
});
