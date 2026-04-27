/**
 * api-truncation.spec.ts — Vitest for Mode-B API-truncation auto-recovery (SC-2)
 *
 * Tests the Phase 5.1 Mode-B recovery block inserted into autonomous-stop-watchdog.sh.
 * All tests set ORCH_RECOVERY_DRY_RUN=1 to skip the actual background spawn (CI safe).
 *
 * Fixtures:
 *   mode-b-1.jsonl — overloaded_error with request_id "req_011CaBC123"
 *   mode-b-2.jsonl — overloaded_error WITHOUT request_id (session+minute fallback key)
 *   mode-b-3.jsonl — overloaded_error with request_id "req_011CaXYZ999" (for reboot-tier test)
 */

import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  writeFileSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  mkdirSync,
  readFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

const FIXTURES_DIR = resolve(__dirname, 'fixtures');

// INV-10: durations reported informationally; cross-platform timing flake.
// Decision 022 (Phase 7.1) — replaces wallclock assertions at :118 and :153.
// Pattern: tests/hooks/tool-call-first.spec.ts lines 21 + 78-87.
const apiTruncationDurations: number[] = [];
const WATCHDOG_SCRIPT = resolve(__dirname, '../../scripts/hooks/autonomous-stop-watchdog.sh');
const PROJECT_DIR = resolve(__dirname, '../..');

interface WatchdogRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  markersCreated: string[];
  alertLogTail: string;
  durationMs: number;
}

/**
 * Run autonomous-stop-watchdog.sh with an isolated project dir override.
 * Sets ORCH_RECOVERY_DRY_RUN=1 to prevent actual recovery dispatch in CI.
 */
function runWatchdog(
  transcriptFixtureName: string,
  sessionId: string,
  isolatedDir: string,
  extraEnv: Record<string, string> = {},
): WatchdogRunResult {
  // Copy the fixture transcript into isolatedDir so the hook can read it.
  const srcFixture = join(FIXTURES_DIR, transcriptFixtureName);
  const transcriptPath = join(isolatedDir, 'agent-workspace', 'memory', 'transcript.jsonl');
  mkdirSync(join(isolatedDir, 'agent-workspace', 'memory'), { recursive: true });
  writeFileSync(transcriptPath, readFileSync(srcFixture, 'utf8'));

  // Write current-execution.md with autonomous_mode: true.
  writeFileSync(
    join(isolatedDir, 'agent-workspace', 'memory', 'current-execution.md'),
    '**autonomous_mode**: true\n',
  );

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

  // Collect any marker files created in the memory dir.
  const memDir = join(isolatedDir, 'agent-workspace', 'memory');
  const markersCreated = readdirSync(memDir).filter((f) =>
    f.startsWith('.api-truncation-recovery-fired-'),
  );

  // Read alert log tail (last 10 lines).
  const alertLogPath = join(memDir, '.autonomous-api-error-alert.log');
  const alertLogTail = existsSync(alertLogPath)
    ? readFileSync(alertLogPath, 'utf8').trim().split('\n').slice(-10).join('\n')
    : '';

  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    markersCreated,
    alertLogTail,
    durationMs,
  };
}

describe('Mode-B API-truncation auto-recovery (SC-2)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'orch-watchdog-test-'));
  });

  it('fires recovery on first detection of overloaded_error with request_id', () => {
    const result = runWatchdog('mode-b-1.jsonl', 'test-sess-01', tmpDir);

    expect(result.exitCode).toBe(0);
    expect(result.markersCreated).toContain('.api-truncation-recovery-fired-req_011CaBC123');
    expect(result.alertLogTail).toMatch(/AUTO-RECOVERY FIRED.{0,200}req_011CaBC123/);
    apiTruncationDurations.push(result.durationMs);
  });

  it('does NOT fire twice for same request_id (idempotency)', () => {
    // Pre-create the marker as if a previous recovery fired.
    const memDir = join(tmpDir, 'agent-workspace', 'memory');
    mkdirSync(memDir, { recursive: true });
    writeFileSync(
      join(memDir, '.api-truncation-recovery-fired-req_011CaBC123'),
      'fired_at=2026-01-01T00:00:00Z\nrequest_id=req_011CaBC123\nsession=test-sess-02\nreal_tokens=50000\nmode=injector\n',
    );

    const result = runWatchdog('mode-b-1.jsonl', 'test-sess-02', tmpDir);

    expect(result.exitCode).toBe(0);
    // The only marker should be the pre-created one — no NEW marker created.
    expect(result.markersCreated).toHaveLength(1);
    // alertLogTail should NOT contain a second AUTO-RECOVERY FIRED line.
    const autoRecoveryLines = result.alertLogTail
      .split('\n')
      .filter((l) => l.includes('AUTO-RECOVERY FIRED'));
    expect(autoRecoveryLines).toHaveLength(0);
  });

  it('fires recovery with session+minute key when request_id absent', () => {
    const result = runWatchdog('mode-b-2.jsonl', 'test-sess-XX', tmpDir);

    expect(result.exitCode).toBe(0);
    // Should have exactly one marker.
    expect(result.markersCreated).toHaveLength(1);
    // Marker name uses session+minute pattern.
    expect(result.markersCreated[0]).toMatch(
      /^\.api-truncation-recovery-fired-test-sess-XX-\d{12}$/,
    );
    apiTruncationDurations.push(result.durationMs);
  });

  it('uses reboot tier when REAL >= 200K (high token count)', () => {
    // Pre-write .transcript-tokens containing 210000 to force reboot tier.
    const memDir = join(tmpDir, 'agent-workspace', 'memory');
    mkdirSync(memDir, { recursive: true });
    writeFileSync(join(memDir, '.transcript-tokens'), '210000\n');

    const result = runWatchdog('mode-b-3.jsonl', 'test-sess-04', tmpDir);

    expect(result.exitCode).toBe(0);
    expect(result.markersCreated).toHaveLength(1);
    // Marker content should show mode=reboot.
    const markerFile = join(memDir, result.markersCreated[0]);
    const markerContent = readFileSync(markerFile, 'utf8');
    expect(markerContent).toMatch(/mode=reboot/);
    // Should NOT be injector mode.
    expect(markerContent).not.toMatch(/mode=injector/);
  });

  afterAll(() => {
    if (apiTruncationDurations.length > 0) {
      const sorted = [...apiTruncationDurations].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
      const p99 = sorted[Math.floor(sorted.length * 0.99)] ?? sorted[sorted.length - 1] ?? 0;
      // eslint-disable-next-line no-console
      console.log(
        `\n[INV-10 reporter] autonomous-stop-watchdog.sh (api-truncation) latency — n=${apiTruncationDurations.length} median=${median}ms p99=${p99}ms`,
      );
    }
  });
});
