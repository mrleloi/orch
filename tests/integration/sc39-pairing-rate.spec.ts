/**
 * sc39-pairing-rate.spec.ts — Integration test for SC-39 Case γ dispatch pairing rate.
 *
 * Generates 50 synthetic complete cycles:
 *   PreToolUse-Agent → PostToolUse-Agent → SubagentStop
 * Then runs loadTaskFinishRecordsFromDispatchJsonl() and asserts pairing_rate >= 0.40.
 *
 * Each cycle uses a shared tmpdir for sidecar + dispatch.jsonl.
 * Decision 023 + SC-39 Case γ: DISPATCHED dispatch_id = toolu_*; COMPLETED dispatch_id
 * is rewritten to toolu_* via PostToolUse hex-key sidecar index.
 *
 * Timing note: dispatch-jsonl-recorder.sh fires a background subshell for I/O.
 * We poll for sidecar hex entry before firing SubagentStop to ensure the hex
 * index is present (avoids race between background writes and next hook invocation).
 */

import { describe, it, expect } from 'vitest';
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
const PAIR_COUNT = 50;

function makeIsolatedDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'orch-sc39-pairing-'));
  mkdirSync(join(dir, 'agent-workspace', 'memory'), { recursive: true });
  return dir;
}

function cleanupDir(dir: string): void {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
}

function runHookSync(stdinPayload: string, isolatedDir: string): void {
  spawnSync('bash', [HOOK_SCRIPT], {
    input: stdinPayload,
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: isolatedDir },
    timeout: 10_000,
  });
}

/**
 * Poll sidecar file until it contains a line with the given dispatch_id key.
 * Needed because dispatch-jsonl-recorder.sh fires a background subshell;
 * the sidecar entry won't exist until the subshell flushes.
 */
function pollForSidecarEntry(
  sidecarPath: string,
  dispatchId: string,
  timeoutMs = 8_000,
): boolean {
  const sab = new SharedArrayBuffer(4);
  const sabView = new Int32Array(sab);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(sidecarPath)) {
      const content = readFileSync(sidecarPath, 'utf8');
      if (content.includes(`"dispatch_id":"${dispatchId}"`)) return true;
    }
    Atomics.wait(sabView, 0, 0, 20);
  }
  return false;
}

/**
 * Poll dispatch.jsonl until it has at least minLines non-empty lines.
 */
function pollForLines(
  jsonlPath: string,
  expectedMinLines: number,
  timeoutMs = 15_000,
): string[] {
  const sab = new SharedArrayBuffer(4);
  const sabView = new Int32Array(sab);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(jsonlPath)) {
      const lines = readFileSync(jsonlPath, 'utf8').split('\n').filter((l) => l.trim().length > 0);
      if (lines.length >= expectedMinLines) return lines;
    }
    Atomics.wait(sabView, 0, 0, 30);
  }
  if (existsSync(jsonlPath)) {
    return readFileSync(jsonlPath, 'utf8').split('\n').filter((l) => l.trim().length > 0);
  }
  return [];
}

describe('SC-39 Case γ — dispatch pairing rate integration', () => {
  it(`pairing_rate >= 0.40 over ${PAIR_COUNT} synthetic complete cycles`, async () => {
    const dir = makeIsolatedDir();
    const jsonlPath = join(dir, 'agent-workspace', 'memory', 'dispatch.jsonl');
    const SESSION = 'sc39-integ';
    const sidecarPath = join(dir, 'agent-workspace', 'memory', `.dispatch-pending-${SESSION}.jsonl`);

    try {
      // Emit PAIR_COUNT complete cycles: PreToolUse → PostToolUse → SubagentStop
      // Sequential with polling to ensure background subshell writes complete before
      // next dependent step reads the sidecar.
      for (let i = 0; i < PAIR_COUNT; i++) {
        const touluId = `toolu_SC39_${String(i).padStart(4, '0')}`;
        // 17-char hex agent id, unique per cycle
        const hexId = `a${String(i).padStart(16, '0')}`;
        const subagentType = i % 2 === 0 ? 'task-implementer' : 'spec-compliance-reviewer';

        // Step 1: PreToolUse-Agent → DISPATCHED + sidecar[toolu_*]
        runHookSync(JSON.stringify({
          hook_event_name: 'PreToolUse',
          session_id: SESSION,
          tool_name: 'Agent',
          tool_use_id: touluId,
          tool_input: { subagent_type: subagentType },
        }), dir);

        // Poll: wait for sidecar[toolu_*] entry before PostToolUse reads it
        pollForSidecarEntry(sidecarPath, touluId, 5_000);

        // Step 2: PostToolUse-Agent → sidecar[hex_id] index entry
        runHookSync(JSON.stringify({
          hook_event_name: 'PostToolUse',
          session_id: SESSION,
          tool_name: 'Agent',
          tool_use_id: touluId,
          tool_response: {
            content: [{
              type: 'text',
              text: `agentId: ${hexId} (internal ID for SubagentStop correlation)`,
            }],
          },
        }), dir);

        // Poll: wait for sidecar[hex_id] entry before SubagentStop reads it
        pollForSidecarEntry(sidecarPath, hexId, 5_000);

        // Step 3: SubagentStop → COMPLETED with dispatch_id rewritten to toulu_*
        runHookSync(JSON.stringify({
          hook_event_name: 'SubagentStop',
          session_id: SESSION,
          agent_id: hexId,
          status: 'DONE',
        }), dir);
      }

      // Wait for all background subshells to flush (PAIR_COUNT * 2 lines: DISPATCHED + COMPLETED)
      const lines = pollForLines(jsonlPath, PAIR_COUNT * 2, 30_000);

      // Count actual DISPATCHED and COMPLETED pairs present
      const dispatched = new Set<string>();
      const completed = new Set<string>();
      for (const line of lines) {
        try {
          const obj = JSON.parse(line) as Record<string, unknown>;
          if (obj['event'] === 'DISPATCHED') dispatched.add(String(obj['dispatch_id']));
          if (obj['event'] === 'COMPLETED') completed.add(String(obj['dispatch_id']));
        } catch { /* skip malformed lines */ }
      }

      // Use loadTaskFinishRecordsFromDispatchJsonl to verify pairing via groupBy(dispatch_id)
      const records = await loadTaskFinishRecordsFromDispatchJsonl(jsonlPath);

      const pairingRate = records.length / PAIR_COUNT;
      console.log(
        `[SC-39 pairing-rate] dispatched=${dispatched.size} completed=${completed.size} ` +
        `paired=${records.length}/${PAIR_COUNT} rate=${pairingRate.toFixed(3)}`,
      );

      // Acceptance gate C.B.2: pairing_rate >= 0.40
      expect(pairingRate).toBeGreaterThanOrEqual(0.40);
    } finally {
      cleanupDir(dir);
    }
  });
});
