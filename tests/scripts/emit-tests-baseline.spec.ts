/**
 * emit-tests-baseline.spec.ts — Vitest tests for scripts/utilities/emit-tests-baseline.ts
 *
 * Test cases per §3.3.D first table:
 *   1. Initializes baseline if missing
 *   2. Appends new phase entry
 *   3. Updates existing phase entry on re-run (idempotent)
 *   4. Roundtrip: written → re-read → counts equal
 *   (bonus) 5. Determinism: byte-stable serialization
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// Import under test
import {
  emitTestsBaseline,
  readBaseline,
  writeBaseline,
  serializeBaseline,
} from '../../scripts/utilities/emit-tests-baseline.js';
import { TestsBaselineSchema } from '../../scripts/utilities/tests-baseline.schema.js';

// Resolve fixture path relative to repo root (process.cwd() = repo root when run via pnpm)
const FIXTURE_VITEST_JSON = resolve(
  process.cwd(),
  'tests/scripts/fixtures/vitest-sample.json',
);

// Helper: seed baseline file with a given phase entry already present
function seedBaseline(
  dir: string,
  phases: Array<{
    phase_id: string;
    tests_total: number;
    tests_passed: number;
    notes?: string;
  }>,
): string {
  const filePath = join(dir, 'tests-baseline.json');
  const data = {
    schema_version: '1' as const,
    generated_at: '2026-01-01T00:00:00.000Z',
    totals: { passed: 0, failed: 0, skipped: 0 },
    per_phase: phases.map((p) => ({
      phase_id: p.phase_id,
      closed_at: '2026-01-01T00:00:00.000Z',
      tests_total: p.tests_total,
      tests_passed: p.tests_passed,
      ...(p.notes !== undefined ? { notes: p.notes } : {}),
    })),
    per_package: [],
  };
  writeBaseline(filePath, data);
  return filePath;
}

describe('emit-tests-baseline', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'orch-emit-baseline-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // Test 1: initializes baseline if missing
  // -------------------------------------------------------------------------
  it('initializes baseline if missing — file created; per_phase.length === 1; schema parses', async () => {
    const baselinePath = join(tmpDir, 'tests-baseline.json');

    expect(existsSync(baselinePath)).toBe(false);

    await emitTestsBaseline({
      vitestJsonOutputPath: FIXTURE_VITEST_JSON,
      baselineFilePath: baselinePath,
      phaseId: '5',
      notes: 'init run',
    });

    expect(existsSync(baselinePath)).toBe(true);

    const raw = JSON.parse(readFileSync(baselinePath, 'utf-8')) as unknown;
    const parsed = TestsBaselineSchema.parse(raw);

    expect(parsed.per_phase.length).toBe(1);
    expect(parsed.per_phase[0]?.phase_id).toBe('5');
    // Fixture has 6 passed, 1 failed, 0 skipped
    expect(parsed.per_phase[0]?.tests_passed).toBe(6);
    expect(parsed.per_phase[0]?.tests_total).toBe(7);
  });

  // -------------------------------------------------------------------------
  // Test 2: appends new phase entry
  // -------------------------------------------------------------------------
  it('appends new phase entry — per_phase.length === 2; phase 5 entry has correct counts', async () => {
    const baselinePath = seedBaseline(tmpDir, [
      { phase_id: '4', tests_total: 1000, tests_passed: 1000 },
    ]);

    await emitTestsBaseline({
      vitestJsonOutputPath: FIXTURE_VITEST_JSON,
      baselineFilePath: baselinePath,
      phaseId: '5',
    });

    const parsed = TestsBaselineSchema.parse(
      JSON.parse(readFileSync(baselinePath, 'utf-8')) as unknown,
    );

    expect(parsed.per_phase.length).toBe(2);
    const phase5 = parsed.per_phase.find((r) => r.phase_id === '5');
    expect(phase5).toBeDefined();
    expect(phase5?.tests_passed).toBe(6);
    expect(phase5?.tests_total).toBe(7);

    // Phase 4 row should remain untouched
    const phase4 = parsed.per_phase.find((r) => r.phase_id === '4');
    expect(phase4?.tests_total).toBe(1000);
  });

  // -------------------------------------------------------------------------
  // Test 3: updates existing phase entry on re-run (idempotent)
  // -------------------------------------------------------------------------
  it('updates existing phase entry on re-run — length stays 1; row counts updated', async () => {
    const baselinePath = seedBaseline(tmpDir, [
      { phase_id: '5', tests_total: 999, tests_passed: 900 },
    ]);

    // Re-run for same phase with new vitest output (fixture: 6/7)
    await emitTestsBaseline({
      vitestJsonOutputPath: FIXTURE_VITEST_JSON,
      baselineFilePath: baselinePath,
      phaseId: '5',
    });

    const parsed = TestsBaselineSchema.parse(
      JSON.parse(readFileSync(baselinePath, 'utf-8')) as unknown,
    );

    // Length should NOT grow
    expect(parsed.per_phase.length).toBe(1);

    // Counts should be the new fixture values, not the seed values
    const phase5 = parsed.per_phase[0];
    expect(phase5?.tests_passed).toBe(6);
    expect(phase5?.tests_total).toBe(7);
  });

  // -------------------------------------------------------------------------
  // Test 4: roundtrip — written → re-read → counts equal
  // -------------------------------------------------------------------------
  it('roundtrip: emit then readBaseline — totals.passed equals input passed count', async () => {
    const baselinePath = join(tmpDir, 'tests-baseline.json');

    const { added } = await emitTestsBaseline({
      vitestJsonOutputPath: FIXTURE_VITEST_JSON,
      baselineFilePath: baselinePath,
      phaseId: '5',
    });

    const reRead = readBaseline(baselinePath);

    expect(reRead.totals.passed).toBe(added.tests_passed);
    expect(reRead.totals.passed).toBe(6);
  });

  // -------------------------------------------------------------------------
  // Bonus test 5: determinism — byte-stable serialization
  // -------------------------------------------------------------------------
  it('serialization is byte-stable: two writes of same data produce identical bytes', () => {
    const data = TestsBaselineSchema.parse({
      schema_version: '1',
      generated_at: '2026-01-01T00:00:00.000Z',
      totals: { passed: 10, failed: 1, skipped: 0 },
      per_phase: [
        {
          phase_id: '3',
          closed_at: '2026-01-01T00:00:00.000Z',
          tests_total: 11,
          tests_passed: 10,
        },
      ],
      per_package: [
        { name: '@orch/core', passed: 10, failed: 1, skipped: 0 },
      ],
    });

    const out1 = serializeBaseline(data);
    const out2 = serializeBaseline(data);

    expect(out1).toBe(out2);

    // Verify keys are sorted within objects
    const parsed = JSON.parse(out1) as Record<string, unknown>;
    const topKeys = Object.keys(parsed);
    expect(topKeys).toEqual([...topKeys].sort());
  });
});
