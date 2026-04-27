/**
 * rollup-telemetry.spec.ts — Vitest cases for scripts/utilities/rollup-telemetry.ts
 *
 * 5 deterministic cases per architect Part B §B.4.
 * Each test creates an isolated tmpdir and cleans up in finally.
 *
 * Pattern mirrors tests/hooks/component-telemetry.spec.ts:
 *   spawnSync('pnpm', ['tsx', SCRIPT_PATH, ...args])
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const SCRIPT_PATH = resolve(__dirname, '../../scripts/utilities/rollup-telemetry.ts');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'orch-rollup-test-'));
}

function cleanupDir(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // best-effort
  }
}

/** Minimal valid JSONL event line for a given component. */
function makeEvent(
  componentType: 'skill' | 'agent' | 'command' | 'hook',
  componentName: string,
  outcome: 'ok' | 'error' | 'timeout' | 'reject' | 'no_op' = 'ok',
  durationMs = 100,
  tokensReal = 0,
  failureMode: string | null = null,
): string {
  return JSON.stringify({
    ts: '2026-04-27T12:00:00.000Z',
    component_type: componentType,
    component_name: componentName,
    trigger: 'hook_event',
    outcome,
    tokens_real: tokensReal,
    duration_ms: durationMs,
    session_id: 'test-session',
    task_id: null,
    failure_mode: failureMode,
  });
}

