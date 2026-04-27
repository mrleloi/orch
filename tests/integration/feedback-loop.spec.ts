/**
 * feedback-loop.spec.ts — Integration spec for the rollup → analyst → planner pipeline.
 *
 * 4 deterministic cases per architect 6.2-feedback-loop-architect.md § Task 6.2.5 Part B.
 * No live LLM calls — Cases 2 and 4 are structural/grep-based assertions.
 * Cases 1 and 3 are runtime deterministic.
 *
 * Case 1: rollup-only roundtrip (spawnSync rollup script, 4-component fixture)
 * Case 2: analyst rule application — assert 4 RULE encodings present in telemetry-analyst.md
 * Case 3: citation guard / linter — in-test linter function validates recs MD citations
 * Case 4: master-planner v3 cite mandate — grep routing-recommendations count + Phase 0.5
 *
 * Hallucination guard (SC-25, Decision 017 §R-4 mitigation):
 *   Every proposal bullet in a recommendations file MUST contain literal
 *   `cites rollup row: <type>::<name>`. The lintRecommendationsCitations()
 *   helper below is the canonical implementation of this rule. Any proposal
 *   bullet (matching `^- **`) that lacks the substring is a violation.
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROLLUP_SCRIPT = resolve(__dirname, '../../scripts/utilities/rollup-telemetry.ts');
const ANALYST_AGENT = resolve(__dirname, '../../.claude/agents/telemetry-analyst.md');
const MASTER_PLANNER = resolve(__dirname, '../../.claude/agents/master-planner.md');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'orch-feedback-loop-test-'));
}

function cleanupDir(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
}

/** Minimal valid JSONL event line for a given component. */
function makeEvent(
  componentType: 'skill' | 'agent' | 'command' | 'hook',
  componentName: string,
  outcome: 'ok' | 'error' | 'timeout' | 'reject' | 'no_op' = 'ok',
  durationMs = 100,
  tokensReal = 0,
  failureMode: string | null = null,
): string {
  return JSON.stringify({
    ts: '2026-04-27T12:00:00.000Z',
    component_type: componentType,
    component_name: componentName,
    trigger: 'hook_event',
    outcome,
    tokens_real: tokensReal,
    duration_ms: durationMs,
    session_id: 'test-session',
    task_id: null,
    failure_mode: failureMode,
  });
}

