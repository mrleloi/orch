import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, mkdtempSync, mkdirSync, rmSync, existsSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const REPO_ROOT = resolve(__dirname, '..', '..');
const SCRIPT_PATH = resolve(REPO_ROOT, 'scripts', 'utilities', 'build-subagent-index.sh');
const FIXTURES_DIR = resolve(__dirname, 'fixtures');

const SYNTHETIC_HOOKS_LOG = resolve(FIXTURES_DIR, 'synthetic-hooks.log');
const SYNTHETIC_BUDGET_MD = resolve(FIXTURES_DIR, 'synthetic-budget-tracker.md');

interface BuildResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

/**
 * Run the build-subagent-index.sh script with explicit input/output paths.
 * Uses a temp PROJECT_DIR so real files are not affected.
 */
function runBuilder(
  hooksPath: string,
  outputPath: string,
  opts: { budgetTrackerPath?: string; projectDir?: string } = {}
): BuildResult {
  const projectDir = opts.projectDir ?? mkdtempSync(resolve(tmpdir(), 'orch-subagent-idx-'));
  const memDir = resolve(projectDir, 'agent-workspace', 'memory');
  mkdirSync(memDir, { recursive: true });

  // If a budget tracker is provided, copy it into the project's memory dir so the
  // script can find it (it looks at $PROJECT_DIR/agent-workspace/memory/budget-tracker.md)
  if (opts.budgetTrackerPath) {
    copyFileSync(opts.budgetTrackerPath, resolve(memDir, 'budget-tracker.md'));
  }

  const start = Date.now();
  const result = spawnSync('bash', [SCRIPT_PATH, hooksPath, outputPath], {
    encoding: 'utf8',
    env: {
      ...process.env,
      CLAUDE_PROJECT_DIR: projectDir,
    },
    timeout: 35000,
  });
  const durationMs = Date.now() - start;

  return {
    exitCode: result.status ?? -1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    durationMs,
  };
}

// Shared temp dir for tests that need an isolated project root
let sharedTmpDir: string;

beforeAll(() => {
  sharedTmpDir = mkdtempSync(resolve(tmpdir(), 'orch-idx-shared-'));
  mkdirSync(resolve(sharedTmpDir, 'agent-workspace', 'memory'), { recursive: true });
});

afterAll(() => {
  if (sharedTmpDir && existsSync(sharedTmpDir)) {
    rmSync(sharedTmpDir, { recursive: true, force: true });
  }
});