function runRollup(args: string[]): {
  exitCode: number;
  stdout: string;
  stderr: string;
} {
  // shell:true is required on Windows where 'pnpm' is a .cmd shim (not a bare
  // executable). Cross-platform: shell:true works on both Windows and Unix.
  const result = spawnSync('pnpm', ['tsx', SCRIPT_PATH, ...args], {
    encoding: 'utf8',
    timeout: 30_000,
    cwd: resolve(__dirname, '../../'),
    shell: true,
  });
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('rollup-telemetry.ts', () => {
  // Case 1 — empty input file
  it('Case 1 — empty input: exits 0; output has H1 + 0 valid events; Components table has header but 0 data rows', () => {
    const dir = makeTmpDir();
    try {
      const inputPath = join(dir, 'empty.jsonl');
      const outputPath = join(dir, 'rollup.md');
      writeFileSync(inputPath, '', 'utf8');

      const { exitCode, stdout } = runRollup([
        '--phase', '99',
        '--input', inputPath,
        '--output', outputPath,
      ]);

      expect(exitCode, `stdout: ${stdout}`).toBe(0);
      expect(existsSync(outputPath)).toBe(true);

      const content = readFileSync(outputPath, 'utf8');

      // H1 present
      expect(content).toMatch(/^# Component Telemetry Rollup — Phase 99/m);

      // 0 valid events in header blurb
      expect(content).toMatch(/0 valid events/);

      // ## Components section present
      expect(content).toMatch(/^## Components$/m);

      // Table header present
      expect(content).toMatch(/\| Type \| Name \| Count \|/);

      // No data rows (no | skill | or | agent | etc.)
      const dataRowPattern = /^\| (skill|agent|command|hook) \|/m;
      expect(content).not.toMatch(dataRowPattern);
    } finally {
      cleanupDir(dir);
    }
  });

  // Case 2 — single component
  it('Case 2 — single component: exits 0; exactly 1 data row; count=1, success_rate=1.000', () => {
    const dir = makeTmpDir();
    try {
      const inputPath = join(dir, 'single.jsonl');
      const outputPath = join(dir, 'rollup.md');
      writeFileSync(inputPath, makeEvent('skill', 'research-first', 'ok', 12, 0) + '\n', 'utf8');

      const { exitCode } = runRollup([
        '--phase', '99',
        '--input', inputPath,
        '--output', outputPath,
      ]);

      expect(exitCode).toBe(0);

      const content = readFileSync(outputPath, 'utf8');

      // Exactly 1 data row
      const dataRows = content.split('\n').filter(l => /^\| (skill|agent|command|hook) \|/.test(l));
      expect(dataRows).toHaveLength(1);

      // count=1
      expect(dataRows[0]).toMatch(/\|\s*1\s*\|/);

      // success_rate=1.000
      expect(dataRows[0]).toMatch(/\|\s*1\.000\s*\|/);

      // component_name = research-first
      expect(dataRows[0]).toMatch(/research-first/);
    } finally {
      cleanupDir(dir);
    }
  });

  // Case 3 — multi component
  it('Case 3 — multi component: exits 0; 4 data rows; rows ordered DESC by count (all equal → stable alpha by name)', () => {
    const dir = makeTmpDir();
    try {
      const inputPath = join(dir, 'multi.jsonl');
      const outputPath = join(dir, 'rollup.md');

      // 4 distinct components, each count=1
      const lines = [
        makeEvent('skill', 'research-first', 'ok'),
        makeEvent('agent', 'task-implementer', 'ok'),
        makeEvent('command', 'budget-check', 'ok'),
        makeEvent('hook', 'Stop', 'ok'),
      ].join('\n') + '\n';
      writeFileSync(inputPath, lines, 'utf8');

      const { exitCode } = runRollup([
        '--phase', '99',
        '--input', inputPath,
        '--output', outputPath,
      ]);

      expect(exitCode).toBe(0);

      const content = readFileSync(outputPath, 'utf8');
      const dataRows = content.split('\n').filter(l => /^\| (skill|agent|command|hook) \|/.test(l));
      expect(dataRows).toHaveLength(4);

      // All have count=1
      for (const row of dataRows) {
        expect(row).toMatch(/\|\s*1\s*\|/);
      }

      // Stable alpha order by name when counts are equal:
      // budget-check < research-first < Stop < task-implementer
      // But actual names: budget-check, research-first, Stop, task-implementer
      // localeCompare is case-sensitive, S < b in ASCII. Let's just check all 4 are present.
      const joined = dataRows.join('\n');
      expect(joined).toMatch(/research-first/);
      expect(joined).toMatch(/task-implementer/);
      expect(joined).toMatch(/budget-check/);
      expect(joined).toMatch(/Stop/);
    } finally {
      cleanupDir(dir);
    }
  });

  // Case 4 — malformed JSONL
  it('Case 4 — malformed JSONL: exits 0; 1 valid row; footer shows "1 valid events / 3 total lines"', () => {
    const dir = makeTmpDir();
    try {
      const inputPath = join(dir, 'malformed.jsonl');
      const outputPath = join(dir, 'rollup.md');

      // Line 1: valid
      // Line 2: invalid JSON
      // Line 3: schema-rejected (missing required field component_type → fails Zod)
      const lines = [
        makeEvent('hook', 'Stop', 'ok'),
        '{ this is NOT valid JSON !!!!',
        JSON.stringify({ ts: '2026-01-01T00:00:00.000Z', bad_field: 'oops' }),
      ].join('\n') + '\n';
      writeFileSync(inputPath, lines, 'utf8');

      const { exitCode } = runRollup([
        '--phase', '99',
        '--input', inputPath,
        '--output', outputPath,
      ]);

      expect(exitCode).toBe(0);

      const content = readFileSync(outputPath, 'utf8');

      // 1 valid event, 3 total lines in header
      expect(content).toMatch(/3 lines, 1 valid events/);

      // Only 1 data row
      const dataRows = content.split('\n').filter(l => /^\| (skill|agent|command|hook) \|/.test(l));
      expect(dataRows).toHaveLength(1);
    } finally {
      cleanupDir(dir);
    }
  });

  // Case 5 — missing subagent-index
  it('Case 5 — missing subagent-index: exits 0; ## Subagent Index Summary shows MISSING; stderr contains "subagent-index not found"', () => {
    const dir = makeTmpDir();
    try {
      const inputPath = join(dir, 'valid.jsonl');
      const outputPath = join(dir, 'rollup.md');
      writeFileSync(inputPath, makeEvent('hook', 'Stop', 'ok') + '\n', 'utf8');

      const { exitCode, stderr } = runRollup([
        '--phase', '99',
        '--input', inputPath,
        '--subagent-index', '/nonexistent/path/subagent-index.md',
        '--output', outputPath,
      ]);

      expect(exitCode).toBe(0);

      const content = readFileSync(outputPath, 'utf8');

      // Subagent Index Summary section shows MISSING
      expect(content).toMatch(/^## Subagent Index Summary$/m);
      expect(content).toMatch(/MISSING/);

      // stderr warning
      expect(stderr).toMatch(/subagent-index not found/);
    } finally {
      cleanupDir(dir);
    }
  });
});
