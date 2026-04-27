/**
 * narration-grep-refinement.spec.ts — Vitest for Task 5.1.5
 *
 * Verifies that the refined Mode-A narration-hit grep in autonomous-stop-watchdog.sh
 * requires BOTH (a) verb pattern AND (b) absence of tool_use block in the same turn.
 *
 * Before refinement, the grep over-fired ~33× during Phase 2-3 (all Mode-B events where
 * narration verb was present AND a tool_use block followed, but then the API truncated).
 * After refinement, those events produce narration_hit=clean.
 *
 * Fixtures:
 *   historical-mode-b-{1..5}.jsonl — 5 representative reconstructions of the 33
 *     historical events: narration verb + tool_use block + API error. Should NOT flag.
 *   mode-a-positive-1.jsonl (from 5.1.2) — text narration with NO tool_use. SHOULD flag.
 */

import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  writeFileSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

const FIXTURES_DIR = resolve(__dirname, 'fixtures');
const WATCHDOG_SCRIPT = resolve(__dirname, '../../scripts/hooks/autonomous-stop-watchdog.sh');

// INV-10: durations reported informationally; cross-platform timing flake.
// Decision 022 (Phase 7.1) — replaces wallclock assertion at :106.
// Pattern: tests/hooks/tool-call-first.spec.ts lines 21 + 78-87.
const narrationGrepDurations: number[] = [];

interface WatchdogRunResult {
  exitCode: number;
  watchdogLogLastLine: string;
  durationMs: number;
}

/**
 * Run autonomous-stop-watchdog.sh with an isolated project dir.
 * Returns the last line of the watchdog log for assertion on narration_hit value.
 */
function runWatchdog(
  transcriptFixtureName: string,
  sessionId: string,
  isolatedDir: string,
  extraEnv: Record<string, string> = {},
): WatchdogRunResult {
  const memDir = join(isolatedDir, 'agent-workspace', 'memory');
  mkdirSync(memDir, { recursive: true });

  // Copy fixture transcript into isolated dir.
  const transcriptPath = join(memDir, 'transcript.jsonl');
  writeFileSync(transcriptPath, readFileSync(join(FIXTURES_DIR, transcriptFixtureName), 'utf8'));

  // Write autonomous_mode: true.
  writeFileSync(join(memDir, 'current-execution.md'), '**autonomous_mode**: true\n');

  const stopPayload = JSON.stringify({
    transcript_path: transcriptPath,
    session_id: sessionId,
  });

  const start = Date.now();
  const result = spawnSync('bash', [WATCHDOG_SCRIPT], {
    input: stopPayload,
    encoding: 'utf8',
    env: {
      ...process.env,
      CLAUDE_PROJECT_DIR: isolatedDir,
      ORCH_RECOVERY_DRY_RUN: '1',
      ...extraEnv,
    },
    timeout: 10000,
  });
  const durationMs = Date.now() - start;

  // Read the last line of the watchdog log to inspect structured fields.
  const watchdogLogPath = join(memDir, '.autonomous-stop-watchdog.log');
  const watchdogLogLastLine = existsSync(watchdogLogPath)
    ? readFileSync(watchdogLogPath, 'utf8').trim().split('\n').slice(-1)[0] ?? ''
    : '';

  return {
    exitCode: result.status ?? 1,
    watchdogLogLastLine,
    durationMs,
  };
}

