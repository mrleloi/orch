/**
 * Skill Validator — scripts/skills-validate.ts
 *
 * Discovers .claude/skills/<name>/SKILL.md files, validates frontmatter, body size,
 * and sibling test files. Never mutates source files (INV-S10).
 *
 * Usage:
 *   pnpm skills:validate
 *   pnpm skills:validate --strict
 *   pnpm skills:validate --fix-suggest
 *   pnpm skills:validate --root <path>
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { load as yamlLoad } from 'js-yaml';
import { SkillFrontmatterSchema } from './skills-validate.schema.js';
import type { Issue, ValidationResult } from './skills-validate.schema.js';

// ─── Public re-exports ────────────────────────────────────────────────────────

export type { Issue, ValidationResult } from './skills-validate.schema.js';
export { SkillFrontmatterSchema } from './skills-validate.schema.js';

// ─── ValidatorOptions ─────────────────────────────────────────────────────────

export interface ValidatorOptions {
  // Absolute path to the skills root directory (default: <repo>/.claude/skills/)
  rootDir: string;
  // Maximum allowed body lines (default: 150)
  maxBodyLines: number;
  // Maximum allowed description chars (default: 200)
  maxDescriptionChars: number;
  // Whether missing allowed-tools is an ERROR (default: false in v2.0, true post-5.2.7)
  requireAllowedTools: boolean;
  // Whether missing sibling test is an ERROR (default: false in v2.0, true post-5.2.8)
  requireSiblingTest: boolean;
  // Minimum ordered items in the Assertions section of sibling test (default: 3)
  minAssertionsPerTest: number;
  // Promote all warnings to errors (--strict mode)
  strict: boolean;
}

// ─── Default options ──────────────────────────────────────────────────────────

export const DEFAULT_OPTIONS: Readonly<ValidatorOptions> = {
  rootDir: '', // filled in by main()
  maxBodyLines: 150,
  maxDescriptionChars: 200,
  requireAllowedTools: true,
  requireSiblingTest: true,
  minAssertionsPerTest: 3,
  strict: false,
};

// ─── Helpers (exported for isolated testing) ─────────────────────────────────

/**
 * Split raw SKILL.md into frontmatter YAML string + body text.
 * Returns null frontmatter if no valid `---` fences are found or YAML is unparseable.
 */
export function parseSkillFrontmatter(rawSkillMd: string): {
  frontmatter: unknown;
  bodyLineCount: number;
} {
  const lines = rawSkillMd.split('\n');

  // Find leading `---` fence (must be first non-empty line or line 0)
  let firstFence = -1;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]?.trim() ?? '';
    if (trimmed === '---') {
      firstFence = i;
      break;
    }
    if (trimmed !== '') {
      // Non-empty line before any fence — no frontmatter
      break;
    }
  }
  if (firstFence === -1) {
    return { frontmatter: null, bodyLineCount: lines.length };
  }

  // Find second `---` fence
  let secondFence = -1;
  for (let i = firstFence + 1; i < lines.length; i++) {
    if ((lines[i]?.trim() ?? '') === '---') {
      secondFence = i;
      break;
    }
  }
  if (secondFence === -1) {
    return { frontmatter: null, bodyLineCount: lines.length };
  }

  const yamlText = lines.slice(firstFence + 1, secondFence).join('\n');
  const bodyLines = lines.slice(secondFence + 1);
  const bodyLineCount = countNonTrailingEmptyLines(bodyLines);

  let parsed: unknown;
  try {
    parsed = yamlLoad(yamlText);
  } catch {
    return { frontmatter: null, bodyLineCount };
  }

  return { frontmatter: parsed, bodyLineCount };
}

/**
 * Count lines in an array, trimming trailing blank lines.
 */
function countNonTrailingEmptyLines(lines: string[]): number {
  let end = lines.length;
  while (end > 0 && (lines[end - 1]?.trim() ?? '') === '') {
    end--;
  }
  return end;
}

/**
 * Count body lines in a raw SKILL.md (lines AFTER the second `---` fence).
 * Trailing blank lines are excluded from count.
 */
export function countBodyLines(rawSkillMd: string): number {
  const lines = rawSkillMd.split('\n');
  let fenceCount = 0;
  let bodyStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if ((lines[i]?.trim() ?? '') === '---') {
      fenceCount++;
      if (fenceCount === 2) {
        bodyStart = i + 1;
        break;
      }
    }
  }
  if (bodyStart === -1) return lines.length;
  const body = lines.slice(bodyStart);
  return countNonTrailingEmptyLines(body);
}

/**
 * Required H2 headings in a sibling test file.
 */
