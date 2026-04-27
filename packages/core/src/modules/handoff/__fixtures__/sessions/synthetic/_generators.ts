/**
 * _generators.ts — Test-time generators for large synthetic fixtures.
 *
 * These files are NOT committed as binary blobs — they are generated
 * at test setup via beforeAll() calls in session-log-parser.spec.ts.
 *
 * Decision 006: no LLM, no network. Pure string generation.
 */

import { writeFileSync } from 'node:fs';

/**
 * Generate a ~50KB markdown session log and write it to the given path.
 *
 * Structure:
 *  - 200 completed tasks (each ~100 chars)
 *  - 50 pending tasks
 *  - 10 decisions
 *  - Next Session Pickup block
 *
 * Returns: { completedCount, pendingCount, decisionsCount }
 */
export function generateHuge50kb(filePath: string): {
  completedCount: number;
  pendingCount: number;
  decisionsCount: number;
} {
  const completedCount = 200;
  const pendingCount = 50;
  const decisionsCount = 10;

  const lines: string[] = [
    '# Session X — Synthetic: huge-50kb',
    '',
    '## Goal',
    'Performance test: 50KB log should parse in < 100ms.',
    '',
    '## Accomplished',
  ];

  for (let i = 1; i <= completedCount; i++) {
    lines.push(
      `- Completed task ${i}: implemented feature ${i} with all required tests and documentation updates for the module.`,
    );
  }

  lines.push('', '## Pending');
  for (let i = 1; i <= pendingCount; i++) {
    lines.push(
      `- Pending task ${i}: still outstanding, needs review and implementation in the next session.`,
    );
  }

  lines.push('', '## Decisions Made');
  for (let i = 1; i <= decisionsCount; i++) {
    lines.push(
      `- Decision ${i}: chose approach X${i} because it aligns with charter principle ${i} and avoids technical debt.`,
    );
  }

  lines.push(
    '',
    '## Next Session Pickup',
    'Continue with remaining pending tasks.',
  );
  lines.push('');

  const content = lines.join('\n');
  writeFileSync(filePath, content, 'utf-8');
  return { completedCount, pendingCount, decisionsCount };
}

/**
 * Generate a ~300KB markdown session log and write it to the given path.
 * Used to test the LOG_TOO_LARGE error path.
 */
export function generateOver256kb(filePath: string): void {
  // One line of ~200 chars, repeated 1600 times = ~320KB
  const line =
    '- Task with very long description that repeats many times to inflate file size beyond the 256KB limit imposed by the session log parser hard cap enforcement logic.\n';
  // 1600 × ~200 = ~320KB
  const header = '# Session X — Synthetic: over-256kb\n\n## Accomplished\n';
  let content = header;
  const targetBytes = 300 * 1024; // 300KB
  while (Buffer.byteLength(content, 'utf-8') < targetBytes) {
    content += line;
  }
  writeFileSync(filePath, content, 'utf-8');
}
