/**
 * session-start-worktree-sweep.spec.ts
 *
 * Verifies the orphan-worktree sweep stanza added to session-start-bootstrap.sh
 * in Phase 6.3.5 (SC-26).
 *
 * Strategy: extract the sweep stanza into a standalone test-driver bash script
 * written to tmp dirs per-test. Tests shell out via spawnSync('bash', [...]).
 * The stanza writes orphan-pruning events to HOOK_LOG; tests verify log content.
 *
 * Database: a subprocess helper (tests/hooks/helpers/create-test-db.ts) creates
 * a minimal SQLite DB seeded with one active session. The DATABASE_URL env var
 * is passed so session-active-check.ts queries the correct DB.
 * (better-sqlite3 is a native module; using a subprocess avoids vite bundler issues.)
 *
 * T1: 3 fake worktrees (1 active, 2 orphan) → sweep logs 2 prune events
 *     for the 2 orphan sessionIds, none for the active one.
 * T2: empty .git/worktrees/ → sweep runs cleanly, 0 prune events.
 * T3: git not on PATH → sweep stanza skips silently; script exits 0, 0 prune events.
 *
 * SC-26: Phase 6.3 orphan-worktree sweep.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..', '..');

/** Absolute path to session-active-check.ts (used by the bash stanza). */
const SESSION_CHECK_SCRIPT = resolve(
  REPO_ROOT,
  'scripts',
  'utilities',
  'session-active-check.ts',
);

/** Absolute path to the DB creation helper. */
const CREATE_DB_HELPER = resolve(__dirname, 'helpers', 'create-test-db.ts');

// ---------------------------------------------------------------------------
// DB creation via subprocess (avoids native-module bundling issues in vite)
// ---------------------------------------------------------------------------

/**
 * Create a minimal SQLite database by spawning create-test-db.ts via tsx.
 * Returns the absolute path to the db file.
 */
function createTestDb(dir: string, activeSessionId: string | null): string {
  const dbPath = join(dir, 'test.db');
  const args = [CREATE_DB_HELPER, dbPath];
  if (activeSessionId !== null) {
    args.push(activeSessionId);
  }

  // Use pnpm tsx with shell:true — pnpm is a .cmd shim on Windows; shell:true
  // resolves it correctly (same pattern as tests/scripts/rollup-telemetry.spec.ts).
  const result = spawnSync('pnpm', ['tsx', ...args], {
    encoding: 'utf8',
    timeout: 30_000,
    env: { ...process.env },
    shell: true,
  });

  if (result.status !== 0) {
    throw new Error(
      `create-test-db failed (exit ${String(result.status)}): ${result.stderr}`,
    );
  }

  return dbPath;
}

// ---------------------------------------------------------------------------
// Bash stanza driver — write an isolated test script + run it.
// ---------------------------------------------------------------------------

/**
 * Write a minimal bash script embedding only the orphan-worktree sweep stanza.
 * PROJECT_DIR and HOOK_LOG are passed as positional args ($1, $2).
 *
 * The DATABASE_URL env var is forwarded from the caller's environment
 * (set per-test by runSweep()).
 */
function writeSweepDriver(dir: string): string {
  const scriptPath = join(dir, 'sweep-driver.sh');
  // Escape the SESSION_CHECK_SCRIPT path for bash (forward slashes on Windows Git Bash)
  const checkScript = SESSION_CHECK_SCRIPT.replace(/\\/g, '/');

  const sweepScript = `#!/usr/bin/env bash
set -euo pipefail
trap 'exit 0' ERR

PROJECT_DIR="$1"
HOOK_LOG="$2"

# 6.3.5 -- orphan-worktree sweep (SC-26).
if command -v git >/dev/null 2>&1 && [ -d "$PROJECT_DIR/.git" ]; then
  for wt in "$PROJECT_DIR/.git/worktrees/orch-"*/; do
    [ -d "$wt" ] || continue
    SID=$(basename "$wt" | sed 's/^orch-//')
    ACTIVE=$(npx --no-install tsx "${checkScript}" "$SID" 2>/dev/null || echo "no")
    if [ "$ACTIVE" != "yes" ]; then
      git -C "$PROJECT_DIR" worktree remove --force "$wt" 2>/dev/null || true
      echo "[$(date -Iseconds)] orphan-worktree-pruned sessionId=$SID path=$wt" >> "$HOOK_LOG"
    fi
  done
fi
`;
  writeFileSync(scriptPath, sweepScript);
  return scriptPath;
}

interface SweepResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  logContent: string;
}

function runSweep(
  projectDir: string,
  hookLog: string,
  sweepDriver: string,
  extraEnv: Record<string, string> = {},
): SweepResult {
  const result = spawnSync(
    'bash',
    [sweepDriver, projectDir, hookLog],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        ...extraEnv,
      },
      timeout: 60_000,
    },
  );

  const logContent = existsSync(hookLog)
    ? readFileSync(hookLog, 'utf8')
    : '';

  return {
    exitCode: result.status ?? -1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    logContent,
  };
}

// ---------------------------------------------------------------------------
// Cleanup registry
// ---------------------------------------------------------------------------

const dirsToClean: string[] = [];