const REQUIRED_TEST_HEADINGS = [
  '## Trigger',
  '## Expected behavior (PASS)',
  '## Named failure modes',
  '## Assertions',
] as const;

/**
 * Validate a sibling test file (e.g. `<name>.test.md`).
 * Returns any structural issues found. Caller handles missing-file case.
 */
export function validateSiblingTestMd(
  testMdPath: string,
  minAssertions: number,
): Issue[] {
  const issues: Issue[] = [];

  if (!existsSync(testMdPath)) {
    return issues;
  }

  const content = readFileSync(testMdPath, 'utf8');
  const lines = content.split('\n');
  const skillName = basename(testMdPath).replace(/\.test\.md$/, '');

  // Check required headings
  for (const heading of REQUIRED_TEST_HEADINGS) {
    const found = lines.some(
      (l) => l.trim() === heading || l.startsWith(heading + ' ') || l.startsWith(heading + '\r'),
    );
    if (!found) {
      issues.push({
        severity: 'error',
        rule: 'test-missing-section',
        skill: skillName,
        file: testMdPath,
        message: `Sibling test is missing required section: "${heading}"`,
      });
    }
  }

  // Count ordered list items in the Assertions section
  const assertionsIdx = lines.findIndex(
    (l) => l.trim() === '## Assertions' || l.startsWith('## Assertions ') || l.startsWith('## Assertions\r'),
  );
  if (assertionsIdx !== -1) {
    // Find next H2 (or EOF) to bound the section
    let nextH2 = lines.length;
    for (let i = assertionsIdx + 1; i < lines.length; i++) {
      if (/^## /.test(lines[i] ?? '')) {
        nextH2 = i;
        break;
      }
    }
    const section = lines.slice(assertionsIdx + 1, nextH2);
    // Ordered list items: lines matching /^\s*\d+\./
    const assertionCount = section.filter((l) => /^\s*\d+\./.test(l)).length;
    if (assertionCount < minAssertions) {
      issues.push({
        severity: 'error',
        rule: 'test-too-few-assertions',
        skill: skillName,
        file: testMdPath,
        message: `Assertions section has ${assertionCount} ordered item(s); minimum is ${minAssertions}.`,
      });
    }
  }

  return issues;
}

// ─── Core validator ───────────────────────────────────────────────────────────

/**
 * Discover all skills under opts.rootDir and validate each one.
 * Returns a ValidationResult. Never throws.
 */
