/**
 * sc18-realworld.ts — Real-world SC-18 wallclock-improvement benchmark
 *
 * Derives substage attribution from session-log filenames + filesystem mtime.
 * Decision 019: production-telemetry replay; threshold ≥35% on ≥2 of 3 substages.
 *
 * Usage:
 *   pnpm tsx scripts/benchmarks/sc18-realworld.ts \
 *     [--sessions-dir <path>] [--output <path>] [--use-dispatch-jsonl <path>]
 *
 * Defaults:
 *   --sessions-dir  agent-workspace/memory/sessions/
 *   --output        agent-workspace/memory/sc18-realworld-result.md
 */

import { readdirSync, statSync, writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TaskFinishRecord {
  taskId: string;       // e.g. "6.1.2", "6.2.5"
  substage: '6.1' | '6.2' | '6.3';
  finishTs: number;     // ms epoch (filesystem mtime)
}

export interface SubstageResult {
  substage: '6.1' | '6.2' | '6.3';
  taskCount: number;
  wallclockActualMs: number;
  wallclockSerialBaselineMs: number;
  improvementRatio: number;     // 1 - (actual / serial); range [0..1]
  passesThreshold: boolean;     // improvementRatio >= 0.35
}

export interface SC18RealWorldReport {
  generatedAt: string;          // ISO-8601 UTC
  sessionsScanned: number;
  substages: SubstageResult[];
  passingSubstageCount: number;
  sc27Verdict: 'PASS' | 'PARTIAL' | 'FAIL';
  thresholdImprovement: 0.35;
  thresholdSubstageCount: 2;
  dataSource: 'dispatch.jsonl' | 'session-log-mtime';
}

// ---------------------------------------------------------------------------
// Pure functions
// ---------------------------------------------------------------------------

/**
 * Compute wallclock improvement for a single substage.
 * tasks must all belong to the same substage (caller's responsibility).
 */
export function computeSubstageImprovement(
  tasks: TaskFinishRecord[],
): SubstageResult {
  const substage: '6.1' | '6.2' | '6.3' =
    tasks.length > 0 ? tasks[0].substage : '6.1';

  if (tasks.length === 0) {
    return {
      substage,
      taskCount: 0,
      wallclockActualMs: 0,
      wallclockSerialBaselineMs: 0,
      improvementRatio: 0,
      passesThreshold: false,
    };
  }

  if (tasks.length === 1) {
    return {
      substage: tasks[0].substage,
      taskCount: 1,
      wallclockActualMs: 0,
      wallclockSerialBaselineMs: 0,
      improvementRatio: 0,
      passesThreshold: false,
    };
  }

  // Sort ascending by finishTs
  const sorted = [...tasks].sort((a, b) => a.finishTs - b.finishTs);
  const n = sorted.length;

  const wallclockActualMs = sorted[n - 1].finishTs - sorted[0].finishTs;

  // durations[i] = gap from task[i-1] to task[i] (for i in 1..n-1)
  const gaps: number[] = [];
  for (let i = 1; i < n; i++) {
    gaps.push(sorted[i].finishTs - sorted[i - 1].finishTs);
  }
  // First-task convention: durations[0] = durations[1] (i.e., gaps[0])
  const durations = [gaps[0], ...gaps];

  const wallclockSerialBaselineMs = durations.reduce((s, d) => s + d, 0);

  const improvementRatio =
    wallclockSerialBaselineMs > 0
      ? 1 - wallclockActualMs / wallclockSerialBaselineMs
      : 0;

  return {
    substage: sorted[0].substage,
    taskCount: n,
    wallclockActualMs,
    wallclockSerialBaselineMs,
    improvementRatio,
    passesThreshold: improvementRatio >= 0.35,
  };
}

/**
 * Aggregate per-substage results into a full SC-18 report.
 * Always emits exactly 3 SubstageResult entries (6.1, 6.2, 6.3).
 */
export function buildReport(
  records: TaskFinishRecord[],
  opts?: { dataSource?: 'dispatch.jsonl' | 'session-log-mtime' },
): SC18RealWorldReport {
  const dataSource = opts?.dataSource ?? 'session-log-mtime';
  const substageKeys: Array<'6.1' | '6.2' | '6.3'> = ['6.1', '6.2', '6.3'];

  const substages: SubstageResult[] = substageKeys.map((key) => {
    const subset = records.filter((r) => r.substage === key);
    if (subset.length === 0) {
      return {
        substage: key,
        taskCount: 0,
        wallclockActualMs: 0,
        wallclockSerialBaselineMs: 0,
        improvementRatio: 0,
        passesThreshold: false,
      };
    }
    const result = computeSubstageImprovement(subset);
    return { ...result, substage: key };
  });

  const passingSubstageCount = substages.filter((s) => s.passesThreshold).length;

  const sc27Verdict: 'PASS' | 'PARTIAL' | 'FAIL' =
    passingSubstageCount >= 2 ? 'PASS' : passingSubstageCount === 1 ? 'PARTIAL' : 'FAIL';

  return {
    generatedAt: new Date().toISOString(),
    sessionsScanned: records.length,
    substages,
    passingSubstageCount,
    sc27Verdict,
    thresholdImprovement: 0.35,
    thresholdSubstageCount: 2,
    dataSource,
  };
}

/**
 * Render the report as the canonical B.2 markdown template.
 */
export function renderMarkdown(report: SC18RealWorldReport): string {
  const fmt = (n: number) => n.toFixed(1);
  const pct = (r: number) => (r * 100).toFixed(1);

  const rows = report.substages.map((s) => {
    const threshold = s.passesThreshold ? 'PASS' : 'FAIL';
    return (
      `| ${s.substage.padEnd(8)} | ${String(s.taskCount).padStart(10)} ` +
      `| ${String(Math.round(s.wallclockActualMs)).padStart(21)} ` +
      `| ${String(Math.round(s.wallclockSerialBaselineMs)).padStart(30)} ` +
      `| ${pct(s.improvementRatio).padStart(10)}% ` +
      `| ${threshold.padEnd(16)} |`
    );
  });

  const k = report.passingSubstageCount;

  const methodologyLines =
    report.dataSource === 'dispatch.jsonl'
      ? [
          'Per SC-33: per-task `finishTs` is the COMPLETED event\'s `ts_ms` from `dispatch.jsonl ts_ms`',
          '(real wall time, not filesystem mtime). Substage attribution defaults to "6.1" pending',
          'v2.3 refinement (OQR-12).',
        ]
      : [
          'Per Decision 019: substage attribution is derived from session-log filenames',
          '(`2026-04-27-task-6.<S>.<N>-*.md`); per-task `finishTs` is the file\'s filesystem',
          'mtime; `wallclock_actual` = max(finishTs) − min(finishTs) within substage;',
          '`wallclock_serial_baseline` = sum of consecutive-task-gap durations (first task\'s gap',
          'defaulted to second-task gap per the architect doc §2 Q4 convention).',
          '',
          'Single-task substages return `improvementRatio = 0` (cannot parallelize one task).',
          '`task_id: null` in raw component-telemetry.jsonl precludes direct telemetry-grouping;',
          'session-log mtime is the SC-27 evidence proxy.',
        ];

  return [
    '# SC-18 Real-World Verification — Phase 6 Production Telemetry Replay',
    '',
    `> Generated ${report.generatedAt} by \`scripts/benchmarks/sc18-realworld.ts\`.`,
    '> Method: Decision 019 (production-telemetry replay).',
    '> Threshold: ≥35% improvement on ≥2 of 3 substages (Phase 5 retrospective §3.5 band).',
    `> Sessions scanned: ${report.sessionsScanned}.`,
    '',
    '## Headline',
    '',
    `**SC-27 verdict**: ${report.sc27Verdict}`,
    '',
    `(${k} of 3 substages met ≥35% threshold.)`,
    '',
    '## Per-Substage Results',
    '',
    '| Substage | Task Count | Wallclock Actual (ms) | Wallclock Serial Baseline (ms) | Improvement | Threshold (≥35%) |',
    '|----------|-----------:|----------------------:|-------------------------------:|------------:|------------------|',
    ...rows,
    '',
    '## Methodology',
    '',
    ...methodologyLines,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Filesystem boundary
// ---------------------------------------------------------------------------

const __moduleUrl = import.meta.url;
const __rootDir = resolve(dirname(fileURLToPath(__moduleUrl)), '../../');

const SESSION_LOG_RE =
  /^2026-04-27-task-(6\.(1|2|3))\.(\d+)[a-z]?-.*\.md$/;

/**
 * Read session-log filenames + mtime from sessionsDir.
 * Deduplicates by taskId (keeps latest mtime for 6.3.8a/8b style duplicates).
 */
export async function loadTaskFinishRecords(
  sessionsDir: string,
): Promise<TaskFinishRecord[]> {
  const entries = readdirSync(sessionsDir);
  const byTaskId = new Map<string, TaskFinishRecord>();

  for (const name of entries) {
    const m = SESSION_LOG_RE.exec(name);
    if (!m) continue;
    const substage = m[1] as '6.1' | '6.2' | '6.3';
    const taskId = `${m[1]}.${m[3]}`;
    const fullPath = resolve(sessionsDir, name);
    const finishTs = statSync(fullPath).mtime.getTime();

    const existing = byTaskId.get(taskId);
    if (!existing || finishTs > existing.finishTs) {
      byTaskId.set(taskId, { taskId, substage, finishTs });
    }
  }

  return [...byTaskId.values()].sort((a, b) => a.finishTs - b.finishTs);
}

// ---------------------------------------------------------------------------
// dispatch.jsonl replay loader (SC-33)
// ---------------------------------------------------------------------------

interface DispatchEvent {
  event: 'DISPATCHED' | 'COMPLETED';
  dispatch_id: string;
  agent_type: string;
  model: string;
  parent_session_id: string;
  bg: boolean;
  ts_ms: number;
  outcome: string | null;
  tokens_used: number | null;
}

/**
 * Load TaskFinishRecords from a dispatch.jsonl file (SC-33 replay path).
 * Per Decision 023: groups events by dispatch_id, pairs DISPATCHED+COMPLETED,
 * uses COMPLETED.ts_ms as finishTs (not filesystem mtime).
 */
export async function loadTaskFinishRecordsFromDispatchJsonl(
  dispatchJsonlPath: string,
): Promise<TaskFinishRecord[]> {
  if (!existsSync(dispatchJsonlPath)) {
    throw new Error(
      `dispatch.jsonl not found at ${dispatchJsonlPath}; either provide a valid path or omit --use-dispatch-jsonl`,
    );
  }

  const raw = readFileSync(dispatchJsonlPath, 'utf-8');
  const events: DispatchEvent[] = raw
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as DispatchEvent);

  // Group by dispatch_id
  const byId = new Map<string, { dispatched?: DispatchEvent; completed?: DispatchEvent }>();
  for (const ev of events) {
    const entry = byId.get(ev.dispatch_id) ?? {};
    if (ev.event === 'DISPATCHED') {
      entry.dispatched = ev;
    } else if (ev.event === 'COMPLETED') {
      entry.completed = ev;
    }
    byId.set(ev.dispatch_id, entry);
  }

  let orphanCount = 0;
  const records: TaskFinishRecord[] = [];

  for (const [, pair] of byId) {
    if (!pair.dispatched || !pair.completed) {
      orphanCount++;
      continue;
    }
    const dispatched = pair.dispatched;
    const completed = pair.completed;

    // taskId: <agent_type>-<parent_session_id[0..8]>-<dispatched.ts_ms>
    const taskId = `${dispatched.agent_type}-${dispatched.parent_session_id.slice(0, 8)}-${dispatched.ts_ms}`;
    // OQR-12 v2.2 simplification: all dispatch.jsonl tasks attributed to substage 6.1
    const substage: '6.1' = '6.1';
    // SC-33 PASS condition: use COMPLETED event ts_ms (not filesystem mtime)
    const finishTs = completed.ts_ms;

    records.push({ taskId, substage, finishTs });
  }

  if (orphanCount > 0) {
    console.warn(`sc18-realworld: skipped ${orphanCount} orphan dispatch event(s) (no paired DISPATCHED+COMPLETED)`);
  }

  return records.sort((a, b) => a.finishTs - b.finishTs);
}

// ---------------------------------------------------------------------------
// CLI entry
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): {
  sessionsDir: string;
  output: string;
  help: boolean;
  useDispatchJsonl: string | null;
} {
  const args = argv.slice(2);
  let sessionsDir = 'agent-workspace/memory/sessions/';
  let output = 'agent-workspace/memory/sc18-realworld-result.md';
  let help = false;
  let useDispatchJsonl: string | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--sessions-dir' && args[i + 1]) {
      sessionsDir = args[++i];
    } else if (args[i] === '--output' && args[i + 1]) {
      output = args[++i];
    } else if (args[i] === '--use-dispatch-jsonl' && args[i + 1]) {
      useDispatchJsonl = args[++i];
    } else if (args[i] === '--help' || args[i] === '-h') {
      help = true;
    }
  }

  return { sessionsDir, output, help, useDispatchJsonl };
}

