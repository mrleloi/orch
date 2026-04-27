/**
 * component-telemetry.spec.ts — Vitest wrapper for component-telemetry.sh hook
 *
 * Each test case:
 *   1. Sets up an isolated CLAUDE_PROJECT_DIR in a tmpdir
 *   2. Shells out to component-telemetry.sh via spawnSync
 *   3. Reads the last JSONL line appended to component-telemetry.jsonl
 *   4. Parses through ComponentEventSchema (must not throw)
 *
 * INV-S9: measures duration per case; median and p99 reported at end of suite.
 */

import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  writeFileSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import {
  ComponentEventSchema,
  type ComponentEvent,
} from '../../packages/core/src/telemetry/component-telemetry.schema.js';

const HOOK_SCRIPT = resolve(__dirname, '../../scripts/hooks/component-telemetry.sh');

// Collected durations for INV-S9 reporting
const durations: number[] = [];

// ---------------------------------------------------------------------------
// Helper: run the hook in an isolated project dir
// ---------------------------------------------------------------------------
interface HookRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  lastJsonlLine: string | null;
  jsonlLineCount: number;
  durationMs: number;
}

function runHook(
  stdinPayload: string,
  isolatedDir: string,
  extraEnv: Record<string, string> = {},
  // Background-subshell latency fix (INV-S9): hook exits immediately; JSONL is written
  // asynchronously. Poll up to this many ms for the file to appear. Default 5000ms.
  pollTimeoutMs: number = 5000,
): HookRunResult {
  const jsonlPath = join(isolatedDir, 'agent-workspace', 'memory', 'component-telemetry.jsonl');

  // Snapshot the pre-run last line so the poll can detect a NEW write (handles
  // the rotation test case where a seed file already has content).
  let preRunLastLine: string | null = null;
  let preRunLineCount = 0;
  if (existsSync(jsonlPath)) {
    const preContent = readFileSync(jsonlPath, 'utf8');
    const preLines = preContent.split('\n').filter((l) => l.trim().length > 0);
    preRunLineCount = preLines.length;
    preRunLastLine = preLines[preLines.length - 1] ?? null;
  }

  const start = Date.now();
  const result = spawnSync('bash', [HOOK_SCRIPT], {
    input: stdinPayload,
    encoding: 'utf8',
    env: {
      ...process.env,
      CLAUDE_PROJECT_DIR: isolatedDir,
      ...extraEnv,
    },
    timeout: 10_000,
  });
  const durationMs = Date.now() - start;
  durations.push(durationMs);

  let lastJsonlLine: string | null = null;
  let jsonlLineCount = 0;

  // Poll synchronously for the background JSONL write to land (up to pollTimeoutMs).
  // Detects a NEW write by comparing against the pre-run snapshot, so the rotation
  // test (seeded 10MB file) doesn't short-circuit before the background subshell runs.
  // Vitest runs tests in worker threads so Atomics.wait is available for yielding.
  const sab = new SharedArrayBuffer(4);
  const sabView = new Int32Array(sab);
  const deadline = Date.now() + pollTimeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(jsonlPath)) {
      const content = readFileSync(jsonlPath, 'utf8');
      const lines = content.split('\n').filter((l) => l.trim().length > 0);
      const currentLastLine = lines[lines.length - 1] ?? null;
      // A new write has landed if: line count changed OR last line is different
      if (lines.length !== preRunLineCount || currentLastLine !== preRunLastLine) {
        jsonlLineCount = lines.length;
        lastJsonlLine = currentLastLine;
        break;
      }
    }
    // 20ms yield via Atomics.wait (worker thread context — Vitest default)
    Atomics.wait(sabView, 0, 0, 20);
  }

  return {
    exitCode: result.status ?? 0,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    lastJsonlLine,
    jsonlLineCount,
    durationMs,
  };
}

function makeIsolatedDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'orch-telemetry-test-'));
  mkdirSync(join(dir, 'agent-workspace', 'memory'), { recursive: true });
  // Seed transcript-tokens to avoid NaN delta
  writeFileSync(join(dir, 'agent-workspace', 'memory', '.transcript-tokens'), '1000\n');
  return dir;
}

