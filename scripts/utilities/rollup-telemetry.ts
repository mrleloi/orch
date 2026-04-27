/**
 * rollup-telemetry.ts — Phase-aware aggregator (extended in Phase 6.2.2)
 *
 * Reads component-telemetry.jsonl, groups events by (component_type, component_name),
 * computes per-component statistics (count, success_rate, p50/p99 duration_ms,
 * p50/p99 tokens_real, top-3 failure_modes), and emits a markdown rollup.
 *
 * Usage:
 *   pnpm tsx scripts/utilities/rollup-telemetry.ts \
 *     --phase 6 \
 *     --input agent-workspace/memory/component-telemetry.jsonl \
 *     --subagent-index agent-workspace/memory/subagent-index.md \
 *     --output agent-workspace/memory/component-rollup-phase-6.md
 *
 * Exit codes:
 *   0  — success (malformed JSONL lines are silently skipped)
 *   1  — missing --phase or --input file ENOENT
 */

import { createReadStream, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Cross-package import via createRequire (scripts/ is ESM; packages/core/ is
// CJS — ESM named imports from CJS do not work with Node.js ESM static
// analysis; createRequire is the standard interop bridge).
// I-10: Uses ComponentEventSchema (Zod) for parsing; no manual JSON pruning.
// I-1: Script is pure aggregation — no LLM SDK imports.
// ---------------------------------------------------------------------------
const _require = createRequire(import.meta.url);
const _schemaModule = _require(
  resolve(dirname(fileURLToPath(import.meta.url)), '../../packages/core/src/telemetry/component-telemetry.schema.ts'),
) as {
  parseTelemetryLine: (line: string) => ComponentEvent | null;
  ComponentEventSchema: unknown;
};

type ComponentEvent = {
  component_type: 'skill' | 'agent' | 'command' | 'hook';
  component_name: string;
  outcome: 'ok' | 'reject' | 'timeout' | 'error' | 'no_op';
  duration_ms: number;
  tokens_real?: number;
  failure_mode: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | null;
  [k: string]: unknown;
};

function parseTelemetryLine(line: string): ComponentEvent | null {
  return _schemaModule.parseTelemetryLine(line);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RollupRow {
  component_type: ComponentEvent['component_type'];
  component_name: string;
  total_events: number;
  ok_count: number;
  error_count: number;
  timeout_count: number;
  reject_count: number;
  no_op_count: number;
  total_duration_ms: number;
  total_tokens_real: number;
  /** All duration_ms values collected (for percentile computation) */
  durations: number[];
  /** All tokens_real values collected (for percentile computation) */
  tokens: number[];
  /** Tally of failure_mode A..H occurrences */
  failure_mode_tally: Record<string, number>;
}

interface AggregatedRow {
  component_type: ComponentEvent['component_type'];
  component_name: string;
  count: number;
  success_rate: number;
  p50_duration_ms: number;
  p99_duration_ms: number;
  p50_tokens_real: number;
  p99_tokens_real: number;
  top_failure_modes: string;
}

// ---------------------------------------------------------------------------
// Core functions (skeleton surface preserved — B.5 contract)
// ---------------------------------------------------------------------------

/** Read all valid JSONL lines from a file, skip malformed ones. */
async function readJsonlFile(filePath: string): Promise<{ events: ComponentEvent[]; totalLines: number }> {
  const events: ComponentEvent[] = [];
  let totalLines = 0;
  const rl = createInterface({
    input: createReadStream(resolve(filePath)),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    totalLines += 1;
    const event = parseTelemetryLine(trimmed);
    if (event !== null) {
      events.push(event);
    }
  }
  return { events, totalLines };
}

/** Compute the percentile value from a sorted array using floor index. */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.floor(p * sorted.length);
  // Clamp to last element for p=0.99 when n is small
  return sorted[Math.min(idx, sorted.length - 1)] ?? 0;
}

/** Build top-3 failure modes string (e.g. "A:12,B:3,H:1"). Omit null mode. */
function buildTopFailureModes(tally: Record<string, number>): string {
  const entries = Object.entries(tally)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  return entries.map(([mode, count]) => `${mode}:${count}`).join(',');
}

/** Group events by (component_type, component_name) and compute rollup stats. */
function groupEvents(events: ComponentEvent[]): Map<string, AggregatedRow> {
  // First pass: accumulate raw data per group
  const raw = new Map<string, RollupRow>();
  for (const ev of events) {
    const key = `${ev.component_type}::${ev.component_name}`;
    const existing = raw.get(key);
    if (existing === undefined) {
      raw.set(key, {
        component_type: ev.component_type,
        component_name: ev.component_name,
        total_events: 1,
        ok_count: ev.outcome === 'ok' ? 1 : 0,
        error_count: ev.outcome === 'error' ? 1 : 0,
        timeout_count: ev.outcome === 'timeout' ? 1 : 0,
        reject_count: ev.outcome === 'reject' ? 1 : 0,
        no_op_count: ev.outcome === 'no_op' ? 1 : 0,
        total_duration_ms: ev.duration_ms,
        total_tokens_real: ev.tokens_real ?? 0,
        durations: [ev.duration_ms],
        tokens: [ev.tokens_real ?? 0],
        failure_mode_tally: ev.failure_mode !== null ? { [ev.failure_mode]: 1 } : {},
      });
    } else {
      existing.total_events += 1;
      existing.ok_count += ev.outcome === 'ok' ? 1 : 0;
      existing.error_count += ev.outcome === 'error' ? 1 : 0;
      existing.timeout_count += ev.outcome === 'timeout' ? 1 : 0;
      existing.reject_count += ev.outcome === 'reject' ? 1 : 0;
      existing.no_op_count += ev.outcome === 'no_op' ? 1 : 0;
      existing.total_duration_ms += ev.duration_ms;
      existing.total_tokens_real += ev.tokens_real ?? 0;
      existing.durations.push(ev.duration_ms);
      existing.tokens.push(ev.tokens_real ?? 0);
      if (ev.failure_mode !== null) {
        existing.failure_mode_tally[ev.failure_mode] =
          (existing.failure_mode_tally[ev.failure_mode] ?? 0) + 1;
      }
    }
  }

  // Second pass: compute aggregated stats
  const result = new Map<string, AggregatedRow>();
  for (const [key, row] of raw) {
    const sortedDurations = [...row.durations].sort((a, b) => a - b);
    const sortedTokens = [...row.tokens].sort((a, b) => a - b);
    const n = row.total_events;
    const successRate = n > 0 ? Math.round((row.ok_count / n) * 1000) / 1000 : 0;
    result.set(key, {
      component_type: row.component_type,
      component_name: row.component_name,
      count: n,
      success_rate: successRate,
      p50_duration_ms: percentile(sortedDurations, 0.5),
      p99_duration_ms: percentile(sortedDurations, 0.99),
      p50_tokens_real: percentile(sortedTokens, 0.5),
      p99_tokens_real: percentile(sortedTokens, 0.99),
      top_failure_modes: buildTopFailureModes(row.failure_mode_tally),
    });
  }
  return result;
}

/** Parse subagent-index.md rows; returns verdict class counts. */
function parseSubagentIndex(content: string): Record<string, number> {
  const tally: Record<string, number> = {};
  const lines = content.split('\n');
  for (const line of lines) {
    // Match table rows: | agentId | type | model | ... | verdict_class | source |
    const match = /^\|[^|]+\|[^|]+\|[^|]+\|[^|]+\|[^|]+\|[^|]+\|[^|]+\|[^|]+\|\s*([a-z_]+)\s*\|/.exec(line);
    if (match !== null && match[1] !== undefined) {
      const verdict = match[1].trim();
      // Skip header rows and separator rows
      if (verdict === 'verdict_class' || verdict.startsWith('-')) continue;
      tally[verdict] = (tally[verdict] ?? 0) + 1;
    }
  }
  return tally;
}

/** Emit the phase rollup markdown (B.3 structure). */
function emitMarkdown(
  rows: Map<string, AggregatedRow>,
  phaseLabel: string,
  inputPath: string,
  totalLines: number,
  validEvents: number,
  subagentIndexPath: string,
  subagentIndexMissing: boolean,
  subagentVerdicts: Record<string, number>,
): string {
  const now = new Date().toISOString();
  const subagentStatus = subagentIndexMissing
    ? 'MISSING'
    : `${Object.values(subagentVerdicts).reduce((a, b) => a + b, 0)} rows`;

  const lines: string[] = [
    `# Component Telemetry Rollup — Phase ${phaseLabel}`,
    '',
    `> Generated ${now} by \`scripts/utilities/rollup-telemetry.ts\`.`,
    `> Source: ${inputPath} (${totalLines} lines, ${validEvents} valid events).`,
    `> Subagent index: ${subagentIndexPath} (${subagentStatus}).`,
    '',
    '## Components',
    '',
    '| Type | Name | Count | Success Rate | p50 Dur (ms) | p99 Dur (ms) | p50 Tokens | p99 Tokens | Top Failure Modes |',
    '|------|------|------:|-------------:|-------------:|-------------:|-----------:|-----------:|-------------------|',
  ];

  // Sort DESC by count (Phase-5.5 SKELETON sort preserved; B.3 + D risk note)
  const sorted = [...rows.values()].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    // Stable secondary sort by name for equal counts (Case 3 test assertion)
    return a.component_name.localeCompare(b.component_name);
  });

  for (const row of sorted) {
    lines.push(
      `| ${row.component_type} | ${row.component_name} | ${row.count} | ${row.success_rate.toFixed(3)} | ${row.p50_duration_ms} | ${row.p99_duration_ms} | ${row.p50_tokens_real} | ${row.p99_tokens_real} | ${row.top_failure_modes} |`,
    );
  }

  lines.push('');
  lines.push('## Subagent Index Summary');
  lines.push('');
  lines.push('| Verdict Class | Count |');
  lines.push('|---|---:|');

  if (subagentIndexMissing) {
    lines.push('| MISSING | — |');
  } else if (Object.keys(subagentVerdicts).length === 0) {
    lines.push('| (no rows parsed) | 0 |');
  } else {
    const sortedVerdicts = Object.entries(subagentVerdicts).sort((a, b) => b[1] - a[1]);
    for (const [verdict, count] of sortedVerdicts) {
      lines.push(`| ${verdict} | ${count} |`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Parse --phase (REQUIRED)
  const phaseIdx = args.indexOf('--phase');
  const phase = phaseIdx >= 0 ? args[phaseIdx + 1] : undefined;
  if (phase === undefined || phase === '') {
    process.stderr.write('Usage: rollup-telemetry.ts --phase <N> [--input <path>] [--subagent-index <path>] [--output <path>]\n');
    process.exit(1);
  }

  // Parse --input (OPTIONAL; default)
  const inputIdx = args.indexOf('--input');
  const inputFile = (inputIdx >= 0 ? args[inputIdx + 1] : undefined)
    ?? 'agent-workspace/memory/component-telemetry.jsonl';

  // Parse --subagent-index (OPTIONAL)
  const subagentIdx = args.indexOf('--subagent-index');
  const subagentIndexPath = (subagentIdx >= 0 ? args[subagentIdx + 1] : undefined)
    ?? 'agent-workspace/memory/subagent-index.md';

  // Parse --output (OPTIONAL)
  const outputIdx = args.indexOf('--output');
  const outputFile = (outputIdx >= 0 ? args[outputIdx + 1] : undefined)
    ?? `agent-workspace/memory/component-rollup-phase-${phase}.md`;

  // Validate --input exists
  const resolvedInput = resolve(inputFile);
  if (!existsSync(resolvedInput)) {
    process.stderr.write(`rollup-telemetry: error: input file not found: ${resolvedInput}\n`);
    process.exit(1);
  }

  // Read events
  const { events, totalLines } = await readJsonlFile(inputFile);
  const validEvents = events.length;

  // Group and aggregate
  const grouped = groupEvents(events);

  // Read subagent index (degraded mode if missing)
  const resolvedSubagentIndex = resolve(subagentIndexPath);
  let subagentIndexMissing = false;
  let subagentVerdicts: Record<string, number> = {};

  if (!existsSync(resolvedSubagentIndex)) {
    process.stderr.write(`rollup-telemetry: warning: subagent-index not found: ${resolvedSubagentIndex}\n`);
    subagentIndexMissing = true;
  } else {
    const content = readFileSync(resolvedSubagentIndex, 'utf8');
    subagentVerdicts = parseSubagentIndex(content);
  }

  // Emit markdown
  const markdown = emitMarkdown(
    grouped,
    phase,
    inputFile,
    totalLines,
    validEvents,
    subagentIndexPath,
    subagentIndexMissing,
    subagentVerdicts,
  );

  // Write output
  const resolvedOutput = resolve(outputFile);
  writeFileSync(resolvedOutput, markdown, 'utf8');
  process.stdout.write(`rollup-telemetry: wrote ${resolvedOutput}\n`);
}

main().catch((err: unknown) => {
  process.stderr.write(`rollup-telemetry: error: ${String(err)}\n`);
  process.exit(1);
});
