/**
 * dispatch-recorder.spec.ts — Vitest wrapper for dispatch-jsonl-recorder.sh hook
 *
 * Cases mirror component-telemetry.spec.ts pattern:
 *   spawnSync + background-subshell poll (Atomics.wait) + isolated CLAUDE_PROJECT_DIR.
 *
 * Decision 023 schema: 9 mandatory fields per line.
 * INV-10 reporter pattern (no hard latency assertion per Decision 022).
 */

import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { loadTaskFinishRecordsFromDispatchJsonl } from '../../scripts/benchmarks/sc18-realworld.js';

const HOOK_SCRIPT = resolve(__dirname, '../../scripts/hooks/dispatch-jsonl-recorder.sh');

// Collected durations for INV-10 reporter
const durations: number[] = [];

// Decision 023 mandatory fields
const REQUIRED_FIELDS = [
  'event',
  'dispatch_id',
  'agent_type',
  'model',
  'parent_session_id',
  'bg',
  'ts_ms',
  'outcome',
  'tokens_used',
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeIsolatedDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'orch-dispatch-test-'));
  mkdirSync(join(dir, 'agent-workspace', 'memory'), { recursive: true });
  return dir;
}

function cleanupDir(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // best-effort
  }
}

interface HookRunResult {
  exitCode: number;
  jsonlLines: string[];
  durationMs: number;
}

function runHook(
  stdinPayload: string,
  isolatedDir: string,
  pollTimeoutMs = 5000,
): HookRunResult {
  const jsonlPath = join(isolatedDir, 'agent-workspace', 'memory', 'dispatch.jsonl');

  let preLineCount = 0;
  let preLastLine: string | null = null;
  if (existsSync(jsonlPath)) {
    const pre = readFileSync(jsonlPath, 'utf8');
    const preLines = pre.split('\n').filter((l) => l.trim().length > 0);
    preLineCount = preLines.length;
    preLastLine = preLines[preLines.length - 1] ?? null;
  }

  const start = Date.now();
  const result = spawnSync('bash', [HOOK_SCRIPT], {
    input: stdinPayload,
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: isolatedDir },
    timeout: 10_000,
  });
  const durationMs = Date.now() - start;
  durations.push(durationMs);

  // Poll for background subshell write (mirrors component-telemetry.spec.ts:91-108)
  const sab = new SharedArrayBuffer(4);
  const sabView = new Int32Array(sab);
  const deadline = Date.now() + pollTimeoutMs;
  let jsonlLines: string[] = [];

  while (Date.now() < deadline) {
    if (existsSync(jsonlPath)) {
      const content = readFileSync(jsonlPath, 'utf8');
      const lines = content.split('\n').filter((l) => l.trim().length > 0);
      const currentLast = lines[lines.length - 1] ?? null;
      if (lines.length !== preLineCount || currentLast !== preLastLine) {
        jsonlLines = lines;
        break;
      }
    }
    Atomics.wait(sabView, 0, 0, 20);
  }

  return { exitCode: result.status ?? 0, jsonlLines, durationMs };
}

