/**
 * git-diff-collector.spec.ts — Unit tests for GitDiffCollector.
 *
 * Coverage (per Part B.3 and task 3.5.b):
 *  - Standard multi-file diff parse (clean-diff.txt)
 *  - Binary file detection (binary-diff.txt)
 *  - Empty diff returns zero totals (empty-diff.txt)
 *  - CRLF tolerance (crlf-diff.txt)
 *  - Degraded path: non-zero exit / bad revision (bad-revision.txt)
 *  - Degraded path: execa ENOENT throw (git-not-found.txt)
 *  - Malformed-line resilience (skips unknown lines)
 *  - Files count and path parsing
 *  - Summary line extraction (totalInsertions / totalDeletions)
 *  - Never throws (all error paths return valid GitDiffSummary)
 *
 * Decision 006 enforcement: no LLM, no Anthropic SDK, no network.
 * I-12: Zero `any` in this file.
 */

import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { GitDiffSummary, ExecaFn, ILogger } from './types.js';
import { GitDiffCollector } from './git-diff-collector.js';

const execFileAsync = promisify(execFile);

// ── Helpers ───────────────────────────────────────────────────────────────────

const FIXTURES_DIR = join(__dirname, '__fixtures__', 'git-diff');

function readFixture(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name), 'utf-8');
}

/**
 * Build a fake ExecaFn that returns the given stdout/stderr/exitCode.
 * reject: false semantics: always returns (never throws) for normal errors.
 */
function makeExeca(opts: {
  stdout: string;
  stderr?: string;
  exitCode?: number;
  failed?: boolean;
}): ExecaFn {
  return () =>
    Promise.resolve({
      stdout: opts.stdout,
      stderr: opts.stderr ?? '',
      exitCode: opts.exitCode ?? 0,
      failed: opts.failed ?? false,
    });
}

/**
 * Build a fake ExecaFn that throws (simulates ENOENT / process spawn failure).
 */
function makeExecaThrow(err: Error): ExecaFn {
  return () => Promise.reject(err);
}

