/**
 * ClaudeCodeAdapter integration test — gated by ORCH_SKIP_INTEGRATION=1,
 * CI_SKIP_CCS_SPAWN=true, OR missing ccs binary.
 *
 * Answers open question SYNTHESIS §6.3: "Windows Git Bash ccs/claude invocation
 * with --output-format stream-json — does it work and produce parseable JSON?"
 *
 * This test spawns a real `claude -p "echo ok"` via ccs and asserts:
 *  - A session_id is extracted (either from stream-json or stderr fallback)
 *  - Exit code is 0
 *  - Duration is < 120s
 *
 * I-13: This is the ONE gated integration test. All other tests mock execa.
 *
 * WHY THIS TEST IS SKIPPED IN CI:
 *   GitHub Actions (ubuntu-latest) does not have `ccs` or `claude` CLI installed,
 *   and there is no live Anthropic account available in the CI environment. Running
 *   this test in CI would cause an environmental failure unrelated to code correctness.
 *   The test is preserved in source so it can be run manually against a real account.
 *
 * Skip conditions (any is sufficient):
 *   1. CI_SKIP_CCS_SPAWN=true  (set by .github/workflows/ci.yml Test step env)
 *   2. ORCH_SKIP_INTEGRATION=1  (legacy explicit skip, kept for backwards compatibility)
 *   3. `ccs` binary not found on PATH  (avoids a known-fail when ccs is absent)
 *
 * To run locally (all three conditions must be clear):
 *   1. Install ccs: https://github.com/anthropics/ccs (must be on PATH)
 *   2. Authenticate: ccs login (requires Anthropic account)
 *   3. Run: unset CI_SKIP_CCS_SPAWN ORCH_SKIP_INTEGRATION && pnpm --filter @orch/core run test:integration
 *
 * CI: CI_SKIP_CCS_SPAWN=true is set by .github/workflows/ci.yml → entire suite is skipped.
 */

import { execSync } from 'node:child_process';
import execa from 'execa';
import { spawn as cpSpawn } from 'node:child_process';
import { PassThrough } from 'node:stream';
import { ClaudeCodeAdapter } from './claude-code-adapter.js';
import type { RuntimeHandle } from '../../domain/types/runtime.js';

/**
 * Detect whether the `ccs` binary is available on PATH.
 * Uses platform-appropriate command: `where.exe ccs` on Windows, `which ccs` on POSIX.
 * Returns false on any error (binary not found, permission denied, etc.).
 */