function assertSchema(line: string): Record<string, unknown> {
  const obj = JSON.parse(line) as Record<string, unknown>;
  for (const f of REQUIRED_FIELDS) {
    expect(Object.prototype.hasOwnProperty.call(obj, f), `Missing field: ${f}`).toBe(true);
  }
  return obj;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('dispatch-jsonl-recorder.sh — capture roundtrip', () => {
  it('H1 — DISPATCHED: PreToolUse/Task payload writes one DISPATCHED line', () => {
    const dir = makeIsolatedDir();
    try {
      const payload = JSON.stringify({
        hook_event_name: 'PreToolUse',
        session_id: 'sess-H1',
        tool_name: 'Task',
        tool_use_id: 'toolu_01H1',
        tool_input: { subagent_type: 'task-implementer' },
      });
      const { exitCode, jsonlLines } = runHook(payload, dir);

      expect(exitCode).toBe(0);
      expect(jsonlLines.length).toBeGreaterThanOrEqual(1);

      const obj = assertSchema(jsonlLines[jsonlLines.length - 1]!);
      expect(obj['event']).toBe('DISPATCHED');
      expect(obj['dispatch_id']).toBe('toolu_01H1');
      expect(obj['agent_type']).toBe('task-implementer');
      expect(obj['model']).toBe('sonnet');
      expect(obj['bg']).toBe(true);
      expect(typeof obj['ts_ms']).toBe('number');
      expect((obj['ts_ms'] as number)).toBeGreaterThan(0);
      expect(obj['outcome']).toBeNull();
      expect(obj['tokens_used']).toBeNull();
    } finally {
      cleanupDir(dir);
    }
  });

  it('H2 — COMPLETED: SubagentStop with same agent_id retrieves agent_type from sidecar', () => {
    const dir = makeIsolatedDir();
    try {
      // First emit DISPATCHED (writes sidecar)
      const dispatchPayload = JSON.stringify({
        hook_event_name: 'PreToolUse',
        session_id: 'sess-H2',
        tool_name: 'Task',
        tool_use_id: 'toolu_01H2',
        tool_input: { subagent_type: 'task-implementer' },
      });
      const dispatched = runHook(dispatchPayload, dir);
      expect(dispatched.exitCode).toBe(0);

      // Then emit COMPLETED referencing same agent_id
      const stopPayload = JSON.stringify({
        hook_event_name: 'SubagentStop',
        session_id: 'sess-H2',
        agent_id: 'toolu_01H2',
        status: 'DONE',
      });
      const completed = runHook(stopPayload, dir);

      expect(completed.exitCode).toBe(0);
      expect(completed.jsonlLines.length).toBeGreaterThanOrEqual(2);

      const lastLine = completed.jsonlLines[completed.jsonlLines.length - 1]!;
      const obj = assertSchema(lastLine);
      expect(obj['event']).toBe('COMPLETED');
      expect(obj['dispatch_id']).toBe('toolu_01H2');
      expect(obj['agent_type']).toBe('task-implementer');
      expect(obj['outcome']).toBe('DONE');
      expect(obj['tokens_used']).toBeNull();
    } finally {
      cleanupDir(dir);
    }
  });

  it('H3 — non-Task PreToolUse is skipped (no line written)', () => {
    const dir = makeIsolatedDir();
    try {
      const payload = JSON.stringify({
        hook_event_name: 'PreToolUse',
        session_id: 'sess-H3',
        tool_name: 'Bash',
        tool_use_id: 'toolu_H3_bash',
      });
      // Short poll — we expect nothing to be written
      const { exitCode, jsonlLines } = runHook(payload, dir, 1500);

      expect(exitCode).toBe(0);
      expect(jsonlLines.length).toBe(0);
    } finally {
      cleanupDir(dir);
    }
  });

  it('H4 — SubagentStop without prior DISPATCHED falls back to unknown-agent', () => {
    const dir = makeIsolatedDir();
    try {
      const payload = JSON.stringify({
        hook_event_name: 'SubagentStop',
        session_id: 'sess-H4',
        agent_id: 'toolu_01H4_NEW',
        status: 'DONE',
      });
      const { exitCode, jsonlLines } = runHook(payload, dir);

      expect(exitCode).toBe(0);
      expect(jsonlLines.length).toBeGreaterThanOrEqual(1);

      const obj = assertSchema(jsonlLines[jsonlLines.length - 1]!);
      expect(obj['event']).toBe('COMPLETED');
      expect(obj['agent_type']).toBe('unknown-agent');
      expect(obj['model']).toBe('unknown');
    } finally {
      cleanupDir(dir);
    }
  });
});

describe('dispatch-jsonl-recorder.sh — schema + atomicity', () => {
  it('H5 — schema conformance: all 9 Decision 023 fields present on every line', () => {
    const dir = makeIsolatedDir();
    try {
      // Emit both DISPATCHED and COMPLETED
      const dispPayload = JSON.stringify({
        hook_event_name: 'PreToolUse',
        session_id: 'sess-H5',
        tool_name: 'Task',
        tool_use_id: 'toolu_H5',
        tool_input: { subagent_type: 'sandwich-architect' },
      });
      runHook(dispPayload, dir);

      const stopPayload = JSON.stringify({
        hook_event_name: 'SubagentStop',
        session_id: 'sess-H5',
        agent_id: 'toolu_H5',
        status: 'DONE',
      });
      const { jsonlLines } = runHook(stopPayload, dir);

      expect(jsonlLines.length).toBeGreaterThanOrEqual(2);
      for (const line of jsonlLines) {
        assertSchema(line);
      }
    } finally {
      cleanupDir(dir);
    }
  });

  it('H6 — concurrent writes: 3 simultaneous PreToolUse hooks produce 3 parseable JSONL lines', async () => {
    const dir = makeIsolatedDir();
    try {
      const jsonlPath = join(dir, 'agent-workspace', 'memory', 'dispatch.jsonl');
      const N = 3;

      // Fire N concurrent hooks
      await Promise.all(
        Array.from({ length: N }, (_, i) => {
          const payload = JSON.stringify({
            hook_event_name: 'PreToolUse',
            session_id: `sess-H6-${i}`,
            tool_name: 'Task',
            tool_use_id: `toolu_H6_${i}`,
            tool_input: { subagent_type: 'task-implementer' },
          });
          return new Promise<void>((res) => {
            spawnSync('bash', [HOOK_SCRIPT], {
              input: payload,
              encoding: 'utf8',
              env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
              timeout: 10_000,
            });
            res();
          });
        }),
      );

      // Poll for all 3 lines
      const deadline = Date.now() + 8000;
      let lines: string[] = [];
      while (Date.now() < deadline) {
        if (existsSync(jsonlPath)) {
          lines = readFileSync(jsonlPath, 'utf8').split('\n').filter((l) => l.trim());
          if (lines.length >= N) break;
        }
        await new Promise((r) => setTimeout(r, 50));
      }

      expect(lines.length).toBeGreaterThanOrEqual(N);
      // Every line must be valid JSON with all 9 fields (no corruption)
      for (const line of lines) {
        assertSchema(line);
      }
    } finally {
      cleanupDir(dir);
    }
  });
});

describe('dispatch-jsonl-recorder.sh — exact schema contract + round-trip', () => {
  // T2: exact 9-key contract — no extra or missing fields (Decision 023)
  it('T2 — schema has exactly the 9 Decision 023 fields, no extras', () => {
    const dir = makeIsolatedDir();
    try {
      const { jsonlLines } = runHook(
        JSON.stringify({ hook_event_name: 'PreToolUse', session_id: 'sess-T2',
          tool_name: 'Task', tool_use_id: 'toolu_T2', tool_input: { subagent_type: 'sandwich-architect' } }),
        dir,
      );
      expect(jsonlLines.length).toBeGreaterThanOrEqual(1);
      const parsed = JSON.parse(jsonlLines[jsonlLines.length - 1]!) as Record<string, unknown>;
      expect(Object.keys(parsed).sort()).toEqual([...REQUIRED_FIELDS].sort());
    } finally { cleanupDir(dir); }
  });

  // T4: round-trip — DISPATCHED+COMPLETED → loader returns TaskFinishRecord with correct finishTs
  it('T4 — round-trip: recorder emits → loadTaskFinishRecordsFromDispatchJsonl → finishTs matches COMPLETED ts_ms', async () => {
    const dir = makeIsolatedDir();
    try {
      const jsonlPath = join(dir, 'agent-workspace', 'memory', 'dispatch.jsonl');
      runHook(JSON.stringify({ hook_event_name: 'PreToolUse', session_id: 'sess-T4',
        tool_name: 'Task', tool_use_id: 'toolu_T4', tool_input: { subagent_type: 'task-implementer' } }), dir);
      const { jsonlLines } = runHook(JSON.stringify({
        hook_event_name: 'SubagentStop', session_id: 'sess-T4', agent_id: 'toolu_T4', status: 'DONE',
      }), dir);
      expect(jsonlLines.length).toBeGreaterThanOrEqual(2);
      const completedLine = jsonlLines.find((l) => {
        const o = JSON.parse(l) as Record<string, unknown>;
        return o['event'] === 'COMPLETED' && o['dispatch_id'] === 'toolu_T4';
      });
      expect(completedLine).toBeDefined();
      const completedTs = (JSON.parse(completedLine!) as Record<string, unknown>)['ts_ms'] as number;
      const records = await loadTaskFinishRecordsFromDispatchJsonl(jsonlPath);
      expect(records.length).toBeGreaterThanOrEqual(1);
      const matched = records.find((r) => r.taskId.includes('task-implementer'));
      expect(matched).toBeDefined();
      expect(matched!.finishTs).toBe(completedTs);
    } finally { cleanupDir(dir); }
  });
});

// ---------------------------------------------------------------------------
// INV-10 latency reporter (Decision 022 — no hard threshold; informational only)
// ---------------------------------------------------------------------------
afterAll(() => {
  if (durations.length === 0) return;
  const sorted = [...durations].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const p99 = sorted[Math.floor(sorted.length * 0.99)] ?? sorted[sorted.length - 1] ?? 0;
  console.log(
    `\n[INV-10 reporter] dispatch-jsonl-recorder.sh latency — n=${durations.length} median=${median}ms p99=${p99}ms`,
  );
});