async function main(): Promise<void> {
  const { sessionsDir, output, help, useDispatchJsonl } = parseArgs(process.argv);

  if (help) {
    console.log(
      'Usage: pnpm tsx scripts/benchmarks/sc18-realworld.ts [--sessions-dir <path>] [--output <path>] [--use-dispatch-jsonl <path>]\n' +
      '\n' +
      'Options:\n' +
      '  --sessions-dir <path>        Directory containing session log .md files\n' +
      '                               (default: agent-workspace/memory/sessions/)\n' +
      '  --output <path>              Output markdown file path\n' +
      '                               (default: agent-workspace/memory/sc18-realworld-result.md)\n' +
      '  --use-dispatch-jsonl <path>  Use dispatch.jsonl event log for SC-33 replay path\n' +
      '                               (per Decision 023; finishTs from COMPLETED.ts_ms, not mtime)\n' +
      '  --help, -h                   Show this help message\n',
    );
    return;
  }

  const resolvedSessionsDir = resolve(__rootDir, sessionsDir);
  const resolvedOutput = resolve(__rootDir, output);

  const records = useDispatchJsonl
    ? await loadTaskFinishRecordsFromDispatchJsonl(resolve(__rootDir, useDispatchJsonl))
    : await loadTaskFinishRecords(resolvedSessionsDir);
  const report = buildReport(records, { dataSource: useDispatchJsonl ? 'dispatch.jsonl' : 'session-log-mtime' });
  const md = renderMarkdown(report);

  mkdirSync(dirname(resolvedOutput), { recursive: true });
  writeFileSync(resolvedOutput, md, 'utf-8');

  console.log(`SC-27 verdict: ${report.sc27Verdict}`);
  console.log(`Sessions scanned: ${report.sessionsScanned}`);
  console.log(`Passing substages: ${report.passingSubstageCount}/3`);
  console.log(`Output written to: ${resolvedOutput}`);
}

if (__moduleUrl === pathToFileURL(process.argv[1] || '').href) {
  main().catch((err) => {
    console.error('sc18-realworld fatal:', err);
    process.exit(1);
  });
}
