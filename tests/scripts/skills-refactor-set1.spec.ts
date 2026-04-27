/**
 * Vitest specs for Task 5.2.5 -- Refactor SKILL.md Set #1
 *
 * Mirrors the 8-case structure from section 3.4.D of the session plan.
 * Baselines: otel-tracing=350, prisma-sqlite=278, profile-yaml=270
 */

import { describe, it, expect } from 'vitest';
import { resolve, join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const REPO_ROOT = resolve(__dirname, '..', '..');
const SKILLS_DIR = join(REPO_ROOT, '.claude', 'skills');

/** Count total lines in a file */
function lineCount(filePath: string): number {
  if (!existsSync(filePath)) return 0;
  return readFileSync(filePath, 'utf8').split('\n').length;
}

/** Count body lines (lines after the second --- fence, trailing blanks stripped) */
function bodyLineCount(filePath: string): number {
  if (!existsSync(filePath)) return 0;
  const lines = readFileSync(filePath, 'utf8').split('\n');
  let fenceCount = 0;
  let bodyStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === '---') {
      fenceCount++;
      if (fenceCount === 2) { bodyStart = i + 1; break; }
    }
  }
  if (bodyStart === -1) return lines.length;
  const body = lines.slice(bodyStart);
  let end = body.length;
  while (end > 0 && (body[end - 1] ?? '').trim() === '') end--;
  return end;
}

/** Parse allowed-tools from SKILL.md frontmatter */
function parseAllowedTools(filePath: string): string[] | null {
  if (!existsSync(filePath)) return null;
  const content = readFileSync(filePath, 'utf8');
  const match = content.match(/allowed-tools:\s*\[([^\]]+)\]/);
  if (!match) return null;
  return (match[1] ?? '').split(',').map((s: string) => s.trim());
}

/** Sum line counts across multiple files */
function sumLines(paths: string[]): number {
  return paths.reduce((sum, p) => sum + lineCount(p), 0);
}

describe('skills-refactor-set1', () => {
  // Case #1: otel-tracing SKILL.md body lines <= 150
  it('#1 otel-tracing SKILL.md body lines <= 150', () => {
    const skillPath = join(SKILLS_DIR, 'otel-tracing', 'SKILL.md');
    const count = bodyLineCount(skillPath);
    expect(count, `otel-tracing body lines: ${count}`).toBeLessThanOrEqual(150);
  });

  // Case #2: prisma-sqlite SKILL.md body lines <= 150
  it('#2 prisma-sqlite SKILL.md body lines <= 150', () => {
    const skillPath = join(SKILLS_DIR, 'prisma-sqlite', 'SKILL.md');
    const count = bodyLineCount(skillPath);
    expect(count, `prisma-sqlite body lines: ${count}`).toBeLessThanOrEqual(150);
  });

  // Case #3: profile-yaml SKILL.md body lines <= 150
  it('#3 profile-yaml SKILL.md body lines <= 150', () => {
    const skillPath = join(SKILLS_DIR, 'profile-yaml', 'SKILL.md');
    const count = bodyLineCount(skillPath);
    expect(count, `profile-yaml body lines: ${count}`).toBeLessThanOrEqual(150);
  });

  // Case #4: content preservation: otel-tracing
  it('#4 content preservation: otel-tracing sum >= 350 (baseline)', () => {
    const base = join(SKILLS_DIR, 'otel-tracing');
    const paths = [
      join(base, 'SKILL.md'),
      join(base, 'references', 'spans.md'),
      join(base, 'references', 'config.md'),
      join(base, 'references', 'exporters.md'),
      join(base, 'references', 'propagation.md'),
    ];
    const total = sumLines(paths);
    expect(total, `otel-tracing content sum: ${total}`).toBeGreaterThanOrEqual(350);
  });

  // Case #5: content preservation: prisma-sqlite
  it('#5 content preservation: prisma-sqlite sum >= 278 (baseline)', () => {
    const base = join(SKILLS_DIR, 'prisma-sqlite');
    const paths = [
      join(base, 'SKILL.md'),
      join(base, 'references', 'schema-patterns.md'),
      join(base, 'references', 'wal.md'),
      join(base, 'references', 'repository-pattern.md'),
      join(base, 'references', 'migrations.md'),
    ];
    const total = sumLines(paths);
    expect(total, `prisma-sqlite content sum: ${total}`).toBeGreaterThanOrEqual(278);
  });

  // Case #6: content preservation: profile-yaml
  it('#6 content preservation: profile-yaml sum >= 270 (baseline)', () => {
    const base = join(SKILLS_DIR, 'profile-yaml');
    const paths = [
      join(base, 'SKILL.md'),
      join(base, 'references', 'parsing.md'),
      join(base, 'references', 'cross-field-validation.md'),
      join(base, 'references', 'hot-reload.md'),
      join(base, 'references', 'secrets-and-interactive.md'),
    ];
    const total = sumLines(paths);
    expect(total, `profile-yaml content sum: ${total}`).toBeGreaterThanOrEqual(270);
  });

  // Case #7: all reference index files exist for all 3 skills
  it('#7 all reference index files exist for all 3 skills', () => {
    const refFiles: Record<string, string[]> = {
      'otel-tracing': ['spans.md', 'config.md', 'exporters.md', 'propagation.md'],
      'prisma-sqlite': ['schema-patterns.md', 'wal.md', 'repository-pattern.md', 'migrations.md'],
      'profile-yaml': ['parsing.md', 'cross-field-validation.md', 'hot-reload.md', 'secrets-and-interactive.md'],
    };

    for (const [skill, refs] of Object.entries(refFiles)) {
      for (const ref of refs) {
        const p = join(SKILLS_DIR, skill, 'references', ref);
        expect(existsSync(p), `${skill}/references/${ref} should exist`).toBe(true);
      }
    }
  });

  // Case #8: each SKILL.md has correct allowed-tools frontmatter
  it('#8 allowed-tools frontmatter present and correct for all 3 skills', () => {
    const expected: Record<string, string[]> = {
      'otel-tracing': ['Read', 'Bash', 'Grep', 'Edit'],
      'prisma-sqlite': ['Read', 'Bash', 'Grep', 'Edit'],
      'profile-yaml': ['Read', 'Bash', 'Edit'],
    };

    for (const [skill, tools] of Object.entries(expected)) {
      const p = join(SKILLS_DIR, skill, 'SKILL.md');
      const found = parseAllowedTools(p);
      expect(found, `${skill} should have allowed-tools in frontmatter`).not.toBeNull();
      if (found !== null) {
        for (const tool of tools) {
          expect(found, `${skill} allowed-tools should include ${tool}`).toContain(tool);
        }
      }
    }
  });
});