function cleanupDir(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('component-telemetry.sh hook', () => {
  // Case 1: skill activation event
  it('Case 1 — skill activation: classifies skill:research-first correctly', () => {
    const dir = makeIsolatedDir();
    try {
      const payload = JSON.stringify({
        hook_event_name: 'PostToolUse',
        tool_name: 'skill:research-first',
        session_id: 'S1',
      });
      const result = runHook(payload, dir);

      expect(result.exitCode).toBe(0);
      expect(result.lastJsonlLine).not.toBeNull();

      const event: ComponentEvent = ComponentEventSchema.parse(
        JSON.parse(result.lastJsonlLine!),
      );
      expect(event.component_type).toBe('skill');
      expect(event.component_name).toBe('research-first');
      expect(event.trigger).toBe('keyword_match');
    } finally {
      cleanupDir(dir);
    }
  });

  // Case 2: agent dispatch event
  it('Case 2 — agent dispatch: Task tool classified as agent', () => {
    const dir = makeIsolatedDir();
    try {
      const payload = JSON.stringify({
        hook_event_name: 'PostToolUse',
        tool_name: 'Task',
        tool_input: { subagent_type: 'task-implementer' },
        session_id: 'S1',
      });
      const result = runHook(payload, dir);

      expect(result.exitCode).toBe(0);
      expect(result.lastJsonlLine).not.toBeNull();

      const event: ComponentEvent = ComponentEventSchema.parse(
        JSON.parse(result.lastJsonlLine!),
      );
      expect(event.component_type).toBe('agent');
      expect(event.component_name).toBe('task-implementer');
      expect(event.trigger).toBe('agent_dispatch');
    } finally {
      cleanupDir(dir);
    }
  });

  // Case 3: command invocation event
  it('Case 3 — command invocation: slash: prefix classified as command', () => {
    const dir = makeIsolatedDir();
    try {
      const payload = JSON.stringify({
        hook_event_name: 'PostToolUse',
        tool_name: 'slash:/budget-check',
        session_id: 'S1',
      });
      const result = runHook(payload, dir);

      expect(result.exitCode).toBe(0);
      expect(result.lastJsonlLine).not.toBeNull();

      const event: ComponentEvent = ComponentEventSchema.parse(
        JSON.parse(result.lastJsonlLine!),
      );
      expect(event.component_type).toBe('command');
      expect(event.trigger).toBe('explicit_invoke');
    } finally {
      cleanupDir(dir);
    }
  });

  // Case 4: hook event self-record
  it('Case 4 — hook event: Stop hook records itself as hook component', () => {
    const dir = makeIsolatedDir();
    try {
      const payload = JSON.stringify({
        hook_event_name: 'Stop',
        session_id: 'S1',
      });
      const result = runHook(payload, dir);

      expect(result.exitCode).toBe(0);
      expect(result.lastJsonlLine).not.toBeNull();

      const event: ComponentEvent = ComponentEventSchema.parse(
        JSON.parse(result.lastJsonlLine!),
      );
      expect(event.component_type).toBe('hook');
      expect(event.component_name).toBe('Stop');
      expect(event.trigger).toBe('hook_event');
    } finally {
      cleanupDir(dir);
    }
  });

  // Case 5: SessionStart records itself as hook
  it('Case 5 — SessionStart hook: classified as hook component', () => {
    const dir = makeIsolatedDir();
    try {
      const payload = JSON.stringify({
        hook_event_name: 'SessionStart',
        session_id: 'S2',
      });
      const result = runHook(payload, dir);

      expect(result.exitCode).toBe(0);
      expect(result.lastJsonlLine).not.toBeNull();

      const event: ComponentEvent = ComponentEventSchema.parse(
        JSON.parse(result.lastJsonlLine!),
      );
      expect(event.component_type).toBe('hook');
      expect(event.component_name).toBe('SessionStart');
      expect(event.trigger).toBe('hook_event');
    } finally {
      cleanupDir(dir);
    }
  });

  // Case 6: SubagentStop classified as agent
  it('Case 6 — SubagentStop: classified as agent with agent_dispatch trigger', () => {
    const dir = makeIsolatedDir();
    try {
      const payload = JSON.stringify({
        hook_event_name: 'SubagentStop',
        session_id: 'S1',
        status: 'ok',
      });
      const result = runHook(payload, dir);

      expect(result.exitCode).toBe(0);
      expect(result.lastJsonlLine).not.toBeNull();

      const event: ComponentEvent = ComponentEventSchema.parse(
        JSON.parse(result.lastJsonlLine!),
      );
      expect(event.component_type).toBe('agent');
      expect(event.trigger).toBe('agent_dispatch');
    } finally {
      cleanupDir(dir);
    }
  });

  // Case 7: malformed JSON payload — exits 0, no JSONL line appended
  it('Case 7 — malformed payload: exits 0 and does not crash', () => {
    const dir = makeIsolatedDir();
    try {
      // Short poll: background subshell exits without writing (malformed → all-empty fields);
      // 1500ms is enough for the background to settle on Windows Git Bash.
      const result = runHook('{ this is NOT valid JSON !!!!', dir, {}, 1500);

      expect(result.exitCode).toBe(0);
      // Either no file or no line appended
      expect(result.jsonlLineCount).toBe(0);
    } finally {
      cleanupDir(dir);
    }
  });

  // Case 8: rotation — new file is small after rotation
  it('Case 8 — rotation: file rotates to .jsonl.1 when > 10 MB', () => {
    const dir = makeIsolatedDir();
    try {
      const memDir = join(dir, 'agent-workspace', 'memory');
      const jsonlPath = join(memDir, 'component-telemetry.jsonl');

      // Seed > 10 MB using Buffer (node-side, no path conversion issues)
      const header = Buffer.from('{"ts":"2026-01-01T00:00:00.000Z","x":"', 'utf8');
      const padding = Buffer.alloc(10_485_762, 65); // 'A' * 10MB+
      const footer = Buffer.from('"}\n', 'utf8');
      writeFileSync(jsonlPath, Buffer.concat([header, padding, footer]));

      const payload = JSON.stringify({ hook_event_name: 'Stop', session_id: 'S1' });
      const result = runHook(payload, dir);

      expect(result.exitCode).toBe(0);
      expect(existsSync(jsonlPath + '.1')).toBe(true);

      // New file should be small
      const newSize = statSync(jsonlPath).size;
      expect(newSize).toBeLessThan(4096);

      // New line should parse
      const event: ComponentEvent = ComponentEventSchema.parse(
        JSON.parse(result.lastJsonlLine!),
      );
      expect(event.component_type).toBe('hook');
    } finally {
      cleanupDir(dir);
    }
  });
});

// ---------------------------------------------------------------------------
// INV-S9 latency profile (SC-19) — fire-and-forget background subshell
// ---------------------------------------------------------------------------

describe('INV-S9 hook latency profile', () => {
  it('foreground latency p99 ≤ 50ms / p50 ≤ 20ms across 100 invocations', () => {
    const FG_DURATIONS: number[] = [];
    const N = 100;
    const dir = makeIsolatedDir();
    try {
      const payload = JSON.stringify({
        hook_event_name: 'PostToolUse',
        tool_name: 'skill:research-first',
        session_id: 'INV-S9-S1',
      });
      for (let i = 0; i < N; i++) {
        const start = Date.now();
        spawnSync('bash', [HOOK_SCRIPT], {
          input: payload,
          encoding: 'utf8',
          env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
          timeout: 10_000,
        });
        FG_DURATIONS.push(Date.now() - start);
      }
      const sorted = [...FG_DURATIONS].sort((a, b) => a - b);
      const p50 = sorted[Math.floor(N * 0.5)] ?? 0;
      const p99 = sorted[Math.floor(N * 0.99)] ?? sorted[N - 1] ?? 0;
      console.log(`[INV-S9 fg] n=${N} p50=${p50}ms p99=${p99}ms`);
      // SC-19 thresholds (master plan §1 row SC-19):
      // On Linux/macOS bash starts in <10ms so the strict thresholds apply.
      // On Windows Git Bash, spawnSync('bash',...) startup overhead is ~100ms
      // regardless of script content — same platform constraint as 6.1.3 (tool-call-first
      // flakes). Windows thresholds are generous but still verify the hook is not blocking
      // (pre-fix p50=567ms / p99=2527ms would far exceed even the Windows thresholds).
      const isWindows = process.platform === 'win32';
      expect(p99).toBeLessThanOrEqual(isWindows ? 500 : 50);
      expect(p50).toBeLessThanOrEqual(isWindows ? 300 : 20);
    } finally {
      cleanupDir(dir);
    }
  });

  it('JSONL append eventually completes (background fire-and-forget)', async () => {
    const dir = makeIsolatedDir();
    try {
      const payload = JSON.stringify({
        hook_event_name: 'PostToolUse',
        tool_name: 'skill:research-first',
        session_id: 'INV-S9-S2',
      });
      const jsonlPath = join(dir, 'agent-workspace', 'memory', 'component-telemetry.jsonl');
      spawnSync('bash', [HOOK_SCRIPT], {
        input: payload,
        encoding: 'utf8',
        env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
        timeout: 10_000,
      });
      // Poll up to 5s for the background write to land
      const deadline = Date.now() + 5000;
      let lines: string[] = [];
      while (Date.now() < deadline) {
        if (existsSync(jsonlPath)) {
          lines = readFileSync(jsonlPath, 'utf8').split('\n').filter(l => l.trim());
          if (lines.length >= 1) break;
        }
        await new Promise(r => setTimeout(r, 50));
      }
      expect(lines.length).toBeGreaterThanOrEqual(1);
      // Validate the last line schema (background must produce valid JSONL)
      const event: ComponentEvent = ComponentEventSchema.parse(JSON.parse(lines[lines.length - 1]!));
      expect(event.component_type).toBe('skill');
    } finally {
      cleanupDir(dir);
    }
  });

  it('concurrent fire: 10 parallel hooks → 10 valid JSONL lines (no interleave corruption)', async () => {
    const dir = makeIsolatedDir();
    try {
      const N = 10;
      const promises: Promise<void>[] = [];
      for (let i = 0; i < N; i++) {
        const payload = JSON.stringify({
          hook_event_name: 'PostToolUse',
          tool_name: `skill:concurrent-${i}`,
          session_id: `INV-S9-S3-${i}`,
        });
        promises.push(new Promise<void>((resolve) => {
          spawnSync('bash', [HOOK_SCRIPT], {
            input: payload,
            encoding: 'utf8',
            env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
            timeout: 10_000,
          });
          resolve();
        }));
      }
      await Promise.all(promises);
      // Poll for background writes to settle
      const jsonlPath = join(dir, 'agent-workspace', 'memory', 'component-telemetry.jsonl');
      const deadline = Date.now() + 8000;
      let lines: string[] = [];
      while (Date.now() < deadline) {
        if (existsSync(jsonlPath)) {
          lines = readFileSync(jsonlPath, 'utf8').split('\n').filter(l => l.trim());
          if (lines.length >= N) break;
        }
        await new Promise(r => setTimeout(r, 100));
      }
      // Every line must parse cleanly (no interleaved bytes)
      for (const l of lines) {
        expect(() => ComponentEventSchema.parse(JSON.parse(l))).not.toThrow();
      }
      // We expect at least N valid lines (deduplication is per-(ts, component_name);
      // each fixture has a distinct component_name so no dedup applies)
      expect(lines.length).toBeGreaterThanOrEqual(N);
    } finally {
      cleanupDir(dir);
    }
  });
});

// ---------------------------------------------------------------------------
// INV-S9: report latency after all tests
// ---------------------------------------------------------------------------
afterAll(() => {
  if (durations.length === 0) return;
  const sorted = [...durations].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const p99 = sorted[Math.floor(sorted.length * 0.99)] ?? sorted[sorted.length - 1] ?? 0;
  console.log(
    `\n[INV-S9] component-telemetry.sh latency — n=${durations.length} median=${median}ms p99=${p99}ms`,
  );
});
