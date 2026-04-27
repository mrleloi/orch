/**
 * Vitest specs for Task 5.2.6 -- Refactor SKILL.md Set #2
 *
 * Mirrors the 8-case structure from section 3.5.D of the session plan.
 * Baselines: grammy-bot=275, nestjs-module=249, claude-code-hooks=251
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

describe('skills-refactor-set2', () => {
  // Case #1: grammy-bot SKILL.md body lines <= 150
  it('#1 grammy-bot SKILL.md body lines <= 150', () => {
    const skillPath = join(SKILLS_DIR, 'grammy-bot', 'SKILL.md');
    const count = bodyLineCount(skillPath);
    expect(count, `grammy-bot body lines: ${count}`).toBeLessThanOrEqual(150);
  });

  // Case #2: nestjs-module SKILL.md body lines <= 150
  it('#2 nestjs-module SKILL.md body lines <= 150', () => {
    const skillPath = join(SKILLS_DIR, 'nestjs-module', 'SKILL.md');
    const count = bodyLineCount(skillPath);
    expect(count, `nestjs-module body lines: ${count}`).toBeLessThanOrEqual(150);
  });

  // Case #3: claude-code-hooks SKILL.md body lines <= 150
  it('#3 claude-code-hooks SKILL.md body lines <= 150', () => {
    const skillPath = join(SKILLS_DIR, 'claude-code-hooks', 'SKILL.md');
    const count = bodyLineCount(skillPath);
    expect(count, `claude-code-hooks body lines: ${count}`).toBeLessThanOrEqual(150);
  });

  // Case #4: content preservation: grammy-bot
  it('#4 content preservation: grammy-bot sum >= 275 (baseline)', () => {
    const base = join(SKILLS_DIR, 'grammy-bot');
    const paths = [
      join(base, 'SKILL.md'),
      join(base, 'references', 'bot-setup.md'),
      join(base, 'references', 'middleware.md'),
      join(base, 'references', 'handlers.md'),
      join(base, 'references', 'notifications-and-testing.md'),
    ];
    const total = sumLines(paths);
    expect(total, `grammy-bot content sum: ${total}`).toBeGreaterThanOrEqual(275);
  });

  // Case #5: content preservation: nestjs-module
  it('#5 content preservation: nestjs-module sum >= 249 (baseline)', () => {
    const base = join(SKILLS_DIR, 'nestjs-module');
    const paths = [
      join(base, 'SKILL.md'),
      join(base, 'references', 'module-template.md'),
      join(base, 'references', 'adapter-pattern.md'),
      join(base, 'references', 'cross-module-comm.md'),
      join(base, 'references', 'lifecycle-and-testing.md'),
    ];
    const total = sumLines(paths);
    expect(total, `nestjs-module content sum: ${total}`).toBeGreaterThanOrEqual(249);
  });

  // Case #6: content preservation: claude-code-hooks
  it('#6 content preservation: claude-code-hooks sum >= 251 (baseline)', () => {
    const base = join(SKILLS_DIR, 'claude-code-hooks');
    const paths = [
      join(base, 'SKILL.md'),
      join(base, 'references', 'hook-types.md'),
      join(base, 'references', 'settings-snippets.md'),
      join(base, 'references', 'payload-handling.md'),
      join(base, 'references', 'testing-and-failures.md'),
    ];
    const total = sumLines(paths);
    expect(total, `claude-code-hooks content sum: ${total}`).toBeGreaterThanOrEqual(251);
  });

  // Case #7: all reference index files exist for all 3 skills
  it('#7 all reference index files exist for all 3 skills', () => {
    const refFiles: Record<string, string[]> = {
      'grammy-bot': ['bot-setup.md', 'middleware.md', 'handlers.md', 'notifications-and-testing.md'],
      'nestjs-module': ['module-template.md', 'adapter-pattern.md', 'cross-module-comm.md', 'lifecycle-and-testing.md'],
      'claude-code-hooks': ['hook-types.md', 'settings-snippets.md', 'payload-handling.md', 'testing-and-failures.md'],
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
      'grammy-bot': ['Read', 'Bash', 'Grep', 'Edit'],
      'nestjs-module': ['Read', 'Bash', 'Grep', 'Edit'],
      'claude-code-hooks': ['Read', 'Bash', 'Grep', 'Edit'],
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