/** Silent logger for tests — all messages are no-ops. */
const silentLogger: ILogger = {
  log: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

/** Captured-log logger: records messages for assertion. */
function makeCaptureLogger(): ILogger & { captured: string[] } {
  const captured: string[] = [];
  return {
    captured,
    log: (msg) => {
      captured.push(msg);
    },
    warn: (msg) => {
      captured.push(msg);
    },
    error: (msg) => {
      captured.push(msg);
    },
  };
}

function makeCollector(execaFn: ExecaFn, log: ILogger = silentLogger): GitDiffCollector {
  // GitDiffCollector depends on DI tokens but we can construct directly in tests
  // by passing the injected values to the constructor.
  return new GitDiffCollector(execaFn, log);
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('GitDiffCollector.collect', () => {
  // ── T1: Standard multi-file diff parse ──────────────────────────────────────
  it('T1: parses clean multi-file diff into FileDiffRecords', async () => {
    const stdout = readFixture('clean-diff.txt');
    const collector = makeCollector(makeExeca({ stdout }));

    const result: GitDiffSummary = await collector.collect('/repo', 'abc123', 'HEAD');

    expect(result.degraded).toBe(false);
    expect(result.fromRef).toBe('abc123');
    expect(result.toRef).toBe('HEAD');
    expect(result.files).toHaveLength(3);

    // Verify paths are parsed
    const paths = result.files.map((f) => f.path);
    expect(paths).toContain('src/foo.ts');
    expect(paths).toContain('src/bar.ts');
    expect(paths).toContain('src/baz.ts');

    // No file should be binary
    result.files.forEach((f) => expect(f.binary).toBe(false));
  });

  // ── T2: Summary line totals extracted correctly ──────────────────────────────
  it('T2: extracts totalInsertions and totalDeletions from summary line', async () => {
    const stdout = readFixture('clean-diff.txt');
    const collector = makeCollector(makeExeca({ stdout }));

    const result = await collector.collect('/repo', 'abc123', 'HEAD');

    // Summary line: " 3 files changed, 47 insertions(+), 19 deletions(-)"
    expect(result.totalInsertions).toBe(47);
    expect(result.totalDeletions).toBe(19);
  });

  // ── T3: Binary file detection ────────────────────────────────────────────────
  it('T3: detects binary files and sets binary=true with zero insertions/deletions', async () => {
    const stdout = readFixture('binary-diff.txt');
    const collector = makeCollector(makeExeca({ stdout }));

    const result = await collector.collect('/repo', 'abc123', 'HEAD');

    expect(result.degraded).toBe(false);

    const binaryFiles = result.files.filter((f) => f.binary);
    expect(binaryFiles.length).toBeGreaterThanOrEqual(2);

    binaryFiles.forEach((f) => {
      expect(f.insertions).toBe(0);
      expect(f.deletions).toBe(0);
    });

    // Binary file paths
    const paths = binaryFiles.map((f) => f.path);
    expect(paths).toContain('src/assets/logo.png');
    expect(paths).toContain('src/assets/bg.jpg');
  });

  // ── T4: Mixed binary + text in same diff ─────────────────────────────────────
  it('T4: handles mix of binary and text files in same diff', async () => {
    const stdout = readFixture('binary-diff.txt');
    const collector = makeCollector(makeExeca({ stdout }));

    const result = await collector.collect('/repo', 'abc123', 'HEAD');

    const textFiles = result.files.filter((f) => !f.binary);
    expect(textFiles.length).toBeGreaterThanOrEqual(1);
    expect(textFiles.find((f) => f.path === 'src/main.ts')).toBeDefined();
  });

  // ── T5: Empty diff returns zero totals ───────────────────────────────────────
  it('T5: empty diff returns zero totals and empty files array', async () => {
    const stdout = readFixture('empty-diff.txt');
    const collector = makeCollector(makeExeca({ stdout }));

    const result = await collector.collect('/repo', 'abc123', 'HEAD');

    expect(result.degraded).toBe(false);
    expect(result.files).toHaveLength(0);
    expect(result.totalInsertions).toBe(0);
    expect(result.totalDeletions).toBe(0);
  });

  // ── T6: CRLF tolerance ───────────────────────────────────────────────────────
  it('T6: strips CRLF and parses correctly (Windows line endings)', async () => {
    const stdout = readFixture('crlf-diff.txt');
    const collector = makeCollector(makeExeca({ stdout }));

    const result = await collector.collect('/repo', 'abc123', 'HEAD');

    expect(result.degraded).toBe(false);
    expect(result.files).toHaveLength(2);

    const paths = result.files.map((f) => f.path);
    expect(paths).toContain('src/foo.ts');
    expect(paths).toContain('src/bar.ts');
  });

  // ── T7: Degraded path — non-zero exit / bad revision ─────────────────────────
  it('T7: returns degraded summary on non-zero exit (bad revision)', async () => {
    const stderr = readFixture('bad-revision.txt');
    const collector = makeCollector(
      makeExeca({ stdout: '', stderr, exitCode: 128, failed: true }),
    );

    const result = await collector.collect('/repo', 'abc123', 'bad_ref');

    expect(result.degraded).toBe(true);
    expect(result.files).toHaveLength(0);
    expect(result.totalInsertions).toBe(0);
    expect(result.totalDeletions).toBe(0);
    expect(result.degradedReason).toBeDefined();
    expect(result.degradedReason).toMatch(/bad revision/i);
  });

  // ── T8: Degraded path — ENOENT throw (wires git-not-found.txt fixture) ────────
  it('T8: returns degraded summary when execa throws ENOENT (git not found)', async () => {
    // git-not-found.txt fixture describes the failure scenario (wired here for traceability)
    const fixtureMsg = readFixture('git-not-found.txt').trim();
    expect(fixtureMsg).toContain('ENOENT'); // fixture sanity check
    const enoentErr = Object.assign(new Error('spawn git ENOENT'), { code: 'ENOENT' });
    const collector = makeCollector(makeExecaThrow(enoentErr));

    const result = await collector.collect('/repo', 'abc123', 'HEAD');

    expect(result.degraded).toBe(true);
    expect(result.files).toHaveLength(0);
    expect(result.degradedReason).toMatch(/git not available/i);
  });

  // ── T8b: execa is called with timeout=5000ms ─────────────────────────────────
  it('T8b: passes timeout: 5000 in options to the execa call (plan §3.5.b line 554)', async () => {
    // Spy-based test: capture the options argument and assert timeout === 5000.
    let capturedOptions: { cwd: string; timeout: number; reject: false } | null = null;
    const spyExeca: ExecaFn = (_binary, _args, opts) => {
      capturedOptions = opts;
      return Promise.resolve({ stdout: '', stderr: '', exitCode: 0, failed: false });
    };

    const collector = makeCollector(spyExeca);
    await collector.collect('/repo', 'abc', 'def');

    expect(capturedOptions).not.toBeNull();
    expect(capturedOptions!.timeout).toBe(5000);
  });

  // ── T9: Degraded path — generic thrown error ─────────────────────────────────
  it('T9: returns degraded summary when execa throws generic error', async () => {
    const err = new Error('Timeout exceeded');
    const collector = makeCollector(makeExecaThrow(err));

    const result = await collector.collect('/repo', 'abc123', 'HEAD');

    expect(result.degraded).toBe(true);
    expect(result.degradedReason).toContain('Timeout exceeded');
  });

  // ── T10: Never throws ─────────────────────────────────────────────────────────
  it('T10: never throws even on catastrophic execa failure', async () => {
    const collector = makeCollector(makeExecaThrow(new Error('catastrophic')));

    await expect(collector.collect('/repo', 'from', 'to')).resolves.toBeDefined();
    await expect(collector.collect('/repo', 'from', 'to')).resolves.toMatchObject({
      degraded: true,
    });
  });

  // ── T11: Degraded path logs at debug level ────────────────────────────────────
  it('T11: logs degraded reason via injected ILogger on ENOENT', async () => {
    const captureLogger = makeCaptureLogger();
    const enoentErr = Object.assign(new Error('spawn git ENOENT'), { code: 'ENOENT' });
    const collector = makeCollector(makeExecaThrow(enoentErr), captureLogger);

    await collector.collect('/repo', 'abc123', 'HEAD');

    expect(captureLogger.captured.length).toBeGreaterThan(0);
    expect(captureLogger.captured.some((m) => m.toLowerCase().includes('degraded'))).toBe(true);
  });

  // ── T12: Malformed-line resilience ────────────────────────────────────────────
  it('T12: skips malformed lines and continues parsing valid lines', async () => {
    const malformedStdout = [
      ' src/good.ts | 5 +++++',
      'THIS IS A COMPLETELY MALFORMED LINE WITH NO PIPE',
      ' src/also-good.ts | 3 +++',
      '',
      ' 2 files changed, 8 insertions(+), 0 deletions(-)',
    ].join('\n');

    const collector = makeCollector(makeExeca({ stdout: malformedStdout }));
    const result = await collector.collect('/repo', 'abc123', 'HEAD');

    expect(result.degraded).toBe(false);
    expect(result.files).toHaveLength(2);
    expect(result.files.map((f) => f.path)).toContain('src/good.ts');
    expect(result.files.map((f) => f.path)).toContain('src/also-good.ts');
  });

  // ── T13: Correct fromRef / toRef pass-through ─────────────────────────────────
  it('T13: sets fromRef and toRef from the call arguments on both happy and degraded paths', async () => {
    const happyCollector = makeCollector(makeExeca({ stdout: '' }));
    const happyResult = await happyCollector.collect('/repo', 'SHA_FROM', 'SHA_TO');
    expect(happyResult.fromRef).toBe('SHA_FROM');
    expect(happyResult.toRef).toBe('SHA_TO');

    const degradedCollector = makeCollector(
      makeExeca({ stdout: '', exitCode: 128, failed: true }),
    );
    const degradedResult = await degradedCollector.collect('/repo', 'SHA_FROM', 'SHA_TO');
    expect(degradedResult.fromRef).toBe('SHA_FROM');
    expect(degradedResult.toRef).toBe('SHA_TO');
  });
});

// ── GitDiffCollector.getHeadCommit ────────────────────────────────────────────

describe('GitDiffCollector.getHeadCommit', () => {
  const FAKE_SHA = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';

  // ── T-HEAD-1: happy path ─────────────────────────────────────────────────────
  it('T-HEAD-1: returns 40-char lowercase hex SHA from git rev-parse HEAD', async () => {
    const execa = makeExeca({ stdout: FAKE_SHA + '\n' });
    const collector = makeCollector(execa);

    const sha = await collector.getHeadCommit('/repo');

    expect(sha).toBe(FAKE_SHA);
    expect(sha).toMatch(/^[0-9a-f]{40}$/);
  });

  // ── T-HEAD-2: normalises uppercase hex to lowercase ──────────────────────────
  it('T-HEAD-2: normalises uppercase hex SHA to lowercase', async () => {
    const upperSha = FAKE_SHA.toUpperCase();
    const execa = makeExeca({ stdout: upperSha });
    const collector = makeCollector(execa);

    const sha = await collector.getHeadCommit('/repo');

    expect(sha).toBe(FAKE_SHA.toLowerCase());
    expect(sha).toMatch(/^[0-9a-f]{40}$/);
  });

  // ── T-HEAD-3: non-zero exit → throws DomainError ─────────────────────────────
  it('T-HEAD-3: throws DomainError(GIT_HEAD_RESOLVE_FAILED) on non-zero exit', async () => {
    const execa = makeExeca({ stdout: '', stderr: 'not a git repository', exitCode: 128, failed: true });
    const collector = makeCollector(execa);

    await expect(collector.getHeadCommit('/not-a-repo')).rejects.toMatchObject({
      code: 'GIT_HEAD_RESOLVE_FAILED',
    });
  });

  // ── T-HEAD-4: ENOENT throw → throws DomainError ──────────────────────────────
  it('T-HEAD-4: throws DomainError(GIT_HEAD_RESOLVE_FAILED) when execa throws ENOENT', async () => {
    const enoentErr = Object.assign(new Error('spawn git ENOENT'), { code: 'ENOENT' });
    const collector = makeCollector(makeExecaThrow(enoentErr));

    await expect(collector.getHeadCommit('/repo')).rejects.toMatchObject({
      code: 'GIT_HEAD_RESOLVE_FAILED',
    });
  });

  // ── T-HEAD-5: unexpected output → throws DomainError ─────────────────────────
  it('T-HEAD-5: throws DomainError(GIT_HEAD_RESOLVE_FAILED) when output is not a 40-char hex', async () => {
    const execa = makeExeca({ stdout: 'HEAD\n' }); // non-SHA output
    const collector = makeCollector(execa);

    await expect(collector.getHeadCommit('/repo')).rejects.toMatchObject({
      code: 'GIT_HEAD_RESOLVE_FAILED',
    });
  });

  // ── T-HEAD-6: real git repo fixture ─────────────────────────────────────────
  it('T-HEAD-6: returns 40-char hex against a real tmp git repo created in this test', async () => {
    // Create a real tmp git repo to exercise the actual execa path.
    // Uses child_process.execFile wrapped as an ExecaFn-compatible adapter
    // to avoid Jest ESM import issues with the execa package.

    // Minimal ExecaFn adapter using node:child_process (no execa dependency at test runtime)
    const realExecaFn: ExecaFn = async (binary, args, opts) => {
      try {
        const result = await execFileAsync(binary, args as string[], {
          cwd: opts.cwd,
          timeout: opts.timeout,
        });
        return {
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: 0,
          failed: false,
        };
      } catch (err) {
        const e = err as NodeJS.ErrnoException & { stdout?: string; stderr?: string; code?: number };
        if (e.code === 'ENOENT') throw e;
        return {
          stdout: e.stdout ?? '',
          stderr: e.stderr ?? '',
          exitCode: (e.code as number) ?? 1,
          failed: true,
        };
      }
    };

    const tmpDir = mkdtempSync(join(tmpdir(), 'orch-git-head-test-'));

    try {
      // Init repo and create initial commit
      await realExecaFn('git', ['-C', tmpDir, 'init'], { cwd: tmpDir, timeout: 5000, reject: false });
      await realExecaFn('git', ['-C', tmpDir, 'config', 'user.email', 'test@test.com'], { cwd: tmpDir, timeout: 5000, reject: false });
      await realExecaFn('git', ['-C', tmpDir, 'config', 'user.name', 'Test'], { cwd: tmpDir, timeout: 5000, reject: false });
      // Create a file so we can commit (git needs staged changes for a real commit)
      writeFileSync(join(tmpDir, 'init.txt'), 'init');
      await realExecaFn('git', ['-C', tmpDir, 'add', '.'], { cwd: tmpDir, timeout: 5000, reject: false });
      await realExecaFn('git', ['-C', tmpDir, 'commit', '-m', 'init'], { cwd: tmpDir, timeout: 5000, reject: false });

      const realCollector = new GitDiffCollector(realExecaFn, silentLogger);
      const sha = await realCollector.getHeadCommit(tmpDir);

      expect(sha).toMatch(/^[0-9a-f]{40}$/);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  }, 30_000); // allow 30s for git init + commit
});