afterEach(() => {
  for (const d of dirsToClean.splice(0)) {
    if (existsSync(d)) {
      rmSync(d, { recursive: true, force: true });
    }
  }
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('orphan-worktree sweep (SC-26)', () => {
  /**
   * T1: 3 fake worktree dirs (1 active, 2 orphan) →
   *     sweep logs 2 prune events (for the 2 orphans), skips the active one.
   */
  it('T1: 3 worktrees (1 active, 2 orphan) → logs 2 prune events for orphans, skips active', () => {
    const dir = mkdtempSync(join(tmpdir(), 'orch-sweep-t1-'));
    dirsToClean.push(dir);

    const activeId = 'active-session-id-001';
    const orphan1Id = 'orphan-session-id-002';
    const orphan2Id = 'orphan-session-id-003';

    // Create fake .git/worktrees/orch-<id>/ directories
    const worktreesDir = join(dir, '.git', 'worktrees');
    mkdirSync(join(worktreesDir, `orch-${activeId}`), { recursive: true });
    mkdirSync(join(worktreesDir, `orch-${orphan1Id}`), { recursive: true });
    mkdirSync(join(worktreesDir, `orch-${orphan2Id}`), { recursive: true });

    // Create test DB with the active session
    const dbPath = createTestDb(dir, activeId);
    const hookLog = join(dir, '.sweep.log');
    const sweepDriver = writeSweepDriver(dir);

    const r = runSweep(dir, hookLog, sweepDriver, {
      DATABASE_URL: `file:${dbPath}`,
    });

    // Script must exit 0 (trap 'exit 0' ERR handles non-fatal errors)
    expect(r.exitCode).toBe(0);

    // Log must contain prune events for the two orphan IDs
    expect(r.logContent).toContain(`orphan-worktree-pruned sessionId=${orphan1Id}`);
    expect(r.logContent).toContain(`orphan-worktree-pruned sessionId=${orphan2Id}`);
    // Log must NOT contain a prune event for the active session
    expect(r.logContent).not.toContain(`orphan-worktree-pruned sessionId=${activeId}`);
  });

  /**
   * T2: empty .git/worktrees/ → sweep runs cleanly, 0 prune events.
   */
  it('T2: empty .git/worktrees/ → sweep exits 0, no prune events', () => {
    const dir = mkdtempSync(join(tmpdir(), 'orch-sweep-t2-'));
    dirsToClean.push(dir);

    // .git exists but .git/worktrees/ is empty (no orch-* dirs)
    mkdirSync(join(dir, '.git', 'worktrees'), { recursive: true });

    const dbPath = createTestDb(dir, null);
    const hookLog = join(dir, '.sweep.log');
    const sweepDriver = writeSweepDriver(dir);

    const r = runSweep(dir, hookLog, sweepDriver, {
      DATABASE_URL: `file:${dbPath}`,
    });

    expect(r.exitCode).toBe(0);
    // No prune events in log
    expect(r.logContent).not.toContain('orphan-worktree-pruned');
  });

  /**
   * T3: git not on PATH → sweep stanza skips silently; exit 0, 0 prune events.
   *
   * Implementation note: we prepend a fake-bin dir that contains a `git` stub
   * that exits 1 (simulating "not found" in terms of `command -v git` still
   * finding it, but returning non-zero). However, the simplest approach is to
   * strip the PATH entries that contain `git` while keeping bash/date/sed/etc.
   * We achieve this by constructing a PATH with only /usr/bin (bash utilities)
   * and excluding /mingw64/bin (where git lives on Windows Git Bash).
   * On other platforms the standard /usr/bin also does not contain git by default.
   */
  it('T3: git not on PATH → sweep skips silently, exits 0', () => {
    const dir = mkdtempSync(join(tmpdir(), 'orch-sweep-t3-'));
    dirsToClean.push(dir);

    // Create a worktree dir that would be pruned if git were on PATH
    const orphanId = 'orphan-no-git-session';
    mkdirSync(
      join(dir, '.git', 'worktrees', `orch-${orphanId}`),
      { recursive: true },
    );

    const dbPath = createTestDb(dir, null);
    const hookLog = join(dir, '.sweep.log');
    // Write a sweep driver that sets its own PATH (no git) before running the stanza
    const scriptPath = join(dir, 'sweep-driver-t3.sh');
    const checkScript = SESSION_CHECK_SCRIPT.replace(/\\/g, '/');
    const noGitSweep = `#!/usr/bin/env bash
set -euo pipefail
trap 'exit 0' ERR

PROJECT_DIR="$1"
HOOK_LOG="$2"

# Limit PATH so git is not found (but bash, date, sed, basename remain)
export PATH=/usr/bin:/bin

# 6.3.5 -- orphan-worktree sweep (SC-26).
if command -v git >/dev/null 2>&1 && [ -d "$PROJECT_DIR/.git" ]; then
  for wt in "$PROJECT_DIR/.git/worktrees/orch-"*/; do
    [ -d "$wt" ] || continue
    SID=$(basename "$wt" | sed 's/^orch-//')
    ACTIVE=$(npx --no-install tsx "${checkScript}" "$SID" 2>/dev/null || echo "no")
    if [ "$ACTIVE" != "yes" ]; then
      git -C "$PROJECT_DIR" worktree remove --force "$wt" 2>/dev/null || true
      echo "[$(date -Iseconds)] orphan-worktree-pruned sessionId=$SID path=$wt" >> "$HOOK_LOG"
    fi
  done
fi
`;
    writeFileSync(scriptPath, noGitSweep);

    const r = runSweep(dir, hookLog, scriptPath, {
      DATABASE_URL: `file:${dbPath}`,
    });

    // Must exit 0 — the `command -v git` guard skips the loop silently
    expect(r.exitCode).toBe(0);
    // No prune events logged (stanza was skipped entirely because git not found)
    expect(r.logContent).not.toContain('orphan-worktree-pruned');
  });
});
