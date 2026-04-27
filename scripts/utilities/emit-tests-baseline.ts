/**
 * emit-tests-baseline.ts — Read vitest JSON reporter output; aggregate per-package;
 * write/update agent-workspace/memory/tests-baseline.json.
 *
 * Closes G-6: future phase-N-complete.md files cite the baseline instead of
 * hard-coding test counts.
 *
 * Usage:
 *   pnpm tsx scripts/utilities/emit-tests-baseline.ts \
 *     --vitest-json <path> --phase 5 [--notes "Phase 5 close"]
 *
 * INV-S6: does NOT git commit.
 * INV-S7: no Prisma / SQLite work — plain JSON only.
 * INV-S10: writes ONLY to tests-baseline.json (via --baseline arg or default path).
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { TestsBaselineSchema, type TestsBaseline, type PerPhaseEntry } from './tests-baseline.schema.js';

// ---------------------------------------------------------------------------
// Types for vitest JSON reporter output
// ---------------------------------------------------------------------------

interface VitestJsonResult {
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  numPendingTests: number;
  testResults: Array<{
    name: string; // absolute file path
    status: string;
    assertionResults: Array<{
      status: string;
    }>;
  }>;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface EmitOptions {
  vitestJsonOutputPath: string;
  baselineFilePath: string;
  phaseId: string;
  notes?: string;
}

/**
 * Read the vitest JSON output, aggregate per-package counts, and
 * append/update the per_phase row in tests-baseline.json.
 */
export async function emitTestsBaseline(
  opts: EmitOptions,
): Promise<{ added: PerPhaseEntry; total: number }> {
  const vitestJson = JSON.parse(
    readFileSync(opts.vitestJsonOutputPath, 'utf-8'),
  ) as VitestJsonResult;

  const perPackage = aggregatePerPackage(vitestJson);

  const passed = vitestJson.numPassedTests;
  const failed = vitestJson.numFailedTests;
  const skipped = vitestJson.numPendingTests;

  const baseline = readBaseline(opts.baselineFilePath);

  // Update totals to reflect the latest run
  baseline.totals = { passed, failed, skipped };

  // Build per_package (replace full list — this run is the authoritative count)
  baseline.per_package = perPackage;

  // Build per_phase entry
  const now = new Date().toISOString();
  const entry: PerPhaseEntry = {
    phase_id: opts.phaseId,
    closed_at: now,
    tests_total: passed + failed + skipped,
    tests_passed: passed,
    ...(opts.notes !== undefined ? { notes: opts.notes } : {}),
  };

  // Idempotent: update existing row for same phase_id, or append
  const idx = baseline.per_phase.findIndex((r) => r.phase_id === opts.phaseId);
  if (idx >= 0) {
    baseline.per_phase[idx] = entry;
  } else {
    baseline.per_phase.push(entry);
  }

  // Update generated_at timestamp
  baseline.generated_at = now;

  writeBaseline(opts.baselineFilePath, baseline);

  return { added: entry, total: passed + failed + skipped };
}

/**
 * Read tests-baseline.json, initializing it if it does not exist.
 * Validates schema on read.
 */
export function readBaseline(filePath: string): TestsBaseline {
  if (!existsSync(filePath)) {
    return initBaseline();
  }
  const raw = JSON.parse(readFileSync(filePath, 'utf-8')) as unknown;
  return TestsBaselineSchema.parse(raw);
}

/**
 * Write tests-baseline.json with deterministic key-sorted JSON.
 * Uses sorted-key replacer for byte-stable output across runs
 * (per §3.3.G — JSON.stringify with sorted-key replacer).
 */
export function writeBaseline(filePath: string, data: TestsBaseline): void {
  // Validate before writing
  TestsBaselineSchema.parse(data);
  writeFileSync(filePath, serializeBaseline(data), 'utf-8');
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function initBaseline(): TestsBaseline {
  return {
    schema_version: '1',
    generated_at: new Date().toISOString(),
    totals: { passed: 0, failed: 0, skipped: 0 },
    per_phase: [],
    per_package: [],
  };
}

/**
 * Serialize with a sorted-key replacer so output is byte-stable across runs
 * regardless of insertion order.
 */
export function serializeBaseline(data: TestsBaseline): string {
  return JSON.stringify(data, sortedKeyReplacer, 2) + '\n';
}

function sortedKeyReplacer(
  _key: string,
  value: unknown,
): unknown {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[k] = (value as Record<string, unknown>)[k];
    }
    return sorted;
  }
  return value;
}

