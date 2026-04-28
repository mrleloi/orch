/**
 * dispatch-recorder.spec.ts — Vitest wrapper for dispatch-jsonl-recorder.sh hook
 *
 * Cases mirror component-telemetry.spec.ts pattern:
 *   spawnSync + background-subshell poll (Atomics.wait) + isolated CLAUDE_PROJECT_DIR.
 *
 * Decision 023 schema: 9 mandatory fields per line.
 * INV-S9 reporter pattern (no hard latency assertion per Decision 022).
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

// Collected durations for INV-S9 reporter
const durations: number[] = [];

// Decision 023 mandatory fields (v2: 10 fields — tool_use_id added for SC-39 Case γ)
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
  'tool_use_id',
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
  it('H1 — DISPATCHED: PreToolUse/Agent payload writes one DISPATCHED line', () => {
    const dir = makeIsolatedDir();
    try {
      const payload = JSON.stringify({
        hook_event_name: 'PreToolUse',
        session_id: 'sess-H1',
        tool_name: 'Agent',
        tool_use_id: 'toolu_01H1',
        tool_input: { subagent_type: 'task-implementer' },
      });
      const { exitCode, jsonlLines } = runHook(payload, dir);

      expect(exitCode).toBe(0);
      expect(jsonlLines.length).toBeGreaterThanOrEqual(1);

      const obj = assertSchema(jsonlLines[jsonlLines.length - 1]!);
      expect(obj['event']).toBe('DISPATCHED');
      expect(obj['dispatch_id']).toBe('toolu_01H1');
      expect(obj['tool_use_id']).toBe('toolu_01H1');
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
      // First emit DISPATCHED (writes sidecar with tool_use_id key)
      const dispatchPayload = JSON.stringify({
        hook_event_name: 'PreToolUse',
        session_id: 'sess-H2',
        tool_name: 'Agent',
        tool_use_id: 'toolu_01H2',
        tool_input: { subagent_type: 'task-implementer' },
      });
      const dispatched = runHook(dispatchPayload, dir);
      expect(dispatched.exitCode).toBe(0);

      // Then emit COMPLETED referencing same agent_id (no PostToolUse → fallback: sidecar
      // lookup by dispatch_id = tool_use_id since no hex index written yet)
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
      expect(obj['tool_use_id']).toBe('toolu_01H2');
      expect(obj['agent_type']).toBe('task-implementer');
      expect(obj['outcome']).toBe('DONE');
      expect(obj['tokens_used']).toBeNull();
    } finally {
      cleanupDir(dir);
    }
  });

  it('H3 — non-Agent PreToolUse is skipped (no line written)', () => {
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
  it('H5 — schema conformance: all 10 Decision 023 fields present on every line', () => {
    const dir = makeIsolatedDir();
    try {
      // Emit both DISPATCHED and COMPLETED
      const dispPayload = JSON.stringify({
        hook_event_name: 'PreToolUse',
        session_id: 'sess-H5',
        tool_name: 'Agent',
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
            tool_name: 'Agent',
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
      // Every line must be valid JSON with all 10 fields (no corruption)
      for (const line of lines) {
        assertSchema(line);
      }
    } finally {
      cleanupDir(dir);
    }
  });


  // H7 — malformed stdin payload: the hook must exit 0 and write nothing.
  // Rationale: the script guards malformed JSON with `trap 'exit 0' ERR` and
  // a fallback `HOOK_EVENT=""` path; this gap (no line written on bad input) is
  // untested by H1..H6.  Skipped on win32: bash stdin-piping behavior with
  // malformed payloads can differ between Git Bash / WSL flavours and produces
  // intermittent failures unrelated to the recorder's own logic.
  it.skipIf(process.platform === 'win32')(
    'H7 — malformed stdin: hook exits 0 and writes no JSONL line',
    () => {
      const dir = makeIsolatedDir();
      try {
        // Deliberately invalid JSON — triggers the `catch` branch in the
        // inline node parser which emits `HOOK_EVENT=""`, causing the hook
        // to exit early without appending to dispatch.jsonl.
        const { exitCode, jsonlLines } = runHook('{not valid json', dir, 1500);

        expect(exitCode).toBe(0);
        expect(jsonlLines.length).toBe(0);
      } finally {
        cleanupDir(dir);
      }
    },
  );
});

describe('dispatch-jsonl-recorder.sh — exact schema contract + round-trip', () => {
  // T2: exact 10-key contract — no extra or missing fields (Decision 023 v2 + SC-39 tool_use_id)
  it('T2 — schema has exactly the 10 Decision 023 fields, no extras', () => {
    const dir = makeIsolatedDir();
    try {
      const { jsonlLines } = runHook(
        JSON.stringify({ hook_event_name: 'PreToolUse', session_id: 'sess-T2',
          tool_name: 'Agent', tool_use_id: 'toolu_T2', tool_input: { subagent_type: 'sandwich-architect' } }),
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
        tool_name: 'Agent', tool_use_id: 'toolu_T4', tool_input: { subagent_type: 'task-implementer' } }), dir);
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
// SC-39 Case γ sidecar correlation tests
// ---------------------------------------------------------------------------

describe('dispatch-jsonl-recorder.sh — SC-39 Case γ sidecar correlation', () => {
  it('H8 — PreToolUse-Agent writes sidecar entry and DISPATCHED row with tool_use_id field', () => {
    const dir = makeIsolatedDir();
    try {
      const payload = JSON.stringify({
        hook_event_name: 'PreToolUse',
        session_id: 'sess-H8',
        tool_name: 'Agent',
        tool_use_id: 'toolu_TEST_001',
        tool_input: { subagent_type: 'test-impl' },
      });
      const { exitCode, jsonlLines } = runHook(payload, dir);

      expect(exitCode).toBe(0);
      expect(jsonlLines.length).toBeGreaterThanOrEqual(1);

      // DISPATCHED row must contain tool_use_id
      const obj = assertSchema(jsonlLines[jsonlLines.length - 1]!);
      expect(obj['event']).toBe('DISPATCHED');
      expect(obj['tool_use_id']).toBe('toolu_TEST_001');
      expect(obj['dispatch_id']).toBe('toolu_TEST_001');

      // Sidecar file must exist and contain the entry keyed by tool_use_id
      const sidecarPath = join(dir, 'agent-workspace', 'memory', '.dispatch-pending-sess-H8.jsonl');
      expect(existsSync(sidecarPath)).toBe(true);
      const sidecarContent = readFileSync(sidecarPath, 'utf8');
      const sidecarLines = sidecarContent.split('\n').filter((l) => l.trim().length > 0);
      expect(sidecarLines.length).toBeGreaterThanOrEqual(1);
      const sidecarEntry = JSON.parse(sidecarLines[0]!) as Record<string, unknown>;
      expect(sidecarEntry['tool_use_id']).toBe('toolu_TEST_001');
      expect(sidecarEntry['dispatch_id']).toBe('toolu_TEST_001');
    } finally {
      cleanupDir(dir);
    }
  });

  it('H9 — PostToolUse-Agent writes hex-keyed sidecar; SubagentStop emits COMPLETED with tool_use_id rewritten', () => {
    const dir = makeIsolatedDir();
    try {
      const SESSION = 'sess-H9';
      const TOOLU_ID = 'toolu_TEST_002';
      const HEX_AGENT_ID = 'a1bc30028d3af4315';

      // Step 1: PreToolUse-Agent → DISPATCHED + sidecar[toolu_*]
      runHook(JSON.stringify({
        hook_event_name: 'PreToolUse',
        session_id: SESSION,
        tool_name: 'Agent',
        tool_use_id: TOOLU_ID,
        tool_input: { subagent_type: 'task-implementer' },
      }), dir);

      // Step 2: PostToolUse-Agent → sidecar[hex_agent_id] index entry
      // Result text contains "agentId: <hex>" as returned by real Agent tool
      const postToolUsePayload = JSON.stringify({
        hook_event_name: 'PostToolUse',
        session_id: SESSION,
        tool_name: 'Agent',
        tool_use_id: TOOLU_ID,
        tool_response: {
          content: [{
            type: 'text',
            text: `agentId: ${HEX_AGENT_ID} (internal ID used for SubagentStop correlation)`,
          }],
        },
      });
      runHook(postToolUsePayload, dir, 3000);

      // Step 3: SubagentStop with hex agent_id → COMPLETED with dispatch_id = toolu_*
      const stopPayload = JSON.stringify({
        hook_event_name: 'SubagentStop',
        session_id: SESSION,
        agent_id: HEX_AGENT_ID,
        status: 'DONE',
      });
      const { exitCode, jsonlLines } = runHook(stopPayload, dir);

      expect(exitCode).toBe(0);
      expect(jsonlLines.length).toBeGreaterThanOrEqual(2);

      // COMPLETED row: dispatch_id must be rewritten to toolu_* (B.B.4)
      const completedLine = jsonlLines.find((l) => {
        const o = JSON.parse(l) as Record<string, unknown>;
        return o['event'] === 'COMPLETED';
      });
      expect(completedLine).toBeDefined();
      const completedObj = assertSchema(completedLine!);
      expect(completedObj['dispatch_id']).toBe(TOOLU_ID);
      expect(completedObj['tool_use_id']).toBe(TOOLU_ID);
      expect(completedObj['agent_type']).toBe('task-implementer');
      expect(completedObj['outcome']).toBe('DONE');
    } finally {
      cleanupDir(dir);
    }
  });

  // H10 — B.B.3: SubagentStop with NO prior DISPATCHED (no sidecar entry) must emit
  // tool_use_id: null (JSON null, not the string "null" or the hex agent_id).
  it('H10 — COMPLETED with no sidecar entry emits tool_use_id: null (B.B.3)', () => {
    const dir = makeIsolatedDir();
    try {
      // SubagentStop with a hex agent_id that has NO corresponding sidecar entry
      const HEX_AGENT_ID = 'deadbeef99abc1234';
      const payload = JSON.stringify({
        hook_event_name: 'SubagentStop',
        session_id: 'sess-H10',
        agent_id: HEX_AGENT_ID,
        status: 'DONE',
      });
      const { exitCode, jsonlLines } = runHook(payload, dir);

      expect(exitCode).toBe(0);
      expect(jsonlLines.length).toBeGreaterThanOrEqual(1);

      const lastLine = jsonlLines[jsonlLines.length - 1]!;
      // Must be valid JSON with all 10 fields
      const obj = assertSchema(lastLine);
      expect(obj['event']).toBe('COMPLETED');
      // dispatch_id falls back to hex agent_id (graceful degradation — spec B.B.4)
      expect(obj['dispatch_id']).toBe(HEX_AGENT_ID);
      // tool_use_id MUST be null (JSON null) on miss — spec B.B.3
      expect(obj['tool_use_id']).toBeNull();
      expect(obj['agent_type']).toBe('unknown-agent');
    } finally {
      cleanupDir(dir);
    }
  });
});

// ---------------------------------------------------------------------------
// INV-S9 latency reporter (Decision 022 — no hard threshold; informational only)
// INV-S9: skills/agents/hooks latency budget (50ms median, 200ms p99).
// INV-10 is "Typed External Input" — unrelated to latency; cross-ref corrected (MAJ-2).
// ---------------------------------------------------------------------------
afterAll(() => {
  if (durations.length === 0) return;
  const sorted = [...durations].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const p99 = sorted[Math.floor(sorted.length * 0.99)] ?? sorted[sorted.length - 1] ?? 0;
  console.log(
    `\n[INV-S9 reporter] dispatch-jsonl-recorder.sh latency — n=${durations.length} median=${median}ms p99=${p99}ms`,
  );
});