/** Run rollup script via pnpm tsx with shell:true for Windows .cmd compat. */
function runRollup(args: string[]): {
  exitCode: number;
  stdout: string;
  stderr: string;
} {
  const result = spawnSync('pnpm', ['tsx', ROLLUP_SCRIPT, ...args], {
    encoding: 'utf8',
    timeout: 30_000,
    cwd: resolve(__dirname, '../../'),
    shell: true,
  });
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

/**
 * Citation linter — hallucination guard (SC-25, Decision 017 §R-4 mitigation).
 *
 * Scans a recommendations markdown string for proposal bullets.
 * Every bullet matching `^- **` MUST contain `cites rollup row:`.
 * Returns a list of violation descriptions (section + truncated line).
 *
 * This is the EXACT contract enforced on analyst output. Keeping it here
 * (not a separate utility) makes the contract single-source.
 */
function lintRecommendationsCitations(recsMd: string): { violations: string[] } {
  const violations: string[] = [];
  const lines = recsMd.split('\n');
  let currentSection = '';
  for (const line of lines) {
    if (line.match(/^## /)) currentSection = line;
    if (line.match(/^- \*\*/) && !line.includes('cites rollup row:')) {
      violations.push(`${currentSection}: ${line.slice(0, 80)}`);
    }
  }
  return { violations };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('feedback-loop integration', () => {
  // -------------------------------------------------------------------------
  // Case 1 — rollup-only roundtrip
  // -------------------------------------------------------------------------
  it('Case 1 — rollup roundtrip: 4-component fixture → exit 0, output exists, 4 data rows', () => {
    const dir = makeTmpDir();
    try {
      const fixturePath = join(dir, 'fixture.jsonl');
      const outPath = join(dir, 'rollup-out.md');

      // Write 4 distinct component types each with 1 event
      const lines = [
        makeEvent('skill', 'research-first', 'ok', 120),
        makeEvent('agent', 'task-implementer', 'ok', 38000, 4500),
        makeEvent('command', 'budget-check', 'ok', 50),
        makeEvent('hook', 'Stop', 'ok', 10),
      ].join('\n') + '\n';
      writeFileSync(fixturePath, lines, 'utf8');

      const { exitCode, stdout, stderr } = runRollup([
        '--phase', '99',
        '--input', fixturePath,
        '--output', outPath,
      ]);

      expect(exitCode, `stdout: ${stdout}\nstderr: ${stderr}`).toBe(0);
      expect(existsSync(outPath), 'output file should exist').toBe(true);

      const content = readFileSync(outPath, 'utf8');

      // H1 title present
      expect(content).toMatch(/^# Component Telemetry Rollup — Phase 99/m);

      // ## Components section present
      expect(content).toMatch(/^## Components$/m);

      // Exactly 4 data rows (one per component type)
      const dataRows = content.split('\n').filter(l =>
        /^\| (skill|agent|command|hook) \|/.test(l),
      );
      expect(dataRows).toHaveLength(4);

      // Each expected component is present
      const allRows = dataRows.join('\n');
      expect(allRows).toMatch(/research-first/);
      expect(allRows).toMatch(/task-implementer/);
      expect(allRows).toMatch(/budget-check/);
      expect(allRows).toMatch(/Stop/);
    } finally {
      cleanupDir(dir);
    }
  });

  // -------------------------------------------------------------------------
  // Case 2 — analyst rule application (structural, no LLM invoked)
  // -------------------------------------------------------------------------
  it('Case 2 — analyst rule encoding: telemetry-analyst.md contains all 4 RULE trigger conditions', () => {
    // This case is structural-only — does not invoke the LLM.
    // Asserts that the analyst prompt encodes the 4 deterministic rules per
    // architect 6.2.3 §B.3, so analyst cannot hallucinate proposals.
    expect(existsSync(ANALYST_AGENT), 'telemetry-analyst.md must exist').toBe(true);

    const content = readFileSync(ANALYST_AGENT, 'utf8');

    // RULE-1: p99_duration_ms > 60000
    expect(content).toMatch(/p99_duration_ms.*60000|60000.*p99_duration_ms/i);

    // RULE-2: count >= 5 AND success_rate < 0.6
    expect(content).toMatch(/success_rate.*0\.6|0\.6.*success_rate/i);

    // RULE-3: top failure mode C (premature wind-down)
    expect(content).toMatch(/failure mode.*C|mode.*C.*wind.down|mode is.*C/i);

    // RULE-4: p99_tokens_real > 100000
    expect(content).toMatch(/p99_tokens_real.*100000|100000.*p99_tokens_real/i);

    // Citation mandate is also encoded in analyst prompt
    expect(content).toMatch(/cites rollup row/);
  });

  // -------------------------------------------------------------------------
  // Case 3 — citation guard / linter
  // -------------------------------------------------------------------------
  it('Case 3 — citation linter: flags proposals missing "cites rollup row:", passes compliant ones', () => {
    // Synthetic BAD recommendations file — proposal lacks citation
    const badRecsMd = `# Phase 99 Routing Recommendations

> Generated 2026-04-27T00:00:00.000Z by telemetry-analyst.

## Model Bumps

- **agent::sandwich-architect** sonnet → opus — p99_duration_ms=78000 exceeds 60s threshold.

## Agent Prunes

- (no proposals at this time — all components within thresholds)

## Parallelization Gate Adjustments

- (no proposals at this time — all components within thresholds)
`;

    // Synthetic GOOD recommendations file — proposal contains citation
    const goodRecsMd = `# Phase 99 Routing Recommendations

> Generated 2026-04-27T00:00:00.000Z by telemetry-analyst.

## Model Bumps

- **agent::sandwich-architect** sonnet → opus — p99_duration_ms=78000 exceeds 60s threshold. cites rollup row: agent::sandwich-architect.

## Agent Prunes

- **agent::dud** success_rate=0.40 over 12 invocations; recommend retire in next version. cites rollup row: agent::dud.

## Parallelization Gate Adjustments

- (no proposals at this time — all components within thresholds)
`;

    // BAD fixture: 1 proposal bullet without citation → 1 violation
    const badResult = lintRecommendationsCitations(badRecsMd);
    expect(badResult.violations).toHaveLength(1);
    expect(badResult.violations[0]).toMatch(/Model Bumps/);
    expect(badResult.violations[0]).toMatch(/sandwich-architect/);

    // GOOD fixture: all proposal bullets have citations → 0 violations
    const goodResult = lintRecommendationsCitations(goodRecsMd);
    expect(goodResult.violations).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Case 4 — master-planner v3 cite mandate
  // -------------------------------------------------------------------------
  it('Case 4 — master-planner v3: contains routing-recommendations >= 2 hits AND Phase 0.5 section', () => {
    // Verifies 6.2.4 Part B §B.2 deliverable: master-planner.md has Phase 0.5
    // section and cites routing-recommendations file at least twice.
    expect(existsSync(MASTER_PLANNER), 'master-planner.md must exist').toBe(true);

    const content = readFileSync(MASTER_PLANNER, 'utf8');

    // routing-recommendations must appear >= 2 times (frontmatter + body)
    const routingRecsMatches = (content.match(/routing-recommendations/g) ?? []).length;
    expect(
      routingRecsMatches,
      `routing-recommendations count=${routingRecsMatches}, expected >= 2`,
    ).toBeGreaterThanOrEqual(2);

    // Phase 0.5 section header must be present exactly once
    const phase05Matches = (content.match(/^### Phase 0\.5:/gm) ?? []).length;
    expect(
      phase05Matches,
      `Phase 0.5 section count=${phase05Matches}, expected === 1`,
    ).toBe(1);
  });
});
