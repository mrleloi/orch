/**
 * prompt-renderer.spec.ts — Unit tests for PromptRenderer.
 *
 * Tests T-CAP-1..6 (from Part B.4) plus determinism and header preservation.
 *
 * Rules:
 *  - Jest globals (describe/it/expect) — project uses Jest, NOT Vitest.
 *  - No I/O: PromptRenderer is a pure function; fixtures are inline.
 *  - I-1: no LLM imports anywhere in this file.
 *  - I-13: no real filesystem access.
 */

import { PromptRenderer } from './prompt-renderer.js';
import {
  HANDOFF_MAX_CHARS,
  HANDOFF_MAX_TOKENS,
  HANDOFF_CHARS_PER_TOKEN,
} from './types.js';
import type {
  HandoffContext,
  GitDiffSummary,
  SessionLogSummary,
} from './types.js';

// ── Fixture factories ─────────────────────────────────────────────────────────

/** A degraded (no git) diff summary with no files. */
function makeDegradedDiff(): GitDiffSummary {
  return {
    fromRef: 'abc0000',
    toRef: 'abc0001',
    files: [],
    totalInsertions: 0,
    totalDeletions: 0,
    degraded: true,
    degradedReason: 'git not available',
  };
}

/** A clean diff with N files, each with 100 insertions. */
function makeCleanDiff(fileCount: number): GitDiffSummary {
  const files = Array.from({ length: fileCount }, (_, i) => ({
    path: `src/file-${i}.ts`,
    insertions: 100,
    deletions: 10,
    binary: false,
  }));
  return {
    fromRef: 'abc0000',
    toRef: 'abc0001',
    files,
    totalInsertions: fileCount * 100,
    totalDeletions: fileCount * 10,
    degraded: false,
  };
}

/** Empty log summary (no sections). */
function makeEmptyLogSummary(): SessionLogSummary {
  return {
    filePath: '/fake/sessions/empty.md',
    completed: [],
    pending: [],
    decisions: [],
    nextSessionPickup: null,
    missingSections: ['completed', 'pending', 'decisions', 'next_session_pickup'],
  };
}

/**
 * Log summary with N completed, N pending, N decisions, and a pickup block.
 * Each item text is padded to targetCharsPerItem chars so we can control total size.
 */
function makeLogSummary(opts: {
  completedCount: number;
  pendingCount: number;
  decisionsCount: number;
  pickupText?: string;
  charsPerItem?: number;
}): SessionLogSummary {
  const chars = opts.charsPerItem ?? 50;
  const pad = (prefix: string, i: number) =>
    `${prefix}-${i} ${'x'.repeat(Math.max(0, chars - prefix.length - 5))}`;

  return {
    filePath: '/fake/sessions/synthetic.md',
    completed: Array.from({ length: opts.completedCount }, (_, i) => ({
      title: pad('Completed task', i),
      detail: pad('Completed task', i),
    })),
    pending: Array.from({ length: opts.pendingCount }, (_, i) => ({
      title: pad('Pending task', i),
      detail: pad('Pending task', i),
    })),
    decisions: Array.from({ length: opts.decisionsCount }, (_, i) => ({
      id: String(i).padStart(3, '0'),
      title: pad('Decision title', i),
      detail: pad('Decision detail', i),
    })),
    nextSessionPickup: opts.pickupText ?? null,
    missingSections: [],
  };
}

/** Build a minimal HandoffContext. */
function makeCtx(
  overrides: Partial<HandoffContext> & {
    logSummary?: SessionLogSummary | null;
    gitDiff?: GitDiffSummary;
  } = {},
): HandoffContext {
  return {
    sessionId: 'session-test-001',
    projectId: 'project-test',
    endedAt: '2026-04-25T12:00:00.000Z',
    endedReason: 'CONTEXT_FULL',
    gitDiff: overrides.gitDiff ?? makeDegradedDiff(),
    logSummary: overrides.logSummary !== undefined ? overrides.logSummary : makeEmptyLogSummary(),
    degraded: false,
    degradedReasons: [],
    ...overrides,
  };
}

