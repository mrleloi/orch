/**
 * sc39-production-pairing-rate.spec.ts — SC-39 production-vs-fixture-gap integration test.
 *
 * Decision 035 §6 CF-V2.6-10.5.3-PRODUCTION-VS-FIXTURE-GAP:
 *   "Add tests/integration/sc39-production-pairing-rate.spec.ts that spawns a CHILD claude
 *   process with the post-fix settings.json and verifies end-to-end pairing across a fresh
 *   session boundary."
 *
 * Three test cases (B.Δ2.1):
 *   Case 1: production-mode — spawn child claude with real settings.json; pairing_rate >= 0.40.
 *           Skipped if: no claude in PATH, Windows, or ORCH_SC39_PROD_TEST_MODE=fixture.
 *   Case 2: fixture-mode parity — replay dispatch via bash hook directly; pairing_rate >= 0.40.
 *           Establishes baseline convergence.
 *   Case 3: regression detection — corrupt temp settings.json; fixture stays >= 0.40.
 *           Documents production-vs-fixture gap: fixture is immune; production would fail.
 *
 * Platform-skip strategy (B.Δ2.2):
 *   hasClaudeBin() uses spawnSync array-args, no shell option (I-3 strict).
 *   Windows skips Case 1 unconditionally — claude.cmd shim is not I-3 compliant.
 *   hasBashBin() checks bash availability; Cases 2+3 skip on Windows where bash background
 *   subshells do not produce output reliably (platform limitation, not code violation).
 *   ORCH_SC39_PROD_TEST_MODE=fixture forces fixture mode globally (CI/CD safety valve).
 *   [SKIP] banner logged in beforeAll — CI logs must see the skip reason.
 *
 * R-1 FAIL NOTICE (B.Δ2.7): Case 1 expected to FAIL until PostToolUse-Agent re-keying fix.
 *   Root cause: real Agent tool result text lacks `agentId: <hex>` field expected by
 *   dispatch-jsonl-recorder.sh line 33. Fix deferred to v2.7 / Decision 037.
 *   See: agent-workspace/memory/observations/task-11.5.1-r1-probe-result.md
 *
 * I-3 invariant: no shell option, no exec-as-string — all spawnSync calls use array args.
 */

import { describe, it, beforeAll, afterEach, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, cpSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { loadTaskFinishRecordsFromDispatchJsonl } from '../../scripts/benchmarks/sc18-realworld.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROJECT_ROOT = resolve(__dirname, '../..');
const HOOK_SCRIPT = resolve(PROJECT_ROOT, 'scripts/hooks/dispatch-jsonl-recorder.sh');
const SETTINGS_JSON = resolve(PROJECT_ROOT, '.claude/settings.json');
const PAIR_COUNT = 10;
const PROD_MODE = (process.env['ORCH_SC39_PROD_TEST_MODE'] ?? 'production') !== 'fixture';

// ---------------------------------------------------------------------------
// Platform detection (B.Δ2.2): I-3 compliant, spawnSync array args only
// ---------------------------------------------------------------------------

/** hasClaudeBin — array args only; Windows returns false (shim is not I-3 compliant). */
function hasClaudeBin(): boolean {
  if (process.platform === 'win32') return false;
  return spawnSync('claude', ['--version'], { stdio: 'ignore' }).status === 0;
}

/**
 * hasBashBin — checks bash availability for fixture-mode hook invocation.
 * On Windows, bash background subshells in dispatch-jsonl-recorder.sh do not
 * reliably produce output; skip fixture-mode tests on Windows.
 */
function hasBashBin(): boolean {
  if (process.platform === 'win32') return false;
  return spawnSync('bash', ['--version'], { stdio: 'ignore' }).status === 0;
}

const claudeOk = hasClaudeBin();
const bashOk = hasBashBin();

// ---------------------------------------------------------------------------
// Test isolation (B.Δ2.3): each case mints own tmpdir; afterEach cleans up.
// ---------------------------------------------------------------------------

const dirs: string[] = [];

afterEach(() => {
  for (const d of dirs) {
    try { rmSync(d, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
  dirs.length = 0;
});

/** mintDir — creates isolated tmpdir with minimum hook-chain files. cpSync (not symlink) for Windows. */
function mintDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'orch-sc39-prod-'));
  mkdirSync(join(d, 'agent-workspace', 'memory'), { recursive: true });
  mkdirSync(join(d, 'scripts', 'hooks'), { recursive: true });
  mkdirSync(join(d, '.claude'), { recursive: true });
  cpSync(SETTINGS_JSON, join(d, '.claude', 'settings.json'));
  for (const s of ['dispatch-jsonl-recorder.sh', 'component-telemetry.sh', 'budget-watchdog.sh']) {
    const src = join(PROJECT_ROOT, 'scripts/hooks', s);
    if (existsSync(src)) cpSync(src, join(d, 'scripts/hooks', s));
  }
  dirs.push(d);
  return d;
}

// ---------------------------------------------------------------------------
// Polling helpers — use async setTimeout (no Atomics.wait required)
// ---------------------------------------------------------------------------

async function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function pollLines(path: string, min: number, ms = 15_000): Promise<string[]> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (existsSync(path)) {
      const ls = readFileSync(path, 'utf8').split('\n').filter(Boolean);
      if (ls.length >= min) return ls;
    }
    await sleep(30);
  }
  return existsSync(path) ? readFileSync(path, 'utf8').split('\n').filter(Boolean) : [];
}

async function pollSidecar(p: string, id: string, ms = 8_000): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (existsSync(p) && readFileSync(p, 'utf8').includes(`"dispatch_id":"${id}"`)) return true;
    await sleep(20);
  }
  return false;
}