/**
 * Infer package name from a test file absolute path.
 * Uses the conventional monorepo structure:
 *   …/packages/<name>/src/**  → @orch/<name>
 *   …/tests/**                → @orch/scripts-tests
 * Falls back to "unknown".
 */
function inferPackageName(filePath: string): string {
  // Normalize separators
  const normalized = filePath.replace(/\\/g, '/');

  const packagesMatch = /\/packages\/([^/]+)\//.exec(normalized);
  if (packagesMatch) {
    return `@orch/${packagesMatch[1]}`;
  }

  if (/\/tests\//.test(normalized)) {
    return '@orch/scripts-tests';
  }

  return 'unknown';
}

function aggregatePerPackage(
  vitestJson: VitestJsonResult,
): TestsBaseline['per_package'] {
  const map = new Map<
    string,
    { passed: number; failed: number; skipped: number }
  >();

  for (const suite of vitestJson.testResults) {
    const pkgName = inferPackageName(suite.name);

    if (!map.has(pkgName)) {
      map.set(pkgName, { passed: 0, failed: 0, skipped: 0 });
    }
    const entry = map.get(pkgName)!;

    for (const test of suite.assertionResults) {
      if (test.status === 'passed') {
        entry.passed += 1;
      } else if (test.status === 'failed') {
        entry.failed += 1;
      } else {
        entry.skipped += 1;
      }
    }
  }

  return Array.from(map.entries())
    .map(([name, counts]) => ({ name, ...counts }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// CLI entrypoint
// ---------------------------------------------------------------------------

interface ParsedArgs {
  vitestJsonOutputPath: string;
  baselineFilePath: string;
  phaseId: string;
  notes?: string;
}

function parseArgs(args: string[]): ParsedArgs {
  let vitestJsonOutputPath = '';
  let phaseId = '';
  let notes: string | undefined;
  let baselineFilePath = resolve(
    process.cwd(),
    'agent-workspace/memory/tests-baseline.json',
  );

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--vitest-json' && args[i + 1] !== undefined) {
      vitestJsonOutputPath = resolve(process.cwd(), args[++i]!);
    } else if (arg === '--phase' && args[i + 1] !== undefined) {
      phaseId = args[++i]!;
    } else if (arg === '--notes' && args[i + 1] !== undefined) {
      notes = args[++i];
    } else if (arg === '--baseline' && args[i + 1] !== undefined) {
      baselineFilePath = resolve(process.cwd(), args[++i]!);
    }
  }

  if (!vitestJsonOutputPath) {
    throw new Error('--vitest-json <path> is required');
  }
  if (!phaseId) {
    throw new Error('--phase <id> is required');
  }

  const result: ParsedArgs = { vitestJsonOutputPath, baselineFilePath, phaseId };
  if (notes !== undefined) {
    result.notes = notes;
  }
  return result;
}

// Only run as CLI when this file is the main module
const isMain =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]).replace(/\\/g, '/').endsWith(
    'scripts/utilities/emit-tests-baseline',
  ) ||
  process.argv[1] !== undefined &&
  resolve(process.argv[1]).replace(/\\/g, '/').endsWith(
    'scripts/utilities/emit-tests-baseline.ts',
  );

if (isMain) {
  const opts = parseArgs(process.argv.slice(2));
  emitTestsBaseline(opts)
    .then(({ added, total }) => {
      process.stdout.write(
        `tests-baseline updated: phase=${added.phase_id} passed=${added.tests_passed}/${added.tests_total} total_tests=${total}\n`,
      );
    })
    .catch((err: unknown) => {
      process.stderr.write(
        `emit-tests-baseline error: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      process.exit(1);
    });
}
