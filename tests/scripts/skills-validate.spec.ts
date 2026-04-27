/**
 * Vitest specs for scripts/skills-validate.ts
 *
 * Covers the 12 test cases from §3.1.D of the session plan.
 * Cases #1..#10 are mandatory; #11 and #12 are bonus.
 *
 * Fixture layout:
 *   tests/scripts/fixtures/skills-roots/<case>-root/<skill-name>/SKILL.md
 *   Each case gets its own isolated root so validateAllSkills scans exactly one skill.
 */

import { describe, it, expect } from 'vitest';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateAllSkills,
  parseSkillFrontmatter,
  countBodyLines,
  DEFAULT_OPTIONS,
  type ValidatorOptions,
} from '../../scripts/skills-validate.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Absolute path to fixtures/skills-roots/ */
const ROOTS_DIR = resolve(__dirname, 'fixtures', 'skills-roots');

/**
 * Build a ValidatorOptions targeting an isolated root directory.
 * rootName corresponds to a subdir of ROOTS_DIR containing exactly one skill.
 */
function optsFor(rootName: string, overrides?: Partial<ValidatorOptions>): ValidatorOptions {
  return {
    ...DEFAULT_OPTIONS,
    rootDir: join(ROOTS_DIR, rootName),
    strict: false,
    ...overrides,
  };
}

