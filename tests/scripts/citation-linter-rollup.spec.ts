/**
 * citation-linter-rollup.spec.ts — Vitest cases for scripts/utilities/citation-linter.ts
 *
 * Cases:
 *   R1 — all-resolvable: synthetic rollup with skill::research-first + agent::task-implementer → exit 0
 *   R2 — one-missing:    synthetic rollup with skill::nonexistent-skill-xxxxxx → exit 1
 *   R3 — empty rollup:   no component rows → exit 0
 *   R4 — builtin exempt: hook::Bash → exit 0 (EXEMPT, not FAIL)
 *   R5 — sentinel exempt: agent::unknown-agent → exit 0 (EXEMPT_SENTINEL)
 *   R6 — Phase 6 smoke:  actual component-rollup-phase-6.md → exit 0 (all rows EXEMPT/EXEMPT_SENTINEL/PASS)
 *
 * Pattern mirrors tests/scripts/rollup-telemetry.spec.ts:
 *   spawnSync('pnpm', ['tsx', SCRIPT_PATH, ...args], { shell: true, cwd: repoRoot })
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const SCRIPT_PATH = resolve(__dirname, '../../scripts/utilities/citation-linter.ts');
const repoRoot = resolve(__dirname, '../../');

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'orch-citation-linter-test-'));
}
function cleanupDir(dir: string): void {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
}

function runLinter(args: string[]): { exitCode: number; stdout: string; stderr: string } {
  // shell:true required on Windows where 'pnpm' is a .cmd shim.
  const result = spawnSync('pnpm', ['tsx', SCRIPT_PATH, ...args], {
    encoding: 'utf8', timeout: 30_000, cwd: repoRoot, shell: true,
  });
  return { exitCode: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

/** Build a minimal rollup markdown table with given component rows. */
function makeRollupMd(rows: Array<{ type: string; name: string }>): string {
  const header = '| Type | Name | Count | Success Rate |\n|------|------|------:|-------------:|\n';
  const body = rows.map(r => `| ${r.type} | ${r.name} | 1 | 1.000 |`).join('\n');
  return `# Component Telemetry Rollup — Phase 99\n\n## Components\n\n${header}${body}\n`;
}

