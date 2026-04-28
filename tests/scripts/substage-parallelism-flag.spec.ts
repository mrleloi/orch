/**
 * substage-parallelism-flag.spec.ts — Vitest regression fixture for
 * scripts/audit/substage-parallelism-flag.sh
 *
 * CF-V2.6-10.1-LEXICOGRAPHIC-DEDUP: verify version-aware dedup works for
 * substage IDs like 9.10 vs 9.2. Raw bash string `<` would put 9.10 before 9.2
 * (lexicographic) causing double-counting of A∥B pairs; integer split fixes this.
 *
 * Cases:
 *   P1 — no parallel entries → exit 2 (SKIP)
 *   P2 — 9.10 ∥ 9.2, no file collision → exit 0 (PASS, 1 pair checked)
 *   P3 — 9.10 ∥ 9.2, shared output file → exit 1 (FAIL, collision detected)
 *   P4 — 9.2 ∥ 9.10 declared from 9.2's side → same pair counted exactly once
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const HOOK_SCRIPT = resolve(
  __dirname,
  '../../scripts/audit/substage-parallelism-flag.sh',
);

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'orch-parallelism-flag-test-'));
}

function cleanupDir(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // best-effort
  }
}

function runScript(
  routingBriefContent: string,
  env: Record<string, string> = {},
): { exitCode: number; stdout: string; stderr: string } {
  const dir = makeTmpDir();
  try {
    // The script looks for phase-10 or phase-9 routing brief; put both paths
    // in a temp project dir and point CLAUDE_PROJECT_DIR to it.
    const memDir = join(dir, 'agent-workspace', 'memory');
    require('node:fs').mkdirSync(memDir, { recursive: true });
    const briefPath = join(memDir, 'phase-10-routing-brief.md');
    writeFileSync(briefPath, routingBriefContent, 'utf8');

    const result = spawnSync('bash', [HOOK_SCRIPT], {
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_PROJECT_DIR: dir, ...env },
      timeout: 15_000,
    });

    return {
      exitCode: result.status ?? 2,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
    };
  } finally {
    cleanupDir(dir);
  }
}

/** Build a minimal routing brief with two substages. */
function makeRoutingBrief(
  substageA: { id: string; parallelWith: string[]; outputFiles: string[] },
  substageB: { id: string; parallelWith: string[]; outputFiles: string[] },
): string {
  function renderSubstage(s: {
    id: string;
    parallelWith: string[];
    outputFiles: string[];
  }): string {
    const parallelLine =
      s.parallelWith.length > 0
        ? `- **parallel_safe_with**: [${s.parallelWith.join(', ')}]\n`
        : '';
    const filesLine =
      s.outputFiles.length > 0
        ? `- **output_files** (write): [${s.outputFiles.join(', ')}]\n`
        : '';
    return `### ${s.id} — test substage\n${parallelLine}${filesLine}\n`;
  }
  return renderSubstage(substageA) + renderSubstage(substageB);
}

describe('substage-parallelism-flag.sh — version-aware dedup (CF-V2.6-10.1-LEXICOGRAPHIC-DEDUP)', () => {
  // P1 — no parallel_safe_with entries → SKIP
  it('P1 — no parallel_safe_with entries → exit 2 (SKIP)', () => {
    const brief = makeRoutingBrief(
      { id: '9.1', parallelWith: [], outputFiles: ['file-a.ts'] },
      { id: '9.2', parallelWith: [], outputFiles: ['file-b.ts'] },
    );
    const { exitCode } = runScript(brief);
    expect(exitCode).toBe(2);
  });

  // P2 — 9.10 ∥ 9.2, no shared file → exit 0 (PASS)
  // Regression: string compare would put 9.10 < 9.2 so the pair is checked from 9.10's side.
  // Integer compare: 9.10 > 9.2 numerically from 9.10's side (10 > 2), so pair is only
  // checked when processing 9.2 (which declares 9.10 as peer). Net result: 1 pair, no collision.
  it('P2 — 9.10 ∥ 9.2, no shared output file → exit 0 (PASS, pair checked exactly once)', () => {
    const brief = makeRoutingBrief(
      { id: '9.10', parallelWith: ['9.2'], outputFiles: ['pkg/a.ts'] },
      { id: '9.2', parallelWith: ['9.10'], outputFiles: ['pkg/b.ts'] },
    );
    const { exitCode, stdout, stderr } = runScript(brief);
    expect(exitCode, `stdout: ${stdout} stderr: ${stderr}`).toBe(0);
    // Must report exactly 1 pair checked (not 2, which would happen with double-count)
    expect(stdout).toMatch(/1 pair\(s\) checked/);
  });

  // P3 — 9.10 ∥ 9.2, same output file → exit 1 (FAIL collision)
  it('P3 — 9.10 ∥ 9.2, shared output file → exit 1 (FAIL, collision detected)', () => {
    const brief = makeRoutingBrief(
      { id: '9.10', parallelWith: ['9.2'], outputFiles: ['shared/output.ts'] },
      { id: '9.2', parallelWith: ['9.10'], outputFiles: ['shared/output.ts'] },
    );
    const { exitCode, stderr } = runScript(brief);
    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/collision/i);
    expect(stderr).toMatch(/shared\/output\.ts/);
  });

  // P4 — only one side declares parallel_safe_with; pair must be checked exactly once
  it('P4 — only 9.2 declares parallel_safe_with [9.10] → 1 pair checked, exit 0', () => {
    const brief = makeRoutingBrief(
      { id: '9.10', parallelWith: [], outputFiles: ['pkg/x.ts'] },
      { id: '9.2', parallelWith: ['9.10'], outputFiles: ['pkg/y.ts'] },
    );
    const { exitCode, stdout, stderr } = runScript(brief);
    expect(exitCode, `stdout: ${stdout} stderr: ${stderr}`).toBe(0);
    expect(stdout).toMatch(/1 pair\(s\) checked/);
  });
});