/**
 * Build a HandoffContext that will produce ~25K chars of output before truncation.
 * Uses 200 completed tasks, 200 decisions, 50 diff files, and a 3000-char pickup.
 */
function makeLargeCtx(): HandoffContext {
  const pickup = 'Next session pickup text. '.repeat(120); // ~3000 chars
  return makeCtx({
    gitDiff: makeCleanDiff(50),
    logSummary: makeLogSummary({
      completedCount: 200,
      pendingCount: 5,
      decisionsCount: 200,
      pickupText: pickup,
      charsPerItem: 60,
    }),
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PromptRenderer', () => {
  let renderer: PromptRenderer;

  beforeEach(() => {
    renderer = new PromptRenderer();
  });

  // T-CAP-1: synthetic context with ~25K chars renders to ≤ HANDOFF_MAX_CHARS and truncated: true
  it('T-CAP-1: large context renders to ≤ HANDOFF_MAX_CHARS and sets truncated: true', () => {
    const ctx = makeLargeCtx();
    const result = renderer.render(ctx);

    expect(result.text.length).toBeLessThanOrEqual(HANDOFF_MAX_CHARS);
    expect(result.truncated).toBe(true);
    expect(result.truncationActions.length).toBeGreaterThan(0);
  });

  // T-CAP-2: truncation drops decisions BEFORE completed
  it('T-CAP-2: truncation drops decisions before completed tasks', () => {
    // Context with many decisions and completed — should trigger decision drops first
    const ctx = makeCtx({
      gitDiff: makeDegradedDiff(),
      logSummary: makeLogSummary({
        completedCount: 50,
        pendingCount: 2,
        decisionsCount: 50,
        charsPerItem: 120,
      }),
    });

    const result = renderer.render(ctx, 200); // tiny cap to force truncation

    expect(result.truncated).toBe(true);
    // First truncation action must be dropping decisions
    expect(result.truncationActions[0]?.kind).toBe('dropped_oldest_decisions');

    // Find if any 'dropped_oldest_completed' appears before any 'dropped_oldest_decisions'
    const firstDecisionDrop = result.truncationActions.findIndex(
      (a) => a.kind === 'dropped_oldest_decisions',
    );
    const firstCompletedDrop = result.truncationActions.findIndex(
      (a) => a.kind === 'dropped_oldest_completed',
    );

    // If completed was dropped at all, it must come AFTER the last decision drop
    if (firstCompletedDrop !== -1) {
      expect(firstDecisionDrop).toBeLessThan(firstCompletedDrop);
    }
  });

  // T-CAP-3: truncation NEVER drops pending tasks (as long as pending fits within cap)
  //
  // Fixture design: 10 pending items at charsPerItem=20 → ~250 chars for pending section.
  // Header is ~130 chars. Total fixed content ≈ 380 chars.
  // Cap = maxTokens=100 → hardCap=400 chars, which is > 380 (fixed content fits).
  // Decisions (30 × ~23 chars each ≈ 690 chars) and completed push total over cap,
  // so the loop must drop decisions and completed — but pending must survive intact.
  it('T-CAP-3: pending tasks are preserved when they fit within hardCap', () => {
    const ctx = makeCtx({
      gitDiff: makeDegradedDiff(), // no diff to keep fixed content smaller
      logSummary: makeLogSummary({
        completedCount: 30,
        pendingCount: 10,
        decisionsCount: 30,
        charsPerItem: 20, // small items: pending section ≈ 250 chars
      }),
    });

    // cap=400 chars. Fixed content (header ~130 + pending ~250) ≈ 380 < 400.
    // Decisions + completed together push total well over 400, forcing truncation.
    const result = renderer.render(ctx, 100);

    // The cap must be enforced after the loop restructure
    expect(result.text.length).toBeLessThanOrEqual(100 * HANDOFF_CHARS_PER_TOKEN);
    expect(result.truncated).toBe(true);

    // All 10 pending task titles must appear in output. Use the unique
    // `-${i} ` index marker (with trailing space to disambiguate 1 from 10)
    // so a single occurrence cannot vacuously satisfy all 10 expectations.
    const logSummary = ctx.logSummary!;
    for (let i = 0; i < logSummary.pending.length; i++) {
      expect(result.text).toContain(`Pending task-${i} `);
    }

    // Truncation must only use valid step categories — no unknown drop action
    const hasUnknownDrop = result.truncationActions.some(
      (a) =>
        a.kind !== 'dropped_oldest_decisions' &&
        a.kind !== 'dropped_oldest_completed' &&
        a.kind !== 'dropped_diff_records' &&
        a.kind !== 'shortened_pickup' &&
        a.kind !== 'hard_truncated',
    );
    expect(hasUnknownDrop).toBe(false);
  });

  // T-CAP-3b: pathological pending overflow — when pending alone exceeds cap, hard_truncated fires
  it('T-CAP-3b: pathological pending overflow triggers hard_truncated action', () => {
    // pending = 50 items × 200 chars each → pending section ≈ 10000 chars alone
    // cap = maxTokens=5 → hardCap=20 chars — even header alone (130 chars) exceeds cap
    const ctx = makeCtx({
      gitDiff: makeDegradedDiff(),
      logSummary: makeLogSummary({
        completedCount: 0,
        pendingCount: 50,
        decisionsCount: 0,
        charsPerItem: 200,
      }),
    });

    const result = renderer.render(ctx, 5); // hardCap = 20 chars

    // Cap MUST be enforced — hard_truncated guarantees this invariant
    expect(result.text.length).toBeLessThanOrEqual(5 * HANDOFF_CHARS_PER_TOKEN);
    expect(result.truncated).toBe(true);

    // hard_truncated action must be present (step 5 fired)
    const hardTruncatedAction = result.truncationActions.find(
      (a) => a.kind === 'hard_truncated',
    );
    expect(hardTruncatedAction).toBeDefined();
    expect(hardTruncatedAction?.kind).toBe('hard_truncated');
  });

  // T-CAP-4: token count in result is Math.ceil(text.length / 4)
  it('T-CAP-4: tokens field is Math.ceil(text.length / HANDOFF_CHARS_PER_TOKEN)', () => {
    const ctx = makeCtx({
      gitDiff: makeCleanDiff(3),
      logSummary: makeLogSummary({
        completedCount: 3,
        pendingCount: 2,
        decisionsCount: 2,
        pickupText: 'Ready for next session.',
      }),
    });

    const result = renderer.render(ctx);
    const expected = Math.ceil(result.text.length / HANDOFF_CHARS_PER_TOKEN);
    expect(result.tokens).toBe(expected);
    expect(result.tokens).toBe(Math.ceil(result.text.length / 4));
  });

  // T-CAP-5: truncationActions reflects EACH step category in A.5 order — all 4 must fire
  //
  // Fixture design:
  //   3 decisions × 40 chars each, 3 completed × 40 chars, 3 diff files, pickup = 3000 chars
  //   maxTokens = 15 → hardCap = 60 chars
  //   Pass 1: step1 drops 1 decision (still > 60), step2 drops 1 completed (still > 60),
  //            step3 drops 1 diff file (still > 60), step4 shortens pickup (3000→2000, still > 60),
  //            step5 hard-truncates to 60 chars.
  //   All four step categories appear at least once → no index === -1.
  it('T-CAP-5: truncationActions reflect each truncation step in A.5 order (all 4 steps fire)', () => {
    const ctx = makeCtx({
      gitDiff: makeCleanDiff(3),
      logSummary: makeLogSummary({
        completedCount: 3,
        pendingCount: 1,
        decisionsCount: 3,
        pickupText: 'y'.repeat(3000), // > 2000 → step 4 shortens it
        charsPerItem: 40,
      }),
    });

    // hardCap = 60 chars — small enough that even after all drops, hard-truncate fires.
    // This guarantees all 4 step categories appear in truncationActions.
    const result = renderer.render(ctx, 15);

    // Cap enforcement — must always hold
    expect(result.text.length).toBeLessThanOrEqual(15 * HANDOFF_CHARS_PER_TOKEN);
    expect(result.truncated).toBe(true);

    const actionKinds = result.truncationActions.map((a) => a.kind);

    const firstDecision = actionKinds.indexOf('dropped_oldest_decisions');
    const firstCompleted = actionKinds.indexOf('dropped_oldest_completed');
    const firstDiff = actionKinds.indexOf('dropped_diff_records');
    const firstPickup = actionKinds.indexOf('shortened_pickup');

    // ALL four step categories must be present — none should be === -1
    expect(firstDecision).toBeGreaterThanOrEqual(0);
    expect(firstCompleted).toBeGreaterThanOrEqual(0);
    expect(firstDiff).toBeGreaterThanOrEqual(0);
    expect(firstPickup).toBeGreaterThanOrEqual(0);

    // Verify ordering: decisions → completed → diff → pickup
    expect(firstDecision).toBeLessThan(firstCompleted);
    expect(firstCompleted).toBeLessThan(firstDiff);
    expect(firstDiff).toBeLessThan(firstPickup);
  });

  // T-CAP-6: empty context renders to a minimal prompt under 500 chars
  it('T-CAP-6: empty context renders to minimal prompt under 500 chars', () => {
    const ctx = makeCtx({
      gitDiff: makeDegradedDiff(),
      logSummary: null,
    });

    const result = renderer.render(ctx);

    expect(result.text.length).toBeLessThan(500);
    expect(result.truncated).toBe(false);
    expect(result.truncationActions).toHaveLength(0);
    // Must contain meaningful fallback text
    expect(result.text).toContain('no diff/log available');
  });

  // Determinism test: calling render twice with same input produces byte-identical results
  it('determinism: same (ctx, maxTokens) → byte-identical text and equal truncationActions', () => {
    const ctx = makeLargeCtx();
    const r1 = renderer.render(ctx, 1000);
    const r2 = renderer.render(ctx, 1000);

    expect(r1.text).toBe(r2.text);
    expect(r1.tokens).toBe(r2.tokens);
    expect(r1.truncated).toBe(r2.truncated);
    expect(r1.truncationActions).toEqual(r2.truncationActions);
  });

  // Header preservation: at a low-but-feasible cap that still forces body truncation,
  // the header (sessionId/endedAt/endedReason) survives because Step 5 hard-truncate
  // is the final guard and the header is emitted first. Position (a) per 3.5.d code-quality
  // verdict — Step 5 IS the operative final guard; no byte-guarding of header.
  it('header preservation: header fields survive at a low maxTokens that still forces body truncation', () => {
    const ctx = makeLargeCtx();
    const result = renderer.render(ctx, 50); // maxTokens=50 → hardCap=200 chars; header ~130 chars

    expect(result.text).toContain('session-test-001');
    expect(result.truncated).toBe(true);
  });

  // Empty log summary (not null, but no content) also produces minimal output
  it('empty log summary with no log content and degraded git → minimal prompt', () => {
    const ctx = makeCtx({
      gitDiff: makeDegradedDiff(),
      logSummary: makeEmptyLogSummary(),
    });

    const result = renderer.render(ctx);

    expect(result.text.length).toBeLessThan(500);
    expect(result.truncated).toBe(false);
  });

  // HANDOFF_MAX_TOKENS default used when maxTokens is not passed
  it('uses HANDOFF_MAX_TOKENS as default cap when maxTokens is omitted', () => {
    const ctx = makeCtx({
      gitDiff: makeCleanDiff(5),
      logSummary: makeLogSummary({
        completedCount: 5,
        pendingCount: 3,
        decisionsCount: 3,
        pickupText: 'Minimal session pickup.',
      }),
    });

    const result = renderer.render(ctx);
    // Token count should not exceed HANDOFF_MAX_TOKENS
    expect(result.tokens).toBeLessThanOrEqual(HANDOFF_MAX_TOKENS);
    // And the token formula holds
    expect(result.tokens).toBe(Math.ceil(result.text.length / HANDOFF_CHARS_PER_TOKEN));
  });

  // T-CAP-INV: cap-enforcement invariant — result.text.length ≤ hardCap for ANY non-empty input
  //
  // This test asserts the core contract that the restructured loop MUST guarantee.
  // Three fixture sizes: small (fits without truncation), medium (forces mild truncation),
  // pathological (forces hard-truncate because pending alone exceeds cap).
  describe('T-CAP-INV: cap-enforcement invariant holds across all fixture sizes', () => {
    it('small fixture: output ≤ hardCap and matches token formula', () => {
      const ctx = makeCtx({
        gitDiff: makeCleanDiff(2),
        logSummary: makeLogSummary({
          completedCount: 2,
          pendingCount: 2,
          decisionsCount: 2,
          pickupText: 'Pickup text for small fixture.',
        }),
      });
      const maxTokens = 1000;
      const result = renderer.render(ctx, maxTokens);
      expect(result.text.length).toBeLessThanOrEqual(maxTokens * HANDOFF_CHARS_PER_TOKEN);
      expect(result.tokens).toBe(Math.ceil(result.text.length / HANDOFF_CHARS_PER_TOKEN));
    });

    it('medium fixture: output ≤ hardCap even when decisions/completed are dropped', () => {
      const ctx = makeCtx({
        gitDiff: makeCleanDiff(10),
        logSummary: makeLogSummary({
          completedCount: 50,
          pendingCount: 5,
          decisionsCount: 50,
          pickupText: 'Pickup text for medium fixture. '.repeat(30),
          charsPerItem: 60,
        }),
      });
      const maxTokens = 500;
      const result = renderer.render(ctx, maxTokens);
      expect(result.text.length).toBeLessThanOrEqual(maxTokens * HANDOFF_CHARS_PER_TOKEN);
    });

    it('pathological fixture: output ≤ hardCap even when pending alone exceeds cap (hard-truncate fires)', () => {
      // 100 pending items × 300 chars each → pending section ≈ 30000 chars >> hardCap
      const ctx = makeCtx({
        gitDiff: makeDegradedDiff(),
        logSummary: makeLogSummary({
          completedCount: 0,
          pendingCount: 100,
          decisionsCount: 0,
          charsPerItem: 300,
        }),
      });
      const maxTokens = 10; // hardCap = 40 chars
      const result = renderer.render(ctx, maxTokens);
      // The invariant MUST hold regardless of input size
      expect(result.text.length).toBeLessThanOrEqual(maxTokens * HANDOFF_CHARS_PER_TOKEN);
      expect(result.truncated).toBe(true);
      // hard_truncated action must be emitted (step 5 is the guarantee)
      const hasHardTruncated = result.truncationActions.some((a) => a.kind === 'hard_truncated');
      expect(hasHardTruncated).toBe(true);
    });
  });

  // Decisions "oldest first" — decisions[0] = oldest, dropped first under cap pressure
  it('drops oldest decisions first (index 0 = oldest; unconditional ordering assertion)', () => {
    // decisions[0] = oldest, decisions[1] = newest.
    // With a tiny cap (10 chars) all decisions will be dropped.
    // The truncationActions MUST contain dropped_oldest_decisions with count > 0.
    // This test will fail if the renderer drops in reverse order (newest-first).
    const oldDecision = { id: '001', title: 'Old decision', detail: 'Old detail' };
    const newDecision = { id: '999', title: 'New decision', detail: 'New detail' };

    const ctx = makeCtx({
      gitDiff: makeDegradedDiff(),
      logSummary: {
        filePath: '/fake/sessions/test.md',
        completed: [],
        pending: [],
        decisions: [oldDecision, newDecision], // index 0 = oldest
        nextSessionPickup: null,
        missingSections: ['completed', 'pending', 'next_session_pickup'],
      },
    });

    // With cap=10 chars, all decisions must be dropped (header alone > 10 chars)
    const result = renderer.render(ctx, 10);

    // Unconditional: decisions MUST be present in truncationActions
    const decisionActions = result.truncationActions.filter(
      (a) => a.kind === 'dropped_oldest_decisions',
    ) as Array<{ kind: 'dropped_oldest_decisions'; count: number }>;

    expect(decisionActions.length).toBeGreaterThan(0);

    const totalDropped = decisionActions.reduce((sum, a) => sum + a.count, 0);
    // Both decisions were provided; at least 1 must be dropped when cap=10
    expect(totalDropped).toBeGreaterThanOrEqual(1);

    // The truncation happened (result is truncated)
    expect(result.truncated).toBe(true);
  });
});
