/**
 * mode-c-guard.spec.ts — Vitest for Mode-C premature-wind-down hard guard (SC-3)
 *
 * Tests the Phase 5.1 Mode-C guard block appended to scripts/hooks/budget-watchdog.sh.
 * The guard emits {"decision":"block","reason":"..."} JSON to stdout when the LLM
 * ends a turn citing budget pressure but real tokens are well below the threshold.
 *
 * Trigger conditions (ALL five must hold):
 *   1. HOOK_EVENT == "Stop"
 *   2. autonomous_mode == true (current-execution.md)
 *   3. real tokens (TOTAL) < ORCH_WIND_DOWN_TOKENS - 20000 (default < 180K)
 *   4. .wind-down marker absent
 *   5. last 200 lines of transcript contain a rationalization phrase
 *
 * Fixtures:
 *   mode-c-positive-1.jsonl — "approaching 200K" phrase, usage=120K tokens
 *   mode-c-positive-2.jsonl — "give next task fresh envelope" phrase, usage=80K tokens
 *   mode-c-positive-3.jsonl — "past 150K soft-prep" phrase, usage=160K tokens
 *   mode-c-clean-1.jsonl    — normal task progress, tool_use present (no phrase)
 *   mode-c-clean-2.jsonl    — "approaching 200K" phrase but usage=185K (>= soft limit)
 *   mode-c-clean-3.jsonl    — "approaching 200K" phrase but .wind-down marker present
 */

import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  writeFileSync,
  readFileSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const REPO_ROOT = resolve(__dirname, '..', '..');
const WATCHDOG_SCRIPT = resolve(REPO_ROOT, 'scripts', 'hooks', 'budget-watchdog.sh');
const FIXTURES_DIR = resolve(__dirname, 'fixtures');

// INV-10: durations reported informationally; cross-platform timing flake.
// Decision 022 (Phase 7.1) — replaces wallclock assertion at :152.
// Pattern: tests/hooks/tool-call-first.spec.ts lines 21 + 78-87.
const modeCGuardDurations: number[] = [];

interface WatchdogRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  alertLogTail: string;
  durationMs: number;
}

/**
 * Run budget-watchdog.sh with an isolated project dir.
 * Passes the given fixture as transcript_path in the stdin payload.
 * hook_event_name defaults to "Stop" (Mode-C only fires on Stop).
 */
function runWatchdog(
  transcriptFixtureName: string,
  isolatedDir: string,
  extraEnv: Record<string, string> = {},
  hookEvent = 'Stop',
): WatchdogRunResult {
  // Copy fixture into the isolated dir.
  const srcFixture = join(FIXTURES_DIR, transcriptFixtureName);
  const transcriptPath = join(isolatedDir, 'agent-workspace', 'memory', 'transcript.jsonl');
  mkdirSync(join(isolatedDir, 'agent-workspace', 'memory'), { recursive: true });
  writeFileSync(transcriptPath, readFileSync(srcFixture, 'utf8'));

  // Write current-execution.md with autonomous_mode: true.
  writeFileSync(
    join(isolatedDir, 'agent-workspace', 'memory', 'current-execution.md'),
    '# Current Execution State\n\n**autonomous_mode**: true\n',
  );

  const payload = JSON.stringify({
    transcript_path: transcriptPath,
    session_id: `test-mode-c-${Date.now()}`,
    hook_event_name: hookEvent,
  });

  const start = Date.now();
  const result = spawnSync('bash', [WATCHDOG_SCRIPT], {
    input: payload,
    encoding: 'utf8',
    env: {
      ...process.env,
      CLAUDE_PROJECT_DIR: isolatedDir,
      ORCH_WATCHDOG_DISABLE: '0',
      ...extraEnv,
    },
    timeout: 10000,
  });
  const durationMs = Date.now() - start;

  // Read alert log tail (last 20 lines).
  const alertLogPath = join(isolatedDir, 'agent-workspace', 'memory', '.autonomous-premature-windown-alert.log');
  const alertLogTail = existsSync(alertLogPath)
    ? readFileSync(alertLogPath, 'utf8').trim().split('\n').slice(-20).join('\n')
    : '';

  return {
    exitCode: result.status ?? -1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    alertLogTail,
    durationMs,
  };
}