function detectCcsBinary(): boolean {
  try {
    const cmd = process.platform === 'win32' ? 'where.exe ccs' : 'which ccs';
    execSync(cmd, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const hasCcsBinary = detectCcsBinary();

const SKIP =
  process.env['CI_SKIP_CCS_SPAWN'] === 'true' ||
  process.env['ORCH_SKIP_INTEGRATION'] === '1' ||
  !hasCcsBinary;
const conditionalDescribe = SKIP ? describe.skip : describe;

conditionalDescribe('ClaudeCodeAdapter integration (real ccs subprocess)', () => {
  // 120s timeout — real claude call can be slow
  jest.setTimeout(120_000);

  it('spawns ccs with stream-json and extracts a session_id', async () => {
    // We directly call execa (not via adapter) so we can inspect streams manually.
    // Using `claude -p "echo ok" --output-format stream-json` via ccs default profile.
    const profile = process.env['ORCH_TEST_PROFILE'] ?? 'default';
    const start = Date.now();

    let sessionId: string | null = null;
    let exitCode: number | null = null;

    const child = execa(
      'ccs',
      [profile, '-p', 'echo ok', '--output-format', 'stream-json'],
      { reject: false, buffer: false },
    );

    // Collect stdout for JSON parsing
    const lines: string[] = [];
    let stdoutBuf = '';

    child.stdout?.on('data', (chunk: Buffer) => {
      stdoutBuf += chunk.toString('utf8');
      const parts = stdoutBuf.split('\n');
      stdoutBuf = parts.pop() ?? '';
      for (const line of parts) {
        lines.push(line);
        const event = ClaudeCodeAdapter.parseStreamLine(line);
        if (event?.session_id && !sessionId) {
          sessionId = event.session_id as string;
        }
      }
    });

    let stderrBuf = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      stderrBuf += chunk.toString('utf8');
      if (!sessionId) {
        sessionId = ClaudeCodeAdapter.extractSessionIdFallback(stderrBuf);
      }
    });

    const result = await child;
    exitCode = result.exitCode ?? null;

    const duration = Date.now() - start;

    expect(exitCode).toBe(0);
    expect(sessionId).not.toBeNull();
    expect(sessionId).toMatch(/[a-f0-9-]{36}/i);
    expect(duration).toBeLessThan(120_000);

    console.log(`Integration: sessionId=${sessionId}, exit=${exitCode}, duration=${duration}ms`);
    console.log(`Lines received: ${lines.length}`);
    if (lines.length > 0) {
      console.log(`First line: ${lines[0]?.slice(0, 120)}`);
    }
  });
});

// ── SIGKILL fallback path ──────────────────────────────────────────────────────
//
// Exercises the TERMINATE_TIMEOUT_MS → SIGKILL branch in ClaudeCodeAdapter.terminate().
// Spawns a real node subprocess that ignores SIGTERM, then uses fake timers to
// advance past DEFAULT_TERMINATE_TIMEOUT_MS (5_000ms) and asserts:
//   1. SIGKILL was sent (child no longer running)
//   2. logger.warn captured 'adapter:terminate:sigkill-sent'
//   3. No DomainError thrown
//
// Skipped on win32: process.kill(pid, 'SIGTERM') is emulated on Windows and the
// SIGTERM-ignore trick does not reliably work there. Skip rather than merge flaky.

describe('ClaudeCodeAdapter.terminate() SIGKILL escalation', () => {
  const isWin32 = process.platform === 'win32';

  // Minimal TracingService stub — terminate() never calls tracing, but the
  // constructor requires it. injectTraceparentIntoEnv returns a copy of env.
  const fakeTracing = {
    injectTraceparentIntoEnv: (env: NodeJS.ProcessEnv) => ({ ...env }),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let adapter: ClaudeCodeAdapter;

  beforeEach(() => {
    adapter = new ClaudeCodeAdapter(fakeTracing as never);
  });

  // Restore real timers after each test so other suites are not affected
  afterEach(() => {
    jest.useRealTimers();
  });

  (isWin32 ? it.skip : it)(
    'terminate() escalates to SIGKILL after TERMINATE_TIMEOUT_MS when SIGTERM is ignored',
    async () => {
      // ── Arrange ────────────────────────────────────────────────────────────
      // Spawn a node child that installs a no-op SIGTERM handler so SIGTERM is
      // silently ignored. The child keeps alive via setInterval.
      const child = cpSpawn(
        process.execPath,
        ['-e', "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"],
        { stdio: 'ignore' },
      );

      // Wait until the child has a PID and is fully running
      await new Promise<void>((resolve, reject) => {
        child.on('spawn', resolve);
        child.on('error', reject);
      });

      const pid = child.pid!;

      // Verify child is actually running before we start the test
      expect(() => process.kill(pid, 0)).not.toThrow();

      // Build a minimal RuntimeHandle — terminate() only needs `pid`
      const handle: RuntimeHandle = {
        sessionId: 'test-sigkill',
        pid,
        abort: () => {},
        stdout: new PassThrough(),
        stderr: new PassThrough(),
      };

      // Spy on logger.warn — the SIGKILL path calls this.logger.warn(...)
      // Logger is a private field; access via bracket notation for test.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
      const loggerWarnSpy = jest.spyOn((adapter as any).logger as { warn: (obj: unknown) => void }, 'warn');

      // ── Act ────────────────────────────────────────────────────────────────
      // Switch to fake timers AFTER the child is running, so cpSpawn's internal
      // event loop callbacks already fired. terminate() will use the fake
      // setTimeout/setInterval registered from this point onward.
      jest.useFakeTimers();

      // Start terminate() — it sends SIGTERM (ignored) then sets up a
      // setTimeout(cb, 5000) + setInterval(poll, 200). We advance time to fire them.
      const terminatePromise = adapter.terminate(handle, 'timeout');

      // Advance fake clock by 5001ms — fires the SIGKILL timeout callback.
      // jest.advanceTimersByTimeAsync flushes microtasks between ticks so the
      // inner resolve() propagates correctly.
      await jest.advanceTimersByTimeAsync(5_001);

      // Await the terminate() promise — should resolve (not reject) now
      await expect(terminatePromise).resolves.toBeUndefined();

      // ── Assert ─────────────────────────────────────────────────────────────
      // 1. Child must be dead (SIGKILL sent). Give OS a tiny window to reap.
      await new Promise((r) => setTimeout(r, 50));
      jest.useRealTimers();

      expect(() => process.kill(pid, 0)).toThrow(/ESRCH/);

      // 2. logger.warn must have been called with the sigkill-sent message
      const sigkillCall = loggerWarnSpy.mock.calls.find(
        (args) =>
          typeof args[0] === 'object' &&
          args[0] !== null &&
          (args[0] as Record<string, unknown>)['msg'] === 'adapter:terminate:sigkill-sent',
      );
      expect(sigkillCall).toBeDefined();
    },
    15_000, // 15s test timeout — real OS operations + fake-timer overhead
  );
});