describe('build-subagent-index.sh', () => {
  /**
   * Test 1: builds non-empty table from synthetic hooks log + budget tracker fragment.
   * Feeds 7 SubagentStop events (hooks log) + 7 agentId rows (budget tracker).
   * After dedup across both sources, expects ≥7 data rows (all unique agentIds).
   */
  it('builds non-empty table from synthetic hooks log + budget tracker fragment', () => {
    const outDir = mkdtempSync(resolve(tmpdir(), 'orch-idx-t1-'));
    const outputPath = resolve(outDir, 'subagent-index.md');

    const result = runBuilder(SYNTHETIC_HOOKS_LOG, outputPath, {
      budgetTrackerPath: SYNTHETIC_BUDGET_MD,
    });

    expect(result.exitCode, `script failed: ${result.stderr}`).toBe(0);
    expect(existsSync(outputPath), 'output file must exist').toBe(true);

    const content = readFileSync(outputPath, 'utf8');

    // Must have header line and separator
    expect(content).toContain('| agentId |');
    expect(content).toContain('|---|');

    // Count data rows (lines starting with '| ' but not the header or separator)
    const dataRows = content
      .split('\n')
      .filter((line) => line.startsWith('| ') && !line.startsWith('| agentId') && !line.startsWith('|---|'));

    // 7 unique agentIds from hooks log; budget tracker adds 7 more = 14 total unique ids
    expect(dataRows.length, `expected ≥7 data rows, got ${dataRows.length}`).toBeGreaterThanOrEqual(7);

    rmSync(outDir, { recursive: true, force: true });
  });

  /**
   * Test 2: classifies verdict_class correctly across multiple enum values.
   * The synthetic budget tracker contains one of each: ok, ok_with_concerns,
   * approved_after_fix, fail, rejected, approved.
   * The hooks log adds: ok, ok_with_concerns, fail, approved, approved_after_fix, rejected.
   * Combined, all 6 non-unknown enum values must appear in the output.
   */
  it('classifies verdict_class correctly across expected enum values', () => {
    const outDir = mkdtempSync(resolve(tmpdir(), 'orch-idx-t2-'));
    const outputPath = resolve(outDir, 'subagent-index.md');

    const result = runBuilder(SYNTHETIC_HOOKS_LOG, outputPath, {
      budgetTrackerPath: SYNTHETIC_BUDGET_MD,
    });

    expect(result.exitCode, `script failed: ${result.stderr}`).toBe(0);
    const content = readFileSync(outputPath, 'utf8');

    const expectedVerdicts = [
      'ok',
      'ok_with_concerns',
      'fail',
      'rejected',
      'approved',
      'approved_after_fix',
    ];

    for (const v of expectedVerdicts) {
      expect(content, `expected verdict_class '${v}' to appear in output`).toContain(v);
    }

    rmSync(outDir, { recursive: true, force: true });
  });

  /**
   * Test 3: runs in < 30s on real .session-hooks.log + budget-tracker.md.
   * Uses the actual project files (if they exist). Skips gracefully if missing.
   */
  it('runs in < 30s on real project files', () => {
    const realHooksLog = resolve(REPO_ROOT, 'agent-workspace', 'memory', '.session-hooks.log');
    const realBudgetMd = resolve(REPO_ROOT, 'agent-workspace', 'memory', 'budget-tracker.md');

    // Use a temp output to avoid polluting the real index during testing
    const outDir = mkdtempSync(resolve(tmpdir(), 'orch-idx-t3-'));
    const outputPath = resolve(outDir, 'subagent-index.md');

    const budgetOpt = existsSync(realBudgetMd) ? { budgetTrackerPath: realBudgetMd } : {};
    const hooksInput = existsSync(realHooksLog) ? realHooksLog : SYNTHETIC_HOOKS_LOG;

    const result = runBuilder(hooksInput, outputPath, budgetOpt);

    expect(result.exitCode, `script failed: ${result.stderr}`).toBe(0);
    expect(result.durationMs, `expected < 30000ms, got ${result.durationMs}ms`).toBeLessThan(30000);

    rmSync(outDir, { recursive: true, force: true });
  });

  /**
   * Test 5 (D-1 regression): produces empty table without crash when both data
   * sources contain zero agentIds.  Triggered a "set -u: unbound variable" panic
   * at lines 317 / 389 before the declare -A NAME=() fix.
   */
  it('produces empty table without crash when both data sources are empty', () => {
    const projectDir = mkdtempSync(resolve(tmpdir(), 'orch-idx-t5-empty-'));
    const memDir = resolve(projectDir, 'agent-workspace', 'memory');
    mkdirSync(memDir, { recursive: true });

    // Empty hooks log — path a has zero events
    const emptyHooksLog = resolve(memDir, '.session-hooks.log');
    writeFileSync(emptyHooksLog, '');

    // No budget-tracker.md at all — path b has zero agentId citations
    const outputPath = resolve(memDir, 'subagent-index.md');

    const start = Date.now();
    const result = spawnSync('bash', [SCRIPT_PATH, emptyHooksLog, outputPath], {
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
      timeout: 10000,
    });
    const durationMs = Date.now() - start;

    expect(result.status, `script crashed: ${result.stderr}`).toBe(0);
    expect(existsSync(outputPath), 'output file must be created even with zero rows').toBe(true);

    const content = readFileSync(outputPath, 'utf8');

    // Header and separator must be present
    expect(content).toContain('| agentId |');
    expect(content).toContain('|---|');

    // Zero data rows
    const dataRows = content
      .split('\n')
      .filter(
        (line) =>
          line.startsWith('| ') &&
          !line.startsWith('| agentId') &&
          !line.startsWith('|---|'),
      );
    expect(dataRows.length, 'expected 0 data rows for empty inputs').toBe(0);

    // Must finish well within time limit
    expect(durationMs).toBeLessThan(5000);

    rmSync(projectDir, { recursive: true, force: true });
  });

  /**
   * Test 4: output is idempotent across two consecutive runs (byte-identical).
   * Same inputs → same output regardless of run order.
   */
  it('output is idempotent across consecutive runs', () => {
    const outDir = mkdtempSync(resolve(tmpdir(), 'orch-idx-t4-'));
    const outputPath1 = resolve(outDir, 'run1.md');
    const outputPath2 = resolve(outDir, 'run2.md');

    const opts = { budgetTrackerPath: SYNTHETIC_BUDGET_MD };

    const r1 = runBuilder(SYNTHETIC_HOOKS_LOG, outputPath1, opts);
    const r2 = runBuilder(SYNTHETIC_HOOKS_LOG, outputPath2, opts);

    expect(r1.exitCode, `run1 failed: ${r1.stderr}`).toBe(0);
    expect(r2.exitCode, `run2 failed: ${r2.stderr}`).toBe(0);

    const content1 = readFileSync(outputPath1, 'utf8');
    const content2 = readFileSync(outputPath2, 'utf8');

    // Strip the generated timestamp line (it may differ by a second between runs)
    const stripTs = (s: string): string =>
      s
        .split('\n')
        .filter((line) => !line.startsWith('# Subagent Index — generated'))
        .join('\n');

    expect(stripTs(content1)).toBe(stripTs(content2));

    rmSync(outDir, { recursive: true, force: true });
  });
});