export async function validateAllSkills(
  opts: ValidatorOptions,
): Promise<ValidationResult> {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];

  const skillDirs = discoverSkillDirs(opts.rootDir);

  for (const skillDir of skillDirs) {
    const skillName = basename(skillDir);
    const skillMdPath = join(skillDir, 'SKILL.md');
    const siblingTestPath = join(skillDir, `${skillName}.test.md`);

    if (!existsSync(skillMdPath)) {
      continue;
    }

    const raw = readFileSync(skillMdPath, 'utf8');
    const { frontmatter, bodyLineCount } = parseSkillFrontmatter(raw);

    // Rule: frontmatter-required
    if (frontmatter === null || typeof frontmatter !== 'object') {
      pushIssue(
        {
          severity: 'error',
          rule: 'frontmatter-required',
          skill: skillName,
          file: skillMdPath,
          message: 'SKILL.md is missing a valid YAML frontmatter block (--- ... ---)',
        },
        errors,
        warnings,
        opts.strict,
      );
      continue; // Cannot validate further without valid frontmatter
    }

    // Validate frontmatter schema
    const parsed = SkillFrontmatterSchema.safeParse(frontmatter);

    if (!parsed.success) {
      const nameIssue = parsed.error.issues.find((e) => e.path[0] === 'name');
      if (nameIssue) {
        pushIssue(
          {
            severity: 'error',
            rule: 'frontmatter-required',
            skill: skillName,
            file: skillMdPath,
            message: `Frontmatter 'name' field invalid: ${nameIssue.message}`,
          },
          errors,
          warnings,
          opts.strict,
        );
        continue;
      }
      for (const e of parsed.error.issues) {
        pushIssue(
          {
            severity: 'warning',
            rule: 'frontmatter-schema',
            skill: skillName,
            file: skillMdPath,
            message: `Frontmatter schema issue at '${e.path.join('.')}': ${e.message}`,
          },
          errors,
          warnings,
          opts.strict,
        );
      }
    }

    const fm = parsed.success
      ? parsed.data
      : (frontmatter as Record<string, unknown>);
    const frontmatterName = typeof fm['name'] === 'string' ? fm['name'] : null;

    // Rule: name-mismatch
    if (frontmatterName !== skillName) {
      pushIssue(
        {
          severity: 'error',
          rule: 'name-mismatch',
          skill: skillName,
          file: skillMdPath,
          message: `frontmatter.name "${frontmatterName ?? '(missing)'}" does not match directory name "${skillName}"`,
        },
        errors,
        warnings,
        opts.strict,
      );
    }

    // Rule: oversize-body (ERROR in v2.0 default)
    if (bodyLineCount > opts.maxBodyLines) {
      pushIssue(
        {
          severity: 'error',
          rule: 'oversize-body',
          skill: skillName,
          file: skillMdPath,
          message: `Body has ${bodyLineCount} lines; maximum is ${opts.maxBodyLines}. Refactor to <= ${opts.maxBodyLines} lines (task 5.2.5/5.2.6).`,
        },
        errors,
        warnings,
        opts.strict,
      );
    }

    // Rule: description-too-long (WARNING in v2.0; ERROR with --strict)
    const description =
      typeof fm['description'] === 'string' ? fm['description'] : '';
    if (description.length > opts.maxDescriptionChars) {
      pushIssue(
        {
          severity: 'warning',
          rule: 'description-too-long',
          skill: skillName,
          file: skillMdPath,
          message: `description is ${description.length} chars; maximum is ${opts.maxDescriptionChars}.`,
        },
        errors,
        warnings,
        opts.strict,
      );
    }

    // Rule: missing-allowed-tools (WARNING pre-5.2.7; ERROR when requireAllowedTools=true)
    const fmRecord = fm as Record<string, unknown>;
    const hasAllowedTools =
      'allowed-tools' in fmRecord && fmRecord['allowed-tools'] !== undefined;
    if (!hasAllowedTools) {
      const severity: 'error' | 'warning' = opts.requireAllowedTools ? 'error' : 'warning';
      pushIssue(
        {
          severity,
          rule: 'missing-allowed-tools',
          skill: skillName,
          file: skillMdPath,
          message: `Frontmatter is missing 'allowed-tools' field (will be required post-5.2.7).`,
        },
        errors,
        warnings,
        opts.strict,
      );
    }

    // Rule: missing-sibling-test (WARNING pre-5.2.8; ERROR when requireSiblingTest=true)
    if (!existsSync(siblingTestPath)) {
      const severity: 'error' | 'warning' = opts.requireSiblingTest ? 'error' : 'warning';
      pushIssue(
        {
          severity,
          rule: 'missing-sibling-test',
          skill: skillName,
          file: skillMdPath,
          message: `Sibling test file "${skillName}.test.md" not found (will be required post-5.2.8).`,
        },
        errors,
        warnings,
        opts.strict,
      );
    } else {
      // Validate sibling test structure
      const testIssues = validateSiblingTestMd(
        siblingTestPath,
        opts.minAssertionsPerTest,
      );
      for (const ti of testIssues) {
        pushIssue(ti, errors, warnings, opts.strict);
      }
    }
  }

  return { errors, warnings, scannedSkills: skillDirs.length };
}

/**
 * Discover skill directories under rootDir, sorted ascending by path for determinism.
 * A valid skill dir must contain SKILL.md.
 */
function discoverSkillDirs(rootDir: string): string[] {
  if (!existsSync(rootDir)) return [];
  let entries: string[];
  try {
    entries = readdirSync(rootDir);
  } catch {
    return [];
  }
  const dirs: string[] = [];
  for (const entry of entries) {
    const full = join(rootDir, entry);
    try {
      const stat = statSync(full);
      if (stat.isDirectory()) {
        const skillMd = join(full, 'SKILL.md');
        if (existsSync(skillMd)) {
          dirs.push(full);
        }
      }
    } catch {
      // skip unreadable entries
    }
  }
  return dirs.sort();
}

/**
 * Route an issue to errors or warnings based on severity + strict flag.
 * In --strict mode, warnings are promoted to errors.
 */
function pushIssue(
  issue: Issue,
  errors: Issue[],
  warnings: Issue[],
  strict: boolean,
): void {
  if (issue.severity === 'error' || strict) {
    errors.push({ ...issue, severity: 'error' });
  } else {
    warnings.push(issue);
  }
}

// ─── Fix suggest ──────────────────────────────────────────────────────────────