// ---------------------------------------------------------------------------
// Fixture-mode helpers (reused from sc39-pairing-rate.spec.ts pattern)
// ---------------------------------------------------------------------------

function runHook(payload: string, dir: string): void {
  spawnSync('bash', [HOOK_SCRIPT], {
    input: payload, encoding: 'utf8', timeout: 10_000,
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
  });
}

/** fixtureRun — N complete PreToolUse→PostToolUse→SubagentStop cycles via bash directly. */
async function fixtureRun(dir: string): Promise<number> {
  const jPath = join(dir, 'agent-workspace/memory/dispatch.jsonl');
  const SID = 'sc39-prod';
  const sc = join(dir, `agent-workspace/memory/.dispatch-pending-${SID}.jsonl`);
  for (let i = 0; i < PAIR_COUNT; i++) {
    const tid = `toolu_SC39P_${String(i).padStart(4, '0')}`;
    const hex = `a${String(i).padStart(16, '0')}`;
    runHook(JSON.stringify({
      hook_event_name: 'PreToolUse', session_id: SID, tool_name: 'Agent',
      tool_use_id: tid, tool_input: { subagent_type: 'task-implementer' },
    }), dir);
    await pollSidecar(sc, tid);
    runHook(JSON.stringify({
      hook_event_name: 'PostToolUse', session_id: SID, tool_name: 'Agent', tool_use_id: tid,
      tool_response: { content: [{ type: 'text', text: `agentId: ${hex} (internal ID for SubagentStop correlation)` }] },
    }), dir);
    await pollSidecar(sc, hex);
    runHook(JSON.stringify({
      hook_event_name: 'SubagentStop', session_id: SID, agent_id: hex, status: 'DONE',
    }), dir);
  }
  await pollLines(jPath, PAIR_COUNT * 2);
  const recs = await loadTaskFinishRecordsFromDispatchJsonl(jPath);
  const rate = recs.length / PAIR_COUNT;
  console.log(`[SC-39 fixture] paired=${recs.length}/${PAIR_COUNT} rate=${rate.toFixed(3)}`);
  return rate;
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('SC-39 production pairing rate (R-1 wiring verification)', () => {

  beforeAll(() => {
    if (!PROD_MODE) {
      console.log('[SKIP] ORCH_SC39_PROD_TEST_MODE=fixture — Case 1 (production-mode) skipped globally');
    } else if (!claudeOk) {
      console.log('[SKIP] claude not in PATH (or Windows) — Case 1 skipped; fixture cases may proceed');
    }
    if (!bashOk) {
      console.log('[SKIP] bash not available on this platform — Cases 2+3 (fixture-mode) skipped');
    }
  });

  // Case 1: production-mode — spawn child claude; pairing_rate >= 0.40
  it.skipIf(!PROD_MODE || !claudeOk)(
    'Case 1: production-mode pairing_rate >= 0.40 via real claude child process',
    { timeout: 60_000 },
    async () => {
      const dir = mintDir();
      const jPath = join(dir, 'agent-workspace/memory/dispatch.jsonl');
      // Array args; I-3 strict (no shell option)
      const r = spawnSync('claude', ['--print', 'Echo PING and exit'], {
        cwd: dir, encoding: 'utf8', timeout: 45_000,
        env: { ...process.env, CLAUDE_PROJECT_DIR: dir, ORCH_SPAWNED: 'true' },
      });
      console.log(`[SC-39 Case 1] claude exit=${r.status}`);
      const lines = await pollLines(jPath, 1, 10_000);
      const recs = await loadTaskFinishRecordsFromDispatchJsonl(jPath);
      const dispatched = lines.filter(l => {
        try { return (JSON.parse(l) as Record<string, unknown>)['event'] === 'DISPATCHED'; } catch { return false; }
      }).length;
      const rate = dispatched > 0 ? recs.length / dispatched : 0;
      console.log(`[SC-39 Case 1] dispatched=${dispatched} paired=${recs.length} rate=${rate.toFixed(3)}`);
      expect(rate).toBeGreaterThanOrEqual(0.40);
    },
  );

  // Case 2: fixture-mode parity — validates script-level correctness
  it.skipIf(!bashOk)(
    'Case 2: fixture-mode pairing_rate >= 0.40 (baseline convergence)',
    { timeout: 60_000 },
    async () => {
      const dir = mintDir();
      const rate = await fixtureRun(dir);
      expect(rate).toBeGreaterThanOrEqual(0.40);
    },
  );

  // Case 3: regression detection — corrupt settings.json; fixture immune (proves gap)
  it.skipIf(!bashOk)(
    'Case 3: regression — corrupt settings.json; fixture immune (documents production-vs-fixture gap)',
    { timeout: 60_000 },
    async () => {
      const dir = mintDir();
      const sp = join(dir, '.claude/settings.json');
      const parsed = JSON.parse(readFileSync(sp, 'utf8')) as Record<string, unknown>;
      const hooks = parsed['hooks'] as Record<string, unknown[]> | undefined;
      if (hooks) { hooks['PostToolUse'] = []; writeFileSync(sp, JSON.stringify(parsed, null, 2)); }
      // Fixture bypasses harness: rate >= 0.40 regardless of settings.json health.
      // Production mode with same corruption would be < 0.40 — that IS the gap.
      const rate = await fixtureRun(dir);
      console.log(`[SC-39 Case 3] corrupted-settings fixture rate=${rate.toFixed(3)} (gap documented)`);
      expect(rate).toBeGreaterThanOrEqual(0.40);
    },
  );

});
