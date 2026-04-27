/**
 * emit-phase-complete.ts — Template-driven generator for phase-N-complete.md.
 *
 * Reads tests-baseline.json + a Mustache-style template; substitutes
 * {{ key }} placeholders; writes the output file.
 *
 * Substitution uses simple str.replace(/\{\{\s*key\s*\}\}/g, val) —
 * NO Mustache library dependency (P2 simplicity).
 *
 * Usage:
 *   pnpm tsx scripts/utilities/emit-phase-complete.ts \
 *     --phase 5 --output agent-workspace/memory/phase-5-complete.md
 *
 * INV-S6: does NOT git commit.
 * INV-S7: no Prisma / SQLite work — plain files only.
 * INV-S10: writes ONLY to --output path.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readBaseline } from './emit-tests-baseline.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ScorecardRow {
  id: string;
  status: 'PASS' | 'PARTIAL' | 'DEFER';
  evidence: string;
}

export interface PhaseCompleteOptions {
  phaseId: string;
  templatePath: string;
  baselinePath: string;
  outputPath: string;
  scorecard: ScorecardRow[];
}

/**
 * Render a phase-N-complete.md from a template + baseline data.
 */
export async function emitPhaseComplete(
  opts: PhaseCompleteOptions,
): Promise<void> {
  const baseline = readBaseline(opts.baselinePath);

  // Find the per_phase row for this phase — fall back to zeros if not present
  const phaseRow = baseline.per_phase.find((r) => r.phase_id === opts.phaseId);
  const testsPassed = phaseRow?.tests_passed ?? 0;
  const testsTotal = phaseRow?.tests_total ?? 0;

  const scorecardTable = renderScorecardTable(opts.scorecard);

  const template = readFileSync(opts.templatePath, 'utf-8');

  const now = new Date().toISOString();
  const rendered = substituteTemplate(template, {
    phase_id: opts.phaseId,
    tests_passed: String(testsPassed),
    tests_total: String(testsTotal),
    scorecard_table: scorecardTable,
    generated_at: now,
  });

  writeFileSync(opts.outputPath, rendered, 'utf-8');
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Substitute all {{ key }} placeholders in template using simple string replace.
 * No Mustache library — P2 simplicity.
 */
export function substituteTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    const pattern = new RegExp(`\\{\\{\\s*${escapeRegExp(key)}\\s*\\}\\}`, 'g');
    result = result.replace(pattern, value);
  }
  return result;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function renderScorecardTable(scorecard: ScorecardRow[]): string {
  if (scorecard.length === 0) {
    return '*(no scorecard rows)*';
  }

  const header = '| ID | Status | Evidence |';
  const divider = '|---|---|---|';
  const rows = scorecard.map(
    (r) => `| ${r.id} | ${r.status} | ${r.evidence} |`,
  );

  return [header, divider, ...rows].join('\n');
}

// ---------------------------------------------------------------------------
// CLI entrypoint
// ---------------------------------------------------------------------------

interface CliArgs {
  phaseId: string;
  templatePath: string;
  baselinePath: string;
  outputPath: string;
}

function parseArgs(args: string[]): CliArgs {
  let phaseId = '';
  let outputPath = '';
  let templatePath = resolve(
    process.cwd(),
    'scripts/utilities/templates/phase-complete.template.md',
  );
  let baselinePath = resolve(
    process.cwd(),
    'agent-workspace/memory/tests-baseline.json',
  );

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--phase' && args[i + 1] !== undefined) {
      phaseId = args[++i]!;
    } else if (arg === '--output' && args[i + 1] !== undefined) {
      outputPath = resolve(process.cwd(), args[++i]!);
    } else if (arg === '--template' && args[i + 1] !== undefined) {
      templatePath = resolve(process.cwd(), args[++i]!);
    } else if (arg === '--baseline' && args[i + 1] !== undefined) {
      baselinePath = resolve(process.cwd(), args[++i]!);
    }
  }

  if (!phaseId) {
    throw new Error('--phase <id> is required');
  }
  if (!outputPath) {
    throw new Error('--output <path> is required');
  }

  return { phaseId, templatePath, baselinePath, outputPath };
}

const isMain =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]).replace(/\\/g, '/').endsWith(
    'scripts/utilities/emit-phase-complete',
  ) ||
  process.argv[1] !== undefined &&
  resolve(process.argv[1]).replace(/\\/g, '/').endsWith(
    'scripts/utilities/emit-phase-complete.ts',
  );

if (isMain) {
  const { phaseId, templatePath, baselinePath, outputPath } = parseArgs(
    process.argv.slice(2),
  );

  emitPhaseComplete({
    phaseId,
    templatePath,
    baselinePath,
    outputPath,
    scorecard: [],
  })
    .then(() => {
      process.stdout.write(`phase-complete written to: ${outputPath}\n`);
    })
    .catch((err: unknown) => {
      process.stderr.write(
        `emit-phase-complete error: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      process.exit(1);
    });
}