describe('citation-linter.ts --rollup', () => {
  // R1 — all-resolvable synthetic rollup
  it('R1 — all-resolvable: skill::research-first + agent::task-implementer → exit 0', () => {
    const dir = makeTmpDir();
    try {
      const rollupPath = join(dir, 'rollup.md');
      writeFileSync(rollupPath, makeRollupMd([
        { type: 'skill', name: 'research-first' },
        { type: 'agent', name: 'task-implementer' },
      ]), 'utf8');
      const { exitCode } = runLinter(['--rollup', rollupPath]);
      expect(exitCode, 'should exit 0 when all components resolve to existing files').toBe(0);
    } finally { cleanupDir(dir); }
  });

  // R2 — one-missing component
  it('R2 — one-missing: skill::nonexistent-skill-xxxxxx → exit 1, path in output', () => {
    const dir = makeTmpDir();
    try {
      const rollupPath = join(dir, 'rollup.md');
      writeFileSync(rollupPath, makeRollupMd([{ type: 'skill', name: 'nonexistent-skill-xxxxxx' }]), 'utf8');
      const { exitCode, stdout, stderr } = runLinter(['--rollup', rollupPath]);
      expect(exitCode, 'should exit non-zero for missing component').toBe(1);
      const combined = stdout + stderr;
      expect(combined).toMatch(/nonexistent-skill-xxxxxx/);
      expect(combined).toMatch(/\.claude\/skills\/nonexistent-skill-xxxxxx\/SKILL\.md/);
    } finally { cleanupDir(dir); }
  });

  // R3 — empty rollup (no component rows)
  it('R3 — empty rollup: 0 component rows → exit 0', () => {
    const dir = makeTmpDir();
    try {
      const rollupPath = join(dir, 'rollup.md');
      writeFileSync(rollupPath, '# Rollup\n\n## Components\n\nNo data rows here.\n', 'utf8');
      const { exitCode } = runLinter(['--rollup', rollupPath]);
      expect(exitCode, 'should exit 0 for empty rollup').toBe(0);
    } finally { cleanupDir(dir); }
  });

  // R4 — built-in hook exemption
  it('R4 — builtin hook exempt: hook::Bash → exit 0 (EXEMPT, not FAIL)', () => {
    const dir = makeTmpDir();
    try {
      const rollupPath = join(dir, 'rollup.md');
      writeFileSync(rollupPath, makeRollupMd([{ type: 'hook', name: 'Bash' }]), 'utf8');
      const { exitCode, stdout, stderr } = runLinter(['--rollup', rollupPath]);
      expect(exitCode, 'hook::Bash should be EXEMPT, not FAIL').toBe(0);
      // Must NOT report it as FAIL
      expect(stdout + stderr).not.toMatch(/FAIL.*Bash/);
    } finally { cleanupDir(dir); }
  });

  // R5 — sentinel exemption
  it('R5 — sentinel exempt: agent::unknown-agent → exit 0 (EXEMPT_SENTINEL)', () => {
    const dir = makeTmpDir();
    try {
      const rollupPath = join(dir, 'rollup.md');
      writeFileSync(rollupPath, makeRollupMd([{ type: 'agent', name: 'unknown-agent' }]), 'utf8');
      const { exitCode, stdout, stderr } = runLinter(['--rollup', rollupPath]);
      expect(exitCode, 'agent::unknown-agent should be EXEMPT_SENTINEL, not FAIL').toBe(0);
      expect(stdout + stderr).not.toMatch(/FAIL.*unknown-agent/);
    } finally { cleanupDir(dir); }
  });

  // R6 — Phase 6 rollup smoke gate (SC-35)
  it('R6 — Phase 6 rollup smoke (SC-35): --rollup component-rollup-phase-6.md → exit 0', () => {
    const phase6Path = resolve(repoRoot, 'agent-workspace/memory/component-rollup-phase-6.md');
    const { exitCode, stdout, stderr } = runLinter(['--rollup', phase6Path]);
    expect(exitCode, `Phase 6 rollup should exit 0 (all rows PASS/EXEMPT/EXEMPT_SENTINEL). stdout: ${stdout} stderr: ${stderr}`).toBe(0);
  });

  // R7 — CF-25 dedup: WebFetch and TaskList must be EXEMPT (not FAIL) — Phase 10.2
  it('R7 — CF-25 dedup: hook::WebFetch → exit 0 (EXEMPT, not FAIL)', () => {
    const dir = makeTmpDir();
    try {
      const rollupPath = join(dir, 'rollup.md');
      writeFileSync(rollupPath, makeRollupMd([{ type: 'hook', name: 'WebFetch' }]), 'utf8');
      const { exitCode, stdout, stderr } = runLinter(['--rollup', rollupPath]);
      expect(exitCode, 'hook::WebFetch should be EXEMPT (built-in), not FAIL').toBe(0);
      expect(stdout + stderr).not.toMatch(/FAIL.*WebFetch/);
    } finally { cleanupDir(dir); }
  });

  it('R8 — CF-25 dedup: hook::TaskList → exit 0 (EXEMPT, not FAIL)', () => {
    const dir = makeTmpDir();
    try {
      const rollupPath = join(dir, 'rollup.md');
      writeFileSync(rollupPath, makeRollupMd([{ type: 'hook', name: 'TaskList' }]), 'utf8');
      const { exitCode, stdout, stderr } = runLinter(['--rollup', rollupPath]);
      expect(exitCode, 'hook::TaskList should be EXEMPT (built-in), not FAIL').toBe(0);
      expect(stdout + stderr).not.toMatch(/FAIL.*TaskList/);
    } finally { cleanupDir(dir); }
  });

  // R9 — Phase 9 rollup smoke (CF-25 regression guard): contains WebFetch + TaskList
  it('R9 — Phase 9 rollup smoke (CF-25 regression guard): --phase 9 → exit 0', () => {
    const phase9Path = resolve(repoRoot, 'agent-workspace/memory/component-rollup-phase-9.md');
    // Precondition: the fixture file must actually contain WebFetch and TaskList rows
    // so this test is a true regression guard for CF-25 (not just a "file exists" check).
    const rollupContent = readFileSync(phase9Path, 'utf8');
    expect(rollupContent, 'phase-9 rollup must contain WebFetch row for CF-25 guard').toMatch(/WebFetch/);
    expect(rollupContent, 'phase-9 rollup must contain TaskList row for CF-25 guard').toMatch(/TaskList/);

    const { exitCode, stdout, stderr } = runLinter(['--rollup', phase9Path]);
    expect(exitCode, `Phase 9 rollup should exit 0 (WebFetch + TaskList now EXEMPT). stdout: ${stdout} stderr: ${stderr}`).toBe(0);
  });
});
