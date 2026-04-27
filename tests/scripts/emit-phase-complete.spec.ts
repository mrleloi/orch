/**
 * emit-phase-complete.spec.ts — Vitest tests for scripts/utilities/emit-phase-complete.ts
 *
 * Test cases per §3.3.D second table:
 *   5. Template substitution: tests_passed/tests_total replaced correctly
 *   6. Scorecard table emitted with correct row count and evidence cells
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  emitPhaseComplete,
  substituteTemplate,
  type ScorecardRow,
} from '../../scripts/utilities/emit-phase-complete.js';
import { writeBaseline } from '../../scripts/utilities/emit-tests-baseline.js';

// Resolve template path relative to repo root (process.cwd() = repo root when run via pnpm)
const TEMPLATE_PATH = resolve(
  process.cwd(),
  'scripts/utilities/templates/phase-complete.template.md',
);

describe('emit-phase-complete', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'orch-emit-phase-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // Test 5: template substitution
  // -------------------------------------------------------------------------
  it('substitutes tests_passed and tests_total from baseline phase row', async () => {
    // Build a baseline with phase 5 entry having 1500/1502
    const baselinePath = join(tmpDir, 'tests-baseline.json');
    writeBaseline(baselinePath, {
      schema_version: '1',
      generated_at: '2026-01-01T00:00:00.000Z',
      totals: { passed: 1500, failed: 2, skipped: 0 },
      per_phase: [
        {
          phase_id: '5',
          closed_at: '2026-01-01T00:00:00.000Z',
          tests_total: 1502,
          tests_passed: 1500,
        },
      ],
      per_package: [],
    });

    const outputPath = join(tmpDir, 'phase-5-complete.md');

    await emitPhaseComplete({
      phaseId: '5',
      templatePath: TEMPLATE_PATH,
      baselinePath,
      outputPath,
      scorecard: [],
    });

    const content = readFileSync(outputPath, 'utf-8');
    // The template contains: `{{ tests_passed }}` passed / `{{ tests_total }}` total
    expect(content).toContain('1500');
    expect(content).toContain('1502');
    // Ensure no unreplaced placeholders remain for tests_passed / tests_total
    expect(content).not.toContain('{{ tests_passed }}');
    expect(content).not.toContain('{{ tests_total }}');
    // Phase id should be substituted
    expect(content).not.toContain('{{ phase_id }}');
    expect(content).toContain('Phase 5');
  });

  // -------------------------------------------------------------------------
  // Test 6: scorecard table emitted with correct structure
  // -------------------------------------------------------------------------
  it('emits markdown table with 3 scorecard rows; each row has evidence cell', async () => {
    const baselinePath = join(tmpDir, 'tests-baseline.json');
    writeBaseline(baselinePath, {
      schema_version: '1',
      generated_at: '2026-01-01T00:00:00.000Z',
      totals: { passed: 0, failed: 0, skipped: 0 },
      per_phase: [],
      per_package: [],
    });

    const scorecard: ScorecardRow[] = [
      { id: 'SC-1', status: 'PASS', evidence: 'test output clean' },
      { id: 'SC-2', status: 'PARTIAL', evidence: 'minor concern noted' },
      { id: 'SC-3', status: 'DEFER', evidence: 'deferred to phase 6' },
    ];

    const outputPath = join(tmpDir, 'phase-5-complete.md');

    await emitPhaseComplete({
      phaseId: '5',
      templatePath: TEMPLATE_PATH,
      baselinePath,
      outputPath,
      scorecard,
    });

    const content = readFileSync(outputPath, 'utf-8');

    // Should have 3 data rows plus header + divider = 5 table lines minimum
    const tableLines = content
      .split('\n')
      .filter((l) => l.startsWith('|'));
    expect(tableLines.length).toBeGreaterThanOrEqual(5);

    // Each scorecard row should appear
    expect(content).toContain('SC-1');
    expect(content).toContain('SC-2');
    expect(content).toContain('SC-3');

    // Evidence cells should be present
    expect(content).toContain('test output clean');
    expect(content).toContain('minor concern noted');
    expect(content).toContain('deferred to phase 6');

    // Status values
    expect(content).toContain('PASS');
    expect(content).toContain('PARTIAL');
    expect(content).toContain('DEFER');
  });

  // -------------------------------------------------------------------------
  // Unit test for substituteTemplate helper (pure function)
  // -------------------------------------------------------------------------
  it('substituteTemplate: replaces multiple occurrences and handles spaces around key', () => {
    const tmpl = 'Tests: {{ tests_passed }}/{{ tests_total }}. Phase: {{phase_id}}.';
    const result = substituteTemplate(tmpl, {
      tests_passed: '1500',
      tests_total: '1502',
      phase_id: '5',
    });
    expect(result).toBe('Tests: 1500/1502. Phase: 5.');
  });
});
