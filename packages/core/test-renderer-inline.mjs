import { PromptRenderer } from './src/modules/handoff/prompt-renderer.js';
import { HANDOFF_MAX_CHARS } from './src/modules/handoff/types.js';

function makeDegradedDiff() {
  return { fromRef: 'abc0000', toRef: 'abc0001', files: [], totalInsertions: 0, totalDeletions: 0, degraded: true, degradedReason: 'git not available' };
}
function makeCleanDiff(fileCount) {
  const files = Array.from({ length: fileCount }, (_, i) => ({ path: `src/file-${i}.ts`, insertions: 100, deletions: 10, binary: false }));
  return { fromRef: 'abc0000', toRef: 'abc0001', files, totalInsertions: fileCount * 100, totalDeletions: fileCount * 10, degraded: false };
}
function makeLogSummary(opts) {
  const chars = opts.charsPerItem ?? 50;
  const pad = (prefix, i) => `${prefix}-${i} ${'x'.repeat(Math.max(0, chars - prefix.length - 5))}`;
  return {
    filePath: '/fake/sessions/synthetic.md',
    completed: Array.from({ length: opts.completedCount }, (_, i) => ({ title: pad('Completed task', i), detail: pad('Completed task', i) })),
    pending: Array.from({ length: opts.pendingCount }, (_, i) => ({ title: pad('Pending task', i), detail: pad('Pending task', i) })),
    decisions: Array.from({ length: opts.decisionsCount }, (_, i) => ({ id: String(i).padStart(3, '0'), title: pad('Decision title', i), detail: pad('Decision detail', i) })),
    nextSessionPickup: opts.pickupText ?? null,
    missingSections: [],
  };
}
function makeCtx(overrides = {}) {
  return {
    sessionId: 'session-test-001', projectId: 'project-test', endedAt: '2026-04-25T12:00:00.000Z', endedReason: 'CONTEXT_FULL',
    gitDiff: overrides.gitDiff ?? makeDegradedDiff(),
    logSummary: overrides.logSummary !== undefined ? overrides.logSummary : { filePath: '/fake/sessions/empty.md', completed: [], pending: [], decisions: [], nextSessionPickup: null, missingSections: [] },
    degraded: false, degradedReasons: [],
    ...overrides,
  };
}
function makeLargeCtx() {
  const pickup = 'Next session pickup text. '.repeat(120);
  return makeCtx({
    gitDiff: makeCleanDiff(50),
    logSummary: makeLogSummary({ completedCount: 200, pendingCount: 5, decisionsCount: 200, pickupText: pickup, charsPerItem: 60 }),
  });
}

const renderer = new PromptRenderer();

// T-CAP-1
const ctx1 = makeLargeCtx();
const r1 = renderer.render(ctx1);
console.log('T-CAP-1 result.text.length:', r1.text.length, 'HANDOFF_MAX_CHARS:', HANDOFF_MAX_CHARS);
console.log('T-CAP-1 text <= HANDOFF_MAX_CHARS:', r1.text.length <= HANDOFF_MAX_CHARS);
console.log('T-CAP-1 truncated:', r1.truncated);
console.log('T-CAP-1 truncationActions count:', r1.truncationActions.length);

// T-CAP-3
const ctx3 = makeCtx({
  gitDiff: makeCleanDiff(20),
  logSummary: makeLogSummary({ completedCount: 100, pendingCount: 50, decisionsCount: 100, charsPerItem: 80 }),
});
const r3 = renderer.render(ctx3, 200);
console.log('\nT-CAP-3 result.text.length:', r3.text.length, 'hardCap:', 800);
console.log('T-CAP-3 truncationActions count:', r3.truncationActions.length);
let missingCount = 0;
for (let i = 0; i < 50; i++) {
  if (!r3.text.includes(`Pending task-${i} `)) {
    if (missingCount < 5) console.log('T-CAP-3: MISSING pending item', i);
    missingCount++;
  }
}
console.log('T-CAP-3: missing pending items:', missingCount);
console.log('T-CAP-3 text over hardCap?', r3.text.length > 800);
