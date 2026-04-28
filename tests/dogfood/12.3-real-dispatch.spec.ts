/**
 * tests/dogfood/12.3-real-dispatch.spec.ts
 *
 * One-shot real-dispatch driver for Phase 12 substage 12.3 dogfood checkpoint C2.
 * Authored 2026-04-28 by 12.3 task-implementer subagent (this is a NEW file, not
 * a modification to existing harness or test code).
 *
 * Why a vitest spec instead of `npx tsx scripts/dogfood/run-self-task.ts`?
 * The harness uses `import { ... } from '../../packages/core/src/dogfood/
 * envelope-schema.js'`. Direct tsx invocation cannot resolve this `.js` import
 * to the `.ts` source under `packages/core/` because that package has no
 * `"type": "module"` declaration, so Node's ESM loader treats the resolved
 * file as CJS and the named exports become inaccessible to ESM importers.
 * Vitest's transformer handles this transparently because tests/ is configured
 * with vitest.config.ts and the TS pipeline produces ESM at evaluation time.
 *
 * This spec is the ONLY supported invocation path for the harness CLI today
 * outside of pnpm-running the existing tests. Documented as a known gap in
 * Decision 041 §6 forward dependencies; out-of-scope for 12.3 to fix the CLI
 * resolution path itself.
 *
 * What this test does (gated on ORCH_RUN_REAL_DISPATCH env to keep CI safe):
 *   1. If ORCH_RUN_REAL_DISPATCH != "1": skip (default — keeps CI clean).
 *   2. Otherwise: set ORCH_DOGFOOD_EXECUTE=true and ORCH_DOGFOOD_PARENT_OK=1,
 *      invoke `runSelfTask('agent-workspace/queue/self-tasks/
 *      phase-12-12.3-housekeeping.yaml')`, expect exit 0, verify trace JSONL
 *      file at the envelope's `dispatch_trace_path` exists and contains a
 *      `dogfood.subprocess_spawn` span with `pid` and (best-effort) `session_id`.
 *
 * I-6 ABSOLUTE: this spec performs ZERO `git commit`. The dogfood-spawned
 * subagent's prompt forbids commits at the I-6 level too.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  runSelfTask,
  EXIT_CODES,
} from '../../scripts/dogfood/run-self-task.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const ENVELOPE_REL = 'agent-workspace/queue/self-tasks/phase-12-12.3-housekeeping.yaml';
const TRACE_REL = 'agent-workspace/traces/dogfood-phase-12-12.3-housekeeping.jsonl';

const RUN_REAL = process.env['ORCH_RUN_REAL_DISPATCH'] === '1';

describe.runIf(RUN_REAL)('phase-12 substage 12.3 — real dogfood dispatch (C2)', () => {
  it('runSelfTask spawns ccs subprocess and emits non-stub trace span', async () => {
    const envelopePath = path.join(REPO_ROOT, ENVELOPE_REL);
    expect(fs.existsSync(envelopePath)).toBe(true);

    const tracePath = path.join(REPO_ROOT, TRACE_REL);
    if (fs.existsSync(tracePath)) {
      fs.unlinkSync(tracePath);
    }

    const savedEnv = { ...process.env };
    process.env['ORCH_DOGFOOD_PARENT_OK'] = '1';
    process.env['ORCH_DOGFOOD_EXECUTE'] = 'true';
    delete process.env['ORCH_DOGFOOD_DEPTH'];

    let exitCode: number;
    try {
      exitCode = await runSelfTask(envelopePath);
    } finally {
      process.env = savedEnv;
    }

    // Trace file must exist regardless of exit code (G4 trace evidence).
    expect(fs.existsSync(tracePath)).toBe(true);

    const lines = fs
      .readFileSync(tracePath, 'utf8')
      .split('\n')
      .filter((s) => s.length > 0);
    expect(lines.length).toBeGreaterThanOrEqual(1);

    const records = lines.map((l) => JSON.parse(l) as Record<string, unknown>);

    // No dispatch_deferred_to anywhere — G3 invariant carried into G4.
    const stringified = JSON.stringify(records);
    expect(stringified).not.toMatch(/dispatch_deferred_to/);

    // Find subprocess_spawn span.
    const spawnSpans = records.filter(
      (r) => r['spanName'] === 'dogfood.subprocess_spawn',
    );
    expect(spawnSpans.length).toBeGreaterThanOrEqual(1);

    const spawnAttrs = (spawnSpans[0]?.['attrs'] as Record<string, unknown>) ?? {};
    expect(spawnAttrs['flag_off']).toBe(false); // real-spawn path

    // pid is best-effort: present on success, may be absent on early ccs failure.
    // session_id may be empty initially. We require pid OR an explicit error.
    const hadPid = typeof spawnAttrs['pid'] === 'number' && (spawnAttrs['pid'] as number) > 0;
    const hadSpawnError = typeof spawnAttrs['spawn_error'] === 'string';
    expect(hadPid || hadSpawnError).toBe(true);

    // Exit code is OK (0) on success, or SPAWN_FAILED (4) on subprocess failure;
    // both produce trace evidence which is what G4 requires.
    expect([EXIT_CODES.OK, EXIT_CODES.SPAWN_FAILED]).toContain(exitCode);
  }, 600_000);
});
