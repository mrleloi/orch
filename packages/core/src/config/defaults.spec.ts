/**
 * Invariant test: no DEFAULT_* constants may be declared outside config/defaults.ts.
 *
 * Re-exports of the form `export { DEFAULT_X } from '...'` are PERMITTED.
 * Only `export const DEFAULT_` declarations are violations.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const SRC_ROOT = resolve(__dirname, '..');
const DECL_PATTERN = /^export const DEFAULT_/m;

async function collectTsFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.ts'))
    .map((e) => {
      // Node 20: withFileTypes+recursive gives parentPath on the entry
      const parent = (e as unknown as { parentPath?: string; path?: string }).parentPath
        ?? (e as unknown as { path?: string }).path
        ?? dir;
      return join(parent, e.name);
    });
}

describe('DEFAULT_* constants centralisation invariant', () => {
  it('no DEFAULT_* declarations exist outside config/defaults.ts', async () => {
    const allFiles = await collectTsFiles(SRC_ROOT);

    const filesToCheck = allFiles.filter((f) => {
      const rel = f.replace(/\\/g, '/');
      return (
        !rel.includes('/config/defaults.ts') &&
        !rel.endsWith('.spec.ts') &&
        !rel.endsWith('.test.ts')
      );
    });

    const violations: { file: string; line: number; text: string }[] = [];

    for (const file of filesToCheck) {
      const content = await readFile(file, 'utf8');
      const lines = content.split('\n');
      lines.forEach((line, idx) => {
        if (DECL_PATTERN.test(line)) {
          violations.push({ file, line: idx + 1, text: line.trim() });
        }
      });
    }

    if (violations.length > 0) {
      const details = violations
        .map((v) => `  ${v.file}:${v.line} -> ${v.text}`)
        .join('\n');
      throw new Error(
        `Found ${violations.length} DEFAULT_* declaration(s) outside config/defaults.ts:\n${details}\n` +
          `Move them to packages/core/src/config/defaults.ts and re-export if needed.`,
      );
    }

    expect(violations).toEqual([]);
  });
});