describe('skills-validate', () => {
  // ─────────────────────────────────────────────────────────────────
  // Case #1: minimum-valid skill passes clean
  // ─────────────────────────────────────────────────────────────────
  it('#1 parses minimum-valid skill clean', async () => {
    const result = await validateAllSkills(optsFor('valid-skill-root'));
    expect(result.errors, `errors: ${JSON.stringify(result.errors)}`).toHaveLength(0);
    expect(result.warnings, `warnings: ${JSON.stringify(result.warnings)}`).toHaveLength(0);
    expect(result.scannedSkills).toBe(1);
  });

  // ─────────────────────────────────────────────────────────────────
  // Case #2: rejects missing frontmatter
  // ─────────────────────────────────────────────────────────────────
  it('#2 rejects missing frontmatter', async () => {
    const result = await validateAllSkills(optsFor('no-frontmatter-root'));
    expect(result.errors.length, `errors: ${JSON.stringify(result.errors)}`).toBeGreaterThan(0);
    expect(result.errors[0]?.rule).toBe('frontmatter-required');
  });

  // ─────────────────────────────────────────────────────────────────
  // Case #3: rejects name mismatch
  // ─────────────────────────────────────────────────────────────────
  it('#3 rejects name mismatch', async () => {
    const result = await validateAllSkills(optsFor('wrong-name-root'));
    const mismatch = result.errors.find((e) => e.rule === 'name-mismatch');
    expect(mismatch, `expected name-mismatch, got: ${JSON.stringify(result.errors)}`).toBeDefined();
  });

  // ─────────────────────────────────────────────────────────────────
  // Case #4: flags oversize body as ERROR (not legacy)
  // ─────────────────────────────────────────────────────────────────
  it('#4 flags oversize body as ERROR when maxBodyLines=150', async () => {
    const result = await validateAllSkills(optsFor('oversized-skill-root', { maxBodyLines: 150 }));
    const oversizeErr = result.errors.find((e) => e.rule === 'oversize-body');
    expect(oversizeErr, `expected oversize-body error, got: ${JSON.stringify(result.errors)}`).toBeDefined();
  });

  // ─────────────────────────────────────────────────────────────────
  // Case #5: warns on description > 200 chars (v2.0 default, exit 0)
  // ─────────────────────────────────────────────────────────────────
  it('#5 warns on description > 200 chars (v2.0 default)', async () => {
    const result = await validateAllSkills(optsFor('long-description-root'));
    const descWarn = result.warnings.find((w) => w.rule === 'description-too-long');
    expect(descWarn, `expected description-too-long warning, got: ${JSON.stringify(result.warnings)}`).toBeDefined();
    // Must not be promoted to error in non-strict mode
    expect(result.errors.filter((e) => e.rule === 'description-too-long')).toHaveLength(0);
  });

  // ─────────────────────────────────────────────────────────────────
  // Case #6: escalates description warn to ERROR with strict=true
  // ─────────────────────────────────────────────────────────────────
  it('#6 escalates description warn to ERROR with --strict', async () => {
    const result = await validateAllSkills(optsFor('long-description-root', { strict: true }));
    const descErr = result.errors.find((e) => e.rule === 'description-too-long');
    expect(descErr, `expected description-too-long error in strict mode, got: ${JSON.stringify(result.errors)}`).toBeDefined();
    // Promoted to error — should not appear in warnings
    expect(result.warnings.filter((w) => w.rule === 'description-too-long')).toHaveLength(0);
  });

  // ─────────────────────────────────────────────────────────────────
  // Case #7: errors on missing allowed-tools (post-5.2.7 default)
  // ─────────────────────────────────────────────────────────────────
  it('#7 errors on missing allowed-tools (post-5.2.7 default, requireAllowedTools=true)', async () => {
    const result = await validateAllSkills(
      optsFor('missing-allowed-tools-root', { requireAllowedTools: true }),
    );
    const err = result.errors.find((e) => e.rule === 'missing-allowed-tools');
    expect(err, `expected missing-allowed-tools error, got: ${JSON.stringify(result.errors)}`).toBeDefined();
    // Must not appear as warning when promoted to error
    expect(result.warnings.filter((w) => w.rule === 'missing-allowed-tools')).toHaveLength(0);
  });

  // ─────────────────────────────────────────────────────────────────
  // Case #8: errors on missing allowed-tools when required
  // ─────────────────────────────────────────────────────────────────
  it('#8 errors on missing allowed-tools when requireAllowedTools=true', async () => {
    const result = await validateAllSkills(
      optsFor('missing-allowed-tools-root', { requireAllowedTools: true }),
    );
    const err = result.errors.find((e) => e.rule === 'missing-allowed-tools');
    expect(err, `expected missing-allowed-tools error, got: ${JSON.stringify(result.errors)}`).toBeDefined();
  });

  // ─────────────────────────────────────────────────────────────────
  // Case #9: errors on missing sibling test.md (post-5.2.8 default)
  // ─────────────────────────────────────────────────────────────────
  it('#9 errors on missing sibling test.md (post-5.2.8 default, requireSiblingTest=true)', async () => {
    const result = await validateAllSkills(
      optsFor('missing-test-root', { requireSiblingTest: true }),
    );
    const err = result.errors.find((e) => e.rule === 'missing-sibling-test');
    expect(err, `expected missing-sibling-test error, got: ${JSON.stringify(result.errors)}`).toBeDefined();
    // Must not appear as warning when promoted to error
    expect(result.warnings.filter((w) => w.rule === 'missing-sibling-test')).toHaveLength(0);
  });

  // ─────────────────────────────────────────────────────────────────
  // Case #10: errors on test.md without ## Assertions (requireSiblingTest=true)
  // ─────────────────────────────────────────────────────────────────
  it('#10 errors on test.md without ## Assertions when requireSiblingTest=true', async () => {
    const result = await validateAllSkills(
      optsFor('bad-test-md-root', { requireSiblingTest: true }),
    );
    const err = result.errors.find(
      (e) => e.rule === 'test-missing-section' || e.rule === 'test-missing-assertions',
    );
    expect(err, `expected test-missing-section or test-missing-assertions error, got: ${JSON.stringify(result.errors)}`).toBeDefined();
  });

  // ─────────────────────────────────────────────────────────────────
  // Case #11 (bonus): counts assertions correctly — 2 items < minAssertionsPerTest=3
  // ─────────────────────────────────────────────────────────────────
  it('#11 (bonus) test-too-few-assertions when assertions list has 2 items and min=3', async () => {
    const result = await validateAllSkills(
      optsFor('few-assertions-root', {
        requireSiblingTest: true,
        minAssertionsPerTest: 3,
      }),
    );
    const err = result.errors.find((e) => e.rule === 'test-too-few-assertions');
    expect(err, `expected test-too-few-assertions, got: ${JSON.stringify(result.errors)}`).toBeDefined();
  });

  // ─────────────────────────────────────────────────────────────────
  // Case #12 (bonus): smoke run against live .claude/skills/ tree
  // ─────────────────────────────────────────────────────────────────
  it('#12 (bonus) runs against live .claude/skills/ tree and scans expected count', async () => {
    const repoRoot = resolve(__dirname, '..', '..');
    const liveSkillsDir = join(repoRoot, '.claude', 'skills');
    const result = await validateAllSkills({
      ...DEFAULT_OPTIONS,
      rootDir: liveSkillsDir,
    });

    // Must scan ≥ 1 skill without crashing
    expect(result.scannedSkills, 'should scan at least 1 live skill').toBeGreaterThanOrEqual(1);

    // In v2.0, oversized skills may generate errors — that is expected.
    // We only assert the scan completed and each issue has required fields.
    for (const issue of [...result.errors, ...result.warnings]) {
      expect(issue.skill, 'each issue must have a skill name').toBeTruthy();
      expect(issue.rule, 'each issue must have a rule').toBeTruthy();
      expect(issue.file, 'each issue must have a file path').toBeTruthy();
    }
  });

  // ─────────────────────────────────────────────────────────────────
  // Unit: parseSkillFrontmatter helper
  // ─────────────────────────────────────────────────────────────────
  it('parseSkillFrontmatter returns null for content without fences', () => {
    const raw = '# Just a heading\n\nSome body.';
    const { frontmatter } = parseSkillFrontmatter(raw);
    expect(frontmatter).toBeNull();
  });

  it('parseSkillFrontmatter correctly counts body lines', () => {
    const raw = [
      '---',
      'name: test-skill',
      'description: hello',
      '---',
      '',
      'Line 1',
      'Line 2',
      'Line 3',
    ].join('\n');
    const { bodyLineCount } = parseSkillFrontmatter(raw);
    // Lines after second ---: "", "Line 1", "Line 2", "Line 3" = 4 lines
    // trailing empties stripped: none, so count = 4
    expect(bodyLineCount).toBe(4);
  });

  it('countBodyLines ignores trailing blank lines', () => {
    const raw = '---\nname: x\n---\nLine 1\nLine 2\n\n\n';
    const count = countBodyLines(raw);
    expect(count).toBe(2);
  });

  it('countBodyLines returns all lines when no fences', () => {
    const raw = 'no fences\nhere';
    const count = countBodyLines(raw);
    expect(count).toBe(2);
  });
});