function printFixSuggestions(result: ValidationResult): void {
  const all = [...result.errors, ...result.warnings];
  if (all.length === 0) {
    console.log('# No issues found — nothing to fix.');
    return;
  }
  console.log('# Fix suggestions (read-only — no files were mutated)\n');
  for (const issue of all) {
    console.log(`## ${issue.skill} — ${issue.rule} (${issue.severity})`);
    console.log(`File: ${issue.file}`);
    console.log(`Issue: ${issue.message}`);
    switch (issue.rule) {
      case 'frontmatter-required':
        console.log(
          'Suggestion: Add YAML frontmatter at the top of SKILL.md:\n---\nname: <skill-name>\ndescription: <one-line description>\n---',
        );
        break;
      case 'name-mismatch':
        console.log(
          `Suggestion: Change frontmatter 'name' field to match the directory name: "${issue.skill}"`,
        );
        break;
      case 'oversize-body':
        console.log(
          `Suggestion: Move detailed content to a references/ file and link it. Target <= ${DEFAULT_OPTIONS.maxBodyLines} body lines.`,
        );
        break;
      case 'description-too-long':
        console.log(
          `Suggestion: Shorten the 'description' field to <= ${DEFAULT_OPTIONS.maxDescriptionChars} characters.`,
        );
        break;
      case 'missing-allowed-tools':
        console.log(
          "Suggestion: Add 'allowed-tools: [Read, Bash]' (or whichever tools this skill uses) to frontmatter.",
        );
        break;
      case 'missing-sibling-test':
        console.log(
          `Suggestion: Create "${issue.skill}.test.md" beside SKILL.md with sections: ## Trigger, ## Expected behavior (PASS), ## Named failure modes, ## Assertions`,
        );
        break;
      case 'test-missing-section':
      case 'test-too-few-assertions':
        console.log(
          'Suggestion: Ensure the test file has all required sections and >=3 ordered items under ## Assertions.',
        );
        break;
      default:
        console.log('Suggestion: Refer to skill validator documentation.');
    }
    console.log();
  }
}

// ─── CLI entry point ──────────────────────────────────────────────────────────

export async function main(argv: string[]): Promise<number> {
  // Parse argv (no commander/yargs — P2 simplicity)
  let strict = false;
  let fixSuggest = false;
  let rootDir = '';

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--strict') {
      strict = true;
    } else if (arg === '--fix-suggest') {
      fixSuggest = true;
    } else if (arg === '--root') {
      rootDir = argv[++i] ?? '';
    }
  }

  // Also support ORCH_SKILLS_VALIDATE_STRICT env var
  if (process.env['ORCH_SKILLS_VALIDATE_STRICT'] === '1') {
    strict = true;
  }

  if (!rootDir) {
    // Default: <repo-root>/.claude/skills/
    // Derive repo root from this script's location
    const scriptUrl = import.meta.url;
    const scriptPath = scriptUrl.startsWith('file://')
      ? new URL(scriptUrl).pathname.replace(/^\/([A-Z]:)/, '$1')
      : scriptUrl;
    const scriptDir = resolve(scriptPath, '..');
    const repoRoot = resolve(scriptDir, '..');
    rootDir = join(repoRoot, '.claude', 'skills');
  } else {
    rootDir = resolve(rootDir);
  }

  const opts: ValidatorOptions = {
    ...DEFAULT_OPTIONS,
    rootDir,
    strict,
  };

  const result = await validateAllSkills(opts);

  // Print warnings to stderr
  for (const w of result.warnings) {
    process.stderr.write(`[WARN] ${w.skill}: ${w.rule} — ${w.message}\n`);
  }

  // Print errors to stderr
  for (const e of result.errors) {
    process.stderr.write(`[ERROR] ${e.skill}: ${e.rule} — ${e.message}\n`);
  }

  // --fix-suggest: emit suggestions to stdout (non-mutating)
  if (fixSuggest) {
    printFixSuggestions(result);
  } else {
    const status =
      result.errors.length === 0
        ? `OK (${result.scannedSkills} skills scanned, ${result.warnings.length} warnings)`
        : `FAIL (${result.errors.length} errors, ${result.warnings.length} warnings, ${result.scannedSkills} skills scanned)`;
    process.stderr.write(`\nSkill validator: ${status}\n`);
  }

  return result.errors.length === 0 ? 0 : 1;
}

// Run when invoked directly via tsx
const isMain = (() => {
  try {
    const scriptUrl = import.meta.url;
    const scriptPath = scriptUrl.startsWith('file://')
      ? new URL(scriptUrl).pathname.replace(/^\/([A-Z]:)/, '$1')
      : scriptUrl;
    const argv1 = process.argv[1];
    if (!argv1) return false;
    return resolve(argv1) === resolve(scriptPath);
  } catch {
    return false;
  }
})();

if (isMain) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((err: unknown) => {
      process.stderr.write(`Unexpected error: ${String(err)}\n`);
      process.exit(1);
    });
}