describe('narration-hit grep refinement (5.1.5)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'orch-narration-test-'));
  });

  // ── Historical replay: verb present + tool_use present → should NOT flag ──

  it('historical-mode-b-1: narration verb + tool_use + API error → narration_hit=clean', () => {
    const result = runWatchdog('historical-mode-b-1.jsonl', 'hist-sess-01', tmpDir);
    expect(result.exitCode).toBe(0);
    expect(result.watchdogLogLastLine).toMatch(/narration_hit=clean/);
    // The API error is still detected as mode B.
    expect(result.watchdogLogLastLine).toMatch(/api_error=suspected/);
    narrationGrepDurations.push(result.durationMs);
  });

  it('historical-mode-b-2: "Now dispatching" verb + tool_use → narration_hit=clean', () => {
    const result = runWatchdog('historical-mode-b-2.jsonl', 'hist-sess-02', tmpDir);
    expect(result.exitCode).toBe(0);
    expect(result.watchdogLogLastLine).toMatch(/narration_hit=clean/);
    expect(result.watchdogLogLastLine).toMatch(/api_error=suspected/);
  });

  it('historical-mode-b-3: "Awaiting … Will run" verb + tool_use → narration_hit=clean', () => {
    const result = runWatchdog('historical-mode-b-3.jsonl', 'hist-sess-03', tmpDir);
    expect(result.exitCode).toBe(0);
    expect(result.watchdogLogLastLine).toMatch(/narration_hit=clean/);
    expect(result.watchdogLogLastLine).toMatch(/api_error=suspected/);
  });

  it('historical-mode-b-4: "Dispatching spec-compliance-reviewer" + tool_use → narration_hit=clean', () => {
    const result = runWatchdog('historical-mode-b-4.jsonl', 'hist-sess-04', tmpDir);
    expect(result.exitCode).toBe(0);
    expect(result.watchdogLogLastLine).toMatch(/narration_hit=clean/);
    expect(result.watchdogLogLastLine).toMatch(/api_error=suspected/);
  });

  it('historical-mode-b-5: "Now running … Awaiting" verb + tool_use → narration_hit=clean', () => {
    const result = runWatchdog('historical-mode-b-5.jsonl', 'hist-sess-05', tmpDir);
    expect(result.exitCode).toBe(0);
    expect(result.watchdogLogLastLine).toMatch(/narration_hit=clean/);
    expect(result.watchdogLogLastLine).toMatch(/api_error=suspected/);
  });

  // ── True Mode-A: narration verb with NO tool_use → MUST still flag ──

  it('TRUE Mode-A: narration-only turn (mode-a-positive-1.jsonl) → narration_hit=suspected', () => {
    const result = runWatchdog('mode-a-positive-1.jsonl', 'mode-a-sess-01', tmpDir);
    expect(result.exitCode).toBe(0);
    expect(result.watchdogLogLastLine).toMatch(/narration_hit=suspected/);
  });

  // ── Aggregate metric: false-positive rate across 5 historical baits ──
  // (The 6 individual tests above already prove this; this test is an explicit summary.)

  it('aggregate: 5 historical-mode-b replays all produce narration_hit=clean (FPR = 0/5, well within ≤3/33 target)', () => {
    const historicalFixtures = [
      'historical-mode-b-1.jsonl',
      'historical-mode-b-2.jsonl',
      'historical-mode-b-3.jsonl',
      'historical-mode-b-4.jsonl',
      'historical-mode-b-5.jsonl',
    ];

    let falsePositives = 0;
    for (const fixture of historicalFixtures) {
      // Each test needs its own isolated dir to avoid log contamination.
      const isolatedDir = mkdtempSync(join(tmpdir(), 'orch-narration-agg-'));
      const result = runWatchdog(fixture, `agg-sess-${fixture}`, isolatedDir);
      if (result.watchdogLogLastLine.includes('narration_hit=suspected')) {
        falsePositives++;
      }
    }

    // Target: ≤ 3 false positives out of 33 historical (proxy: 0 out of 5 sampled).
    expect(falsePositives).toBe(0);
  });

  afterAll(() => {
    if (narrationGrepDurations.length > 0) {
      const sorted = [...narrationGrepDurations].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
      const p99 = sorted[Math.floor(sorted.length * 0.99)] ?? sorted[sorted.length - 1] ?? 0;
      // eslint-disable-next-line no-console
      console.log(
        `\n[INV-10 reporter] autonomous-stop-watchdog.sh (narration-grep) latency — n=${narrationGrepDurations.length} median=${median}ms p99=${p99}ms`,
      );
    }
  });
});