describe('Mode-C premature-wind-down hard guard (SC-3)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'orch-mode-c-test-'));
  });

  afterEach(() => {
    if (tmpDir && existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('blocks Stop when transcript has "approaching 200K" + real=120K + no marker', () => {
    const result = runWatchdog('mode-c-positive-1.jsonl', tmpDir);

    // INV-9: always exit 0
    expect(result.exitCode).toBe(0);

    // Must emit block JSON to stdout
    let parsed: Record<string, string> | null = null;
    try {
      // stdout may contain multiple lines (watchdog log + JSON); find the JSON line
      const jsonLine = result.stdout
        .split('\n')
        .find((line) => line.trim().startsWith('{') && line.includes('"decision"'));
      if (jsonLine) {
        parsed = JSON.parse(jsonLine.trim()) as Record<string, string>;
      }
    } catch {
      // leave parsed as null
    }
    expect(parsed).not.toBeNull();
    expect(parsed?.decision).toBe('block');
    expect(parsed?.reason).toMatch(/MODE-C GUARD/);

    // Must write forensic line to alert log
    expect(result.alertLogTail).toMatch(/MODE-C GUARD BLOCKED Stop/);
    expect(result.alertLogTail).toMatch(/real_tokens=/);

    modeCGuardDurations.push(result.durationMs);
  });

  it('blocks Stop when "give next task fresh envelope" + real=80K', () => {
    const result = runWatchdog('mode-c-positive-2.jsonl', tmpDir);

    expect(result.exitCode).toBe(0);

    const jsonLine = result.stdout
      .split('\n')
      .find((line) => line.trim().startsWith('{') && line.includes('"decision"'));
    expect(jsonLine).toBeDefined();
    const parsed = JSON.parse(jsonLine!.trim()) as Record<string, string>;
    expect(parsed.decision).toBe('block');
    expect(parsed.reason).toMatch(/MODE-C GUARD/);

    expect(result.alertLogTail).toMatch(/MODE-C GUARD BLOCKED Stop/);
  });

  it('blocks Stop when "past 150K soft-prep" + real=160K', () => {
    const result = runWatchdog('mode-c-positive-3.jsonl', tmpDir);

    expect(result.exitCode).toBe(0);

    const jsonLine = result.stdout
      .split('\n')
      .find((line) => line.trim().startsWith('{') && line.includes('"decision"'));
    expect(jsonLine).toBeDefined();
    const parsed = JSON.parse(jsonLine!.trim()) as Record<string, string>;
    expect(parsed.decision).toBe('block');
    expect(parsed.reason).toMatch(/MODE-C GUARD/);

    expect(result.alertLogTail).toMatch(/MODE-C GUARD BLOCKED Stop/);
  });

  it('does NOT block when real >= soft-limit (185K >= 180K)', () => {
    // mode-c-clean-2 has usage=185K which is >= SOFT_LIMIT (default 180K)
    const result = runWatchdog('mode-c-clean-2.jsonl', tmpDir);

    expect(result.exitCode).toBe(0);
    // stdout must NOT contain a block decision
    expect(result.stdout).not.toMatch(/"decision"\s*:\s*"block"/);
    // alert log must NOT have a new entry
    expect(result.alertLogTail).not.toMatch(/MODE-C GUARD BLOCKED Stop/);
  });

  it('does NOT block when .wind-down marker is present (legitimate wind-down)', () => {
    // Pre-create the .wind-down marker before running watchdog.
    const memDir = join(tmpDir, 'agent-workspace', 'memory');
    mkdirSync(memDir, { recursive: true });
    writeFileSync(
      join(memDir, '.wind-down'),
      'wind_down_crossed_at=2026-04-27T00:00:00Z\ntokens=201000\n',
    );

    // Use positive-1 fixture (has rationalization phrase + low real tokens)
    const result = runWatchdog('mode-c-positive-1.jsonl', tmpDir);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toMatch(/"decision"\s*:\s*"block"/);
    expect(result.alertLogTail).not.toMatch(/MODE-C GUARD BLOCKED Stop/);
  });

  it('does NOT block when no rationalization phrase in transcript', () => {
    // mode-c-clean-1 has normal task progress text + tool_use block
    const result = runWatchdog('mode-c-clean-1.jsonl', tmpDir);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toMatch(/"decision"\s*:\s*"block"/);
    expect(result.alertLogTail).not.toMatch(/MODE-C GUARD BLOCKED Stop/);
  });

  afterAll(() => {
    if (modeCGuardDurations.length > 0) {
      const sorted = [...modeCGuardDurations].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
      const p99 = sorted[Math.floor(sorted.length * 0.99)] ?? sorted[sorted.length - 1] ?? 0;
      console.log(
        `\n[INV-10 reporter] mode-c-guard.sh latency — n=${modeCGuardDurations.length} median=${median}ms p99=${p99}ms`,
      );
    }
  });
});
