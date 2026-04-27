/**
 * docker-smoke.integration.spec.ts — Task 4.8 Docker Compose Smoke Test
 *
 * CI-Linux-gated: this test ONLY runs on Linux (process.platform === 'linux').
 * On Windows/macOS it skips cleanly. On Linux CI, it:
 *   1. Brings up the 'default' profile (orch-core only) via `docker compose up -d --wait`
 *   2. Sends GET /healthz and asserts HTTP 200
 *   3. Tears down via `docker compose down`
 *
 * PLACEMENT: __e2e__/ with *.integration.spec.ts suffix so it is:
 *   - EXCLUDED from `pnpm test` (testPathIgnorePatterns: "\.integration\.spec\.ts$")
 *   - INCLUDED in `pnpm test:integration` (testPathPatterns: "\.integration\.spec\.ts$")
 *
 * GATE-SKIP: If the `docker` binary is not on PATH (ENOENT), the test self-skips.
 * This prevents false failures in environments without Docker installed.
 *
 * ENV VARS REQUIRED on Linux CI:
 *   ORCH_HOOK_SECRET       — must be set (non-empty); compose defaults orchdev placeholder
 *   ORCH_API_BEARER_TOKEN  — must be set (non-empty); compose defaults orchdev placeholder
 *   No other vars required for default profile smoke.
 *
 * TIMEOUT: 120 s (docker pull + container start can take time on a cold CI runner).
 *
 * I-1: No LLM SDK imports.
 * I-2: No "stockforge" hardcoding.
 * I-13: No real network calls beyond localhost Docker-mapped port.
 */

import { execa, ExecaError } from 'execa';
import * as path from 'path';

// ── Platform gate ─────────────────────────────────────────────────────────────
// Skip the entire suite on non-Linux. The describe.skip block still appears in
// the Jest output as "skipped", so CI operators can confirm the skip is intentional.

const IS_LINUX = process.platform === 'linux';

// Repo root: packages/core/src/__e2e__/ → ../../../../
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Check whether the `docker` binary is on PATH.
 * Returns true if available, false if ENOENT (not installed).
 * Throws on unexpected errors.
 */
async function isDockerAvailable(): Promise<boolean> {
  try {
    await execa('docker', ['info'], { stdio: 'pipe' });
    return true;
  } catch (err) {
    const execaErr = err as ExecaError;
    // ENOENT = docker not installed; anything else (daemon not running, etc.) = available
    if (execaErr.code === 'ENOENT') return false;
    // Docker is installed but daemon might be down — still report available so the
    // test can attempt the real run and fail with a meaningful message.
    return true;
  }
}

/**
 * Run `docker compose` with the given args in the repo root.
 * Returns the combined stdout+stderr for diagnostics.
 */
async function composeRun(args: string[]): Promise<string> {
  const result = await execa('docker', ['compose', ...args], {
    cwd: REPO_ROOT,
    stdio: 'pipe',
    // Allow non-zero exit code to bubble as ExecaError (handled by caller)
  });
  return `${result.stdout}\n${result.stderr}`;
}

// ── Suite ─────────────────────────────────────────────────────────────────────

// eslint-disable-next-line jest/valid-describe-callback -- conditional describe needed
const describeFn = IS_LINUX ? describe : describe.skip;

describeFn('docker compose smoke (Linux-only)', () => {
  // Increase timeout: docker pull + container start takes time on cold runners.
  jest.setTimeout(120_000);

  let dockerAvailable = false;

  beforeAll(async () => {
    dockerAvailable = await isDockerAvailable();
    if (!dockerAvailable) {
      console.warn(
        '[docker-smoke] docker binary not found on PATH — test will skip',
      );
    }
  });

  afterAll(async () => {
    if (!dockerAvailable) return;
    // Best-effort teardown — do not throw if this fails (CI cleanup)
    try {
      await composeRun(['down', '--volumes', '--remove-orphans']);
    } catch {
      console.warn('[docker-smoke] docker compose down failed — ignoring');
    }
  });

  it('starts orch-core (default profile) and responds 200 on /healthz', async () => {
    if (!dockerAvailable) {
      console.warn('[docker-smoke] skipping: docker not on PATH');
      return;
    }

    // Bring up default profile (no --profile flag = only orch-core)
    await composeRun(['up', '-d', '--wait']);

    // Health probe — retry handled by `--wait` flag above; this is a final check.
    const response = await fetch('http://localhost:4141/healthz');

    expect(response.status).toBe(200);

    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ status: 'ok' });
  });
});
