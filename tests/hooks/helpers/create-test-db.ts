/**
 * create-test-db.ts — CLI helper for session-start-worktree-sweep.spec.ts
 *
 * Creates a minimal SQLite database with Project + Session tables.
 * Optionally seeds one active session.
 *
 * Usage:
 *   npx tsx create-test-db.ts <dbPath> [activeSessionId]
 *
 * If activeSessionId is provided, inserts a Session row with state='Running'.
 *
 * Uses better-sqlite3 (sync API) — this script runs as a subprocess from
 * vitest tests to avoid native-module bundling issues in the vite runtime.
 */

import Database from 'better-sqlite3';

const [, , dbPath, activeSessionId] = process.argv;

if (!dbPath) {
  process.stderr.write('Usage: create-test-db.ts <dbPath> [activeSessionId]\n');
  process.exit(1);
}

const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "rootPath" TEXT NOT NULL,
    "profileJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "sessionKey" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'Idle',
    "model" TEXT,
    "claudeSessionId" TEXT,
    "tokensUsed" INTEGER,
    "endReason" TEXT,
    "worktreePath" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "endedAt" DATETIME
  );
  CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "checksum" TEXT NOT NULL,
    "finished_at" DATETIME,
    "migration_name" TEXT NOT NULL,
    "logs" TEXT,
    "rolled_back_at" DATETIME,
    "started_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applied_steps_count" INTEGER NOT NULL DEFAULT 0
  );
`);

// Insert a dummy project row (FK requirement for Session)
db.prepare(`
  INSERT INTO "Project" ("id", "rootPath", "profileJson", "updatedAt")
  VALUES ('test-project-1', '/tmp/test', '{}', CURRENT_TIMESTAMP)
`).run();

if (activeSessionId) {
  db.prepare(`
    INSERT INTO "Session" ("id", "projectId", "sessionKey", "state", "updatedAt")
    VALUES (?, 'test-project-1', 'test-key', 'Running', CURRENT_TIMESTAMP)
  `).run(activeSessionId);
}

db.close();
process.stdout.write(`db-created:${dbPath}\n`);
