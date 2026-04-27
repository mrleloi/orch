import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { writeFileSync, mkdtempSync, readFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Absolute path to repo root (tests/hooks/ is two levels below root)
const REPO_ROOT = resolve(__dirname, '..', '..');
const SCRIPT_PATH = resolve(REPO_ROOT, 'scripts', 'hooks', 'tool-call-first-lint.sh');
const FIXTURES_DIR = resolve(__dirname, 'fixtures');

// INV-10: durations reported informationally; cross-platform timing flake
// (Windows Git Bash subprocess overhead spikes to ~4500ms intermittently)
// makes a hard threshold non-deterministic. Reporter pattern matches
// component-telemetry.spec.ts:35 + afterAll convention. Phase 6.1.3.
// Rationale: phase-6-v2.1-absorption.md SC-20.
const lintDurations: number[] = [];

interface LintRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  logTail: string;
}

// Temp dir for test isolation (per-run PROJECT_DIR with its own current-execution.md)
let testProjectDir: string;

function runLint(transcriptPath: string, sessionId: string): LintRunResult {
  const logPath = resolve(testProjectDir, 'agent-workspace', 'memory', '.tool-call-first-lint.log');

  const payload = JSON.stringify({ transcript_path: transcriptPath, session_id: sessionId });

  const start = Date.now();
  const result = spawnSync(
    'bash',
    [SCRIPT_PATH],
    {
      input: payload,
      encoding: 'utf8',
      env: {
        ...process.env,
        CLAUDE_PROJECT_DIR: testProjectDir,
      },
      timeout: 5000,
    }
  );
  const durationMs = Date.now() - start;
  lintDurations.push(durationMs);

  const logTail = existsSync(logPath) ? readFileSync(logPath, 'utf8') : '';

  return {
    exitCode: result.status ?? -1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    logTail,
  };
}

beforeAll(() => {
  // Create an isolated temp project dir with autonomous_mode: true
  testProjectDir = mkdtempSync(resolve(tmpdir(), 'orch-lint-test-'));
  const memDir = resolve(testProjectDir, 'agent-workspace', 'memory');
  mkdirSync(memDir, { recursive: true });
  // Mirror the real current-execution.md autonomous_mode pattern
  writeFileSync(
    resolve(memDir, 'current-execution.md'),
    '# Current Execution State\n\n**autonomous_mode**: true\n'
  );
});

afterAll(() => {
  // INV-10 informational reporter (replaces the per-call wallclock assertion
  // that was flake-prone on Windows Git Bash; Phase 6.1.3 fix).
  // Rationale: phase-6-v2.1-absorption.md SC-20.
  if (lintDurations.length > 0) {
    const sorted = [...lintDurations].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
    const p99 = sorted[Math.floor(sorted.length * 0.99)] ?? sorted[sorted.length - 1] ?? 0;
    console.log(
      `\n[INV-10 reporter] tool-call-first-lint.sh latency — n=${lintDurations.length} median=${median}ms p99=${p99}ms`
    );
  }
  if (testProjectDir && existsSync(testProjectDir)) {
    rmSync(testProjectDir, { recursive: true, force: true });
  }
});

describe('tool-call-first lint (Mode A)', () => {
  it('mode-a positive 1: text-narration "Dispatching" with no tool_use block', () => {
    const fixture = resolve(FIXTURES_DIR, 'mode-a-positive-1.jsonl');
    const r = runLint(fixture, 'test-session-1');

    expect(r.exitCode).toBe(0);
    expect(r.stderr).toMatch(/Mode.?A.{0,50}suspected/i);
    expect(r.logTail).toMatch(/narration_only=true/);
  });

  it('mode-a positive 2: "Will run" narration with no tool_use block', () => {
    const fixture = resolve(FIXTURES_DIR, 'mode-a-positive-2.jsonl');
    const r = runLint(fixture, 'test-session-2');

    expect(r.exitCode).toBe(0);
    expect(r.logTail).toMatch(/narration_only=true/);
  });

  it('mode-a positive 3: "About to dispatch" with no tool_use block', () => {
    const fixture = resolve(FIXTURES_DIR, 'mode-a-positive-3.jsonl');
    const r = runLint(fixture, 'test-session-3');

    expect(r.exitCode).toBe(0);
    expect(r.logTail).toMatch(/narration_only=true/);
  });

  it('bait 1: "Will run" text block PLUS tool_use block in same turn — should be clean', () => {
    const fixture = resolve(FIXTURES_DIR, 'mode-a-bait-1.jsonl');
    // Use a fresh log path by patching session id so we can check no new line was added
    const logPath = resolve(testProjectDir, 'agent-workspace', 'memory', '.tool-call-first-lint.log');
    const priorLogContent = existsSync(logPath) ? readFileSync(logPath, 'utf8') : '';

    const r = runLint(fixture, 'test-session-4');

    const afterLogContent = existsSync(logPath) ? readFileSync(logPath, 'utf8') : '';

    expect(r.exitCode).toBe(0);
    // The log must NOT have grown with a narration_only entry for this run
    // (new content should not contain narration_only=true for session-4)
    const delta = afterLogContent.slice(priorLogContent.length);
    expect(delta).not.toMatch(/narration_only=true/);
    // stderr should be empty / no Mode-A warning
    expect(r.stderr).not.toMatch(/Mode.?A.{0,50}suspected/i);
  });

  it('bait 2: tool_use only turn with no narration text — should be clean', () => {
    const fixture = resolve(FIXTURES_DIR, 'mode-a-bait-2.jsonl');
    const logPath = resolve(testProjectDir, 'agent-workspace', 'memory', '.tool-call-first-lint.log');
    const priorLogContent = existsSync(logPath) ? readFileSync(logPath, 'utf8') : '';

    const r = runLint(fixture, 'test-session-5');

    const afterLogContent = existsSync(logPath) ? readFileSync(logPath, 'utf8') : '';
    const delta = afterLogContent.slice(priorLogContent.length);

    expect(r.exitCode).toBe(0);
    expect(delta).not.toMatch(/narration_only=true/);
    expect(r.stderr).not.toMatch(/Mode.?A.{0,50}suspected/i);
  });

  it('bait 3: text-only turn "Phase complete" (no narration verb) — should be clean', () => {
    const fixture = resolve(FIXTURES_DIR, 'mode-a-bait-3.jsonl');
    const logPath = resolve(testProjectDir, 'agent-workspace', 'memory', '.tool-call-first-lint.log');
    const priorLogContent = existsSync(logPath) ? readFileSync(logPath, 'utf8') : '';

    const r = runLint(fixture, 'test-session-6');

    const afterLogContent = existsSync(logPath) ? readFileSync(logPath, 'utf8') : '';
    const delta = afterLogContent.slice(priorLogContent.length);

    expect(r.exitCode).toBe(0);
    expect(delta).not.toMatch(/narration_only=true/);
    expect(r.stderr).not.toMatch(/Mode.?A.{0,50}suspected/i);
  });
});
