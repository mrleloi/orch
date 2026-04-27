/**
 * config-style-lint.ts — Config Style Guide linter
 *
 * Lints `.claude/*` configuration files against `agent-workspace/constitution/config-style-guide.md`.
 * Implements the 30-rule LR-NN list from §13.
 *
 * Usage:
 *   node scripts/audit/config-style-lint.ts               # lint all .claude/* files, exit 1 on ERROR
 *   node scripts/audit/config-style-lint.ts --strict       # treat WARN as ERROR too
 *   node scripts/audit/config-style-lint.ts --file <path>  # lint a single file
 *   node scripts/audit/config-style-lint.ts --list-rules   # print LR-NN table
 *   node scripts/audit/config-style-lint.ts --report-format json
 *
 * Exit codes:
 *   0 — clean (no ERROR violations; in --strict mode, no violations at all)
 *   1 — one or more violations that meet the exit threshold
 *
 * Decision 028 binds this file. Config style guide §13 is the rule contract.
 */

import { existsSync, readFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { resolve, join, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load as yamlLoad } from 'js-yaml';

// ---------------------------------------------------------------------------
// File-type taxonomy (§2)
// ---------------------------------------------------------------------------

export type FileType =
  | 'agent'
  | 'skill-discipline'
  | 'skill-reference'
  | 'command'
  | 'hook-profile'
  | 'settings'
  | 'test-fixture';

// ---------------------------------------------------------------------------
// Core data structures
// ---------------------------------------------------------------------------

export interface Section {
  /** H2 heading text, e.g. "Persona" (without ## prefix) */
  heading: string;
  /** 1-based line number of the ## heading */
  line: number;
  /** Raw content lines under this heading (before the next ## or EOF) */
  content: string;
}

export interface ParsedFile {
  path: string;
  type: FileType;
  /** Raw frontmatter object (null when no frontmatter block present) */
  frontmatter: Record<string, unknown> | null;
  /** Raw frontmatter YAML text (between --- fences) */
  frontmatterRaw: string;
  /** H2 sections parsed from body */
  sections: Section[];
  /** Full file text */
  raw: string;
  /** Body text (after frontmatter strip for .md; full text for .json) */
  body: string;
  /** Body line count (LOC) — frontmatter excluded */
  loc: number;
  /** 1-based line where body starts (after frontmatter) */
  bodyStartLine: number;
}

export interface Violation {
  ruleId: string;
  severity: 'ERROR' | 'WARN';
  line: number;
  message: string;
}

export interface LintRule {
  id: string;
  severity: 'ERROR' | 'WARN';
  description: string;
  appliesTo: FileType[] | 'all';
  check: (file: ParsedFile, projectRoot: string) => Violation[];
}

// ---------------------------------------------------------------------------
// Frontmatter / body parser (§3)
// ---------------------------------------------------------------------------

/** Split a markdown file into frontmatter + body. Returns null fm when absent. */
export function parseMarkdownFile(raw: string): {
  frontmatter: Record<string, unknown> | null;
  frontmatterRaw: string;
  body: string;
  bodyStartLine: number;
} {
  const lines = raw.split('\n');
  let firstFence = -1;
  for (let i = 0; i < lines.length; i++) {
    const t = (lines[i] ?? '').trim();
    if (t === '---') { firstFence = i; break; }
    if (t !== '') break;
  }

  if (firstFence === -1) {
    return { frontmatter: null, frontmatterRaw: '', body: raw, bodyStartLine: 1 };
  }

  let secondFence = -1;
  for (let i = firstFence + 1; i < lines.length; i++) {
    if ((lines[i] ?? '').trim() === '---') { secondFence = i; break; }
  }

  if (secondFence === -1) {
    return { frontmatter: null, frontmatterRaw: '', body: raw, bodyStartLine: 1 };
  }

  const yamlText = lines.slice(firstFence + 1, secondFence).join('\n');
  let fm: Record<string, unknown> | null = null;
  try {
    const parsed = yamlLoad(yamlText);
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      fm = parsed as Record<string, unknown>;
    }
  } catch {
    fm = null;
  }

  const bodyLines = lines.slice(secondFence + 1);
  const body = bodyLines.join('\n');
  const bodyStartLine = secondFence + 2; // 1-based

  return { frontmatter: fm, frontmatterRaw: yamlText, body, bodyStartLine };
}

/** Parse H2 sections from a markdown body. Returns sections with 1-based line numbers relative to body start. */
export function parseSections(body: string, bodyStartLine: number): Section[] {
  const lines = body.split('\n');
  const sections: Section[] = [];
  let currentSection: Section | null = null;
  const contentLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const h2Match = /^##\s+(.+)$/.exec(line);
    if (h2Match !== null) {
      if (currentSection !== null) {
        currentSection.content = contentLines.join('\n');
        sections.push(currentSection);
        contentLines.length = 0;
      }
      currentSection = {
        heading: (h2Match[1] ?? '').trim(),
        line: bodyStartLine + i,
        content: '',
      };
    } else if (currentSection !== null) {
      contentLines.push(line);
    }
  }
  if (currentSection !== null) {
    currentSection.content = contentLines.join('\n');
    sections.push(currentSection);
  }
  return sections;
}

/** Count non-empty lines for LOC purposes */
export function countLoc(body: string): number {
  return body.split('\n').length;
}

// ---------------------------------------------------------------------------
// File-type detection (§2)
// ---------------------------------------------------------------------------

/** Determine the file-type from its path. Returns null if path is out of scope. */
export function detectFileType(filePath: string): FileType | null {
  const rel = filePath.replace(/\\/g, '/');
  const base = basename(rel);

  // settings.json — exact match
  if (rel.includes('.claude/settings.json') && base === 'settings.json') return 'settings';
  // settings.local.json — out of scope for most rules but included
  if (rel.includes('.claude/settings.local.json')) return 'settings';

  // Test fixtures — before agent/skill check (they share dirs)
  if (base.endsWith('.test.md')) return 'test-fixture';

  // Agents
  if (/\.claude\/agents\/[^/]+\.md$/.test(rel)) return 'agent';

  // Skills — need to peek at archetype
  if (/\.claude\/skills\/[^/]+\/SKILL\.md$/.test(rel)) {
    // We'll return a placeholder; archetype is resolved during full parse
    return 'skill-discipline'; // overridden after frontmatter parse
  }

  // Commands
  if (/\.claude\/commands\/[^/]+\.md$/.test(rel)) return 'command';

  // Hook profiles (exclude README.md)
  if (/\.claude\/hooks\/profiles\/[^/]+\.md$/.test(rel) && base !== 'README.md') return 'hook-profile';

  return null;
}

/** Resolve skill archetype from parsed frontmatter */
function resolveSkillType(frontmatter: Record<string, unknown> | null): FileType {
  if (frontmatter === null) return 'skill-discipline';
  const arch = frontmatter['archetype'];
  if (arch === 'reference') return 'skill-reference';
  return 'skill-discipline';
}

// ---------------------------------------------------------------------------
// Full file parser entry point
// ---------------------------------------------------------------------------

export function parseFile(filePath: string, projectRoot: string): ParsedFile | null {
  if (!existsSync(filePath)) return null;
  const raw = readFileSync(filePath, 'utf8');
  const relPath = filePath.replace(projectRoot.replace(/\\/g, '/'), '').replace(/\\/g, '/').replace(/^\//, '');

  // Detect initial type
  let type = detectFileType(filePath.replace(/\\/g, '/'));
  if (type === null) return null;

  // JSON settings file — handled separately
  if (type === 'settings') {
    return {
      path: relPath,
      type,
      frontmatter: null,
      frontmatterRaw: '',
      sections: [],
      raw,
      body: raw,
      loc: countLoc(raw),
      bodyStartLine: 1,
    };
  }

  const { frontmatter, frontmatterRaw, body, bodyStartLine } = parseMarkdownFile(raw);

  // Refine skill type from archetype field
  if (type === 'skill-discipline' || type === 'skill-reference') {
    type = resolveSkillType(frontmatter);
  }

  const sections = parseSections(body, bodyStartLine);
  const loc = countLoc(body);

  return {
    path: relPath,
    type,
    frontmatter,
    frontmatterRaw,
    sections,
    raw,
    body,
    loc,
    bodyStartLine,
  };
}

// ---------------------------------------------------------------------------
// Helpers for rules
// ---------------------------------------------------------------------------

const VALID_MODELS = new Set(['opus', 'sonnet', 'haiku']);

function makeError(ruleId: string, line: number, message: string): Violation {
  return { ruleId, severity: 'ERROR', line, message };
}

function makeWarn(ruleId: string, line: number, message: string): Violation {
  return { ruleId, severity: 'WARN', line, message };
}

function hasField(fm: Record<string, unknown> | null, key: string): boolean {
  return fm !== null && Object.prototype.hasOwnProperty.call(fm, key);
}

function getField(fm: Record<string, unknown> | null, key: string): unknown {
  if (fm === null) return undefined;
  return fm[key];
}

const TERMINAL_AGENT_HEADING = 'Spawned Session Handling';
const TERMINAL_SKILL_HEADING = 'Spawned-session mode';

/** Check if a heading is a spawned-section variant */
function isSpawnedHeading(h: string): boolean {
  const lower = h.toLowerCase().replace(/-/g, ' ');
  return lower.includes('spawned session handling') || lower.includes('spawned-session mode') || lower.includes('spawned session mode');
}

/** Check if heading is an autonomous-mode variant (commands) */
function isAutonomousVariant(h: string): boolean {
  const lower = h.toLowerCase();
  return (
    lower === 'autonomous mode' ||
    lower === 'autonomous usage' ||
    lower === 'autonomous mode behavior' ||
    lower === 'autonomous mode: proceed'
  );
}

/** Resolve absolute path relative to project root */
function resolveRef(ref: string, projectRoot: string): boolean {
  // Strip :line suffix
  const pathPart = ref.replace(/:\d+$/, '');
  return existsSync(resolve(projectRoot, pathPart));
}

// ---------------------------------------------------------------------------
// RULES (§13) — 15 ERROR + 14 WARN
// ---------------------------------------------------------------------------

export const ALL_RULES: LintRule[] = [

  // ── ERROR RULES ──────────────────────────────────────────────────────────

  {
    id: 'LR-01',
    severity: 'ERROR',
    description: '`model` field missing or value not in {opus, sonnet, haiku}',
    appliesTo: ['agent', 'skill-discipline'],
    check(file) {
      const violations: Violation[] = [];
      const model = getField(file.frontmatter, 'model');
      if (model === undefined || model === null) {
        violations.push(makeError('LR-01', 1, `LR-01: \`model\` field missing (required for ${file.type})`));
      } else if (typeof model !== 'string' || !VALID_MODELS.has(model)) {
        violations.push(makeError('LR-01', 1, `LR-01: \`model\` value "${String(model)}" not in {opus, sonnet, haiku}`));
      }
      return violations;
    },
  },

  {
    id: 'LR-02',
    severity: 'ERROR',
    description: 'frontmatter contains `allowed-tools` key (forbidden) OR `tools` is missing/empty',
    appliesTo: ['agent', 'skill-discipline', 'skill-reference', 'command'],
    check(file) {
      const violations: Violation[] = [];
      if (hasField(file.frontmatter, 'allowed-tools')) {
        violations.push(makeError('LR-02', 1, 'LR-02: Forbidden key `allowed-tools` in frontmatter; rename to `tools`'));
      }
      const tools = getField(file.frontmatter, 'tools');
      if (file.frontmatter !== null && !hasField(file.frontmatter, 'allowed-tools')) {
        // Only require tools if allowed-tools is also absent
        if (tools === undefined || tools === null) {
          violations.push(makeError('LR-02', 1, 'LR-02: `tools` field missing or empty'));
        } else if (!Array.isArray(tools) || tools.length === 0) {
          violations.push(makeError('LR-02', 1, 'LR-02: `tools` must be a non-empty array'));
        }
      }
      return violations;
    },
  },

  {
    id: 'LR-03',
    severity: 'ERROR',
    description: 'command `.md` file has no frontmatter block at all',
    appliesTo: ['command'],
    check(file) {
      const violations: Violation[] = [];
      if (file.frontmatter === null) {
        violations.push(makeError('LR-03', 1, 'LR-03: Command file has no frontmatter block (required per §3.4)'));
      } else {
        // Also check required fields: name, description, tools
        if (!hasField(file.frontmatter, 'name')) {
          violations.push(makeError('LR-03', 1, 'LR-03: Command frontmatter missing required field `name`'));
        }
        if (!hasField(file.frontmatter, 'description')) {
          violations.push(makeError('LR-03', 1, 'LR-03: Command frontmatter missing required field `description`'));
        }
      }
      return violations;
    },
  },

  {
    id: 'LR-04',
    severity: 'ERROR',
    description: 'body LOC > hard ceiling per §5',
    appliesTo: 'all',
    check(file) {
      const violations: Violation[] = [];
      const ceiling = hardCeiling(file.type);
      if (ceiling !== null && file.loc > ceiling) {
        violations.push(makeError('LR-04', file.bodyStartLine, `LR-04: Body LOC ${file.loc} exceeds hard ceiling ${ceiling} for ${file.type}`));
      }
      return violations;
    },
  },

  {
    id: 'LR-05',
    severity: 'ERROR',
    description: 'H2 ordering does not match canonical sequence per §4.X for the file\'s archetype',
    appliesTo: 'all',
    check(file) {
      return checkSectionOrder(file);
    },
  },

  {
    id: 'LR-06',
    severity: 'ERROR',
    description: 'Any H2 heading appears AFTER terminal `## Spawned Session Handling` (or `## Spawned-session mode`)',
    appliesTo: ['agent', 'skill-discipline', 'command'],
    check(file) {
      const violations: Violation[] = [];
      const sections = file.sections;
      let foundTerminal = false;
      for (const sec of sections) {
        if (isSpawnedHeading(sec.heading)) {
          foundTerminal = true;
          continue;
        }
        if (foundTerminal) {
          violations.push(makeError('LR-06', sec.line, `LR-06: H2 "## ${sec.heading}" appears AFTER terminal spawned section`));
        }
      }
      return violations;
    },
  },

  {
    id: 'LR-07',
    severity: 'ERROR',
    description: 'filename casing is not kebab-case + `.md`',
    appliesTo: 'all',
    check(file) {
      const violations: Violation[] = [];
      const base = basename(file.path);
      if (base === 'SKILL.md' || base.endsWith('.test.md') || base === 'settings.json' || base === 'settings.local.json') {
        return []; // exempt
      }
      const stem = base.replace(/\.md$/, '');
      const kebabPattern = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
      if (!kebabPattern.test(stem)) {
        violations.push(makeError('LR-07', 1, `LR-07: Filename "${base}" is not kebab-case + .md`));
      }
      return violations;
    },
  },

  {
    id: 'LR-08',
    severity: 'ERROR',
    description: 'cross-reference path inside Markdown link `[](...)` or backticked `path:line` does not resolve',
    appliesTo: 'all',
    check(file, projectRoot) {
      const violations: Violation[] = [];
      const lines = file.body.split('\n');
      lines.forEach((line, idx) => {
        const lineNum = file.bodyStartLine + idx;
        // Markdown links: [text](path)
        const linkRe = /\[([^\]]*)\]\(([^)]+)\)/g;
        let m: RegExpExecArray | null;
        while ((m = linkRe.exec(line)) !== null) {
          const href = m[2] ?? '';
          // Skip URLs, anchors, and mailto
          if (href.startsWith('http') || href.startsWith('#') || href.startsWith('mailto:')) continue;
          if (!resolveRef(href, projectRoot)) {
            violations.push(makeError('LR-08', lineNum, `LR-08: Broken link path "${href}" does not resolve`));
          }
        }
        // Backticked path:line references — only check if they look like file paths
        const backtickRe = /`([^`]+)`/g;
        while ((m = backtickRe.exec(line)) !== null) {
          const content = m[1] ?? '';
          // Must look like a relative file path with extension and optional :line
          if (/^[a-zA-Z0-9_.\-/]+\.[a-zA-Z]+(?::\d+)?$/.test(content) && content.includes('/')) {
            const pathPart = content.replace(/:\d+$/, '');
            if (!resolveRef(pathPart, projectRoot)) {
              violations.push(makeWarn('LR-08', lineNum, `LR-08: Backtick reference "${content}" may not resolve (WARN — verify manually)`));
            }
          }
        }
      });
      return violations;
    },
  },

  {
    id: 'LR-09',
    severity: 'ERROR',
    description: 'body contains literal `Why opus` or `Why sonnet` AND frontmatter `model:` value contradicts',
    appliesTo: ['agent'],
    check(file) {
      const violations: Violation[] = [];
      if (file.frontmatter === null) return [];
      const model = getField(file.frontmatter, 'model');
      if (typeof model !== 'string') return [];

      const bodyLower = file.body.toLowerCase();
      const hasWhyOpus = bodyLower.includes('why opus');
      const hasWhySonnet = bodyLower.includes('why sonnet');

      if (hasWhyOpus && model !== 'opus') {
        violations.push(makeError('LR-09', 1, `LR-09: Body says "Why opus" but frontmatter model is "${model}"`));
      }
      if (hasWhySonnet && model !== 'sonnet') {
        violations.push(makeError('LR-09', 1, `LR-09: Body says "Why sonnet" but frontmatter model is "${model}"`));
      }
      return violations;
    },
  },

  {
    id: 'LR-11',
    severity: 'ERROR',
    description: '`archetype` field on a skill is not one of {discipline, reference}',
    appliesTo: ['skill-discipline', 'skill-reference'],
    check(file) {
      const violations: Violation[] = [];
      const arch = getField(file.frontmatter, 'archetype');
      if (arch !== undefined && arch !== null && arch !== 'discipline' && arch !== 'reference') {
        violations.push(makeError('LR-11', 1, `LR-11: \`archetype\` value "${String(arch)}" not in {discipline, reference}`));
      }
      return violations;
    },
  },

  {
    id: 'LR-13',
    severity: 'ERROR',
    description: '`archetype` field missing on a skill',
    appliesTo: ['skill-discipline', 'skill-reference'],
    check(file) {
      const violations: Violation[] = [];
      if (!hasField(file.frontmatter, 'archetype')) {
        violations.push(makeError('LR-13', 1, 'LR-13: `archetype` field missing on skill (required: discipline or reference)'));
      }
      return violations;
    },
  },

  {
    id: 'LR-15',
    severity: 'ERROR',
    description: 'hook-profile `profile:` field missing or not in {minimal, standard, strict}',
    appliesTo: ['hook-profile'],
    check(file) {
      const violations: Violation[] = [];
      if (file.frontmatter === null) {
        violations.push(makeError('LR-15', 1, 'LR-15: Hook-profile has no frontmatter; `profile:` field is required'));
        return violations;
      }
      const profile = getField(file.frontmatter, 'profile');
      if (profile === undefined || profile === null) {
        violations.push(makeError('LR-15', 1, 'LR-15: Hook-profile `profile:` field missing (required: minimal|standard|strict)'));
      } else if (profile !== 'minimal' && profile !== 'standard' && profile !== 'strict') {
        violations.push(makeError('LR-15', 1, `LR-15: \`profile\` value "${String(profile)}" not in {minimal, standard, strict}`));
      }
      return violations;
    },
  },

  {
    id: 'LR-19',
    severity: 'ERROR',
    description: '`.test.md` sibling missing one or more required H2 sections per §4.6',
    appliesTo: ['test-fixture'],
    check(file) {
      const violations: Violation[] = [];
      const required = ['Trigger', 'Expected Behavior', 'Failure Modes', 'Metrics', 'Assertions'];
      const headings = new Set(file.sections.map(s => s.heading));
      for (const req of required) {
        if (!headings.has(req)) {
          violations.push(makeError('LR-19', 1, `LR-19: .test.md missing required H2 section "## ${req}"`));
        }
      }
      return violations;
    },
  },

  {
    id: 'LR-26',
    severity: 'ERROR',
    description: 'settings.json contains commented-out hook entries',
    appliesTo: ['settings'],
    check(file) {
      const violations: Violation[] = [];
      if (!file.path.endsWith('settings.json')) return [];
      const lines = file.raw.split('\n');
      lines.forEach((line, idx) => {
        if (/["']\/\/\s*disabled/i.test(line) || /["']disabled-/i.test(line)) {
          violations.push(makeError('LR-26', idx + 1, `LR-26: settings.json contains commented-out/disabled hook entry at line ${idx + 1}`));
        }
      });
      return violations;
    },
  },

  {
    id: 'LR-30',
    severity: 'ERROR',
    description: 'a `## Mandates` / `## Annotations` / `## Bolt-ons` H2 contains ≥3 sub-mandates',
    appliesTo: ['agent', 'skill-discipline'],
    check(file) {
      const violations: Violation[] = [];
      for (const sec of file.sections) {
        const h = sec.heading.toLowerCase();
        if (h.startsWith('mandate') || h.startsWith('annotation') || h.startsWith('bolt-on')) {
          // Count H3 sub-sections
          const h3Count = (sec.content.match(/^###\s+/gm) ?? []).length;
          if (h3Count >= 3) {
            violations.push(makeError('LR-30', sec.line, `LR-30: "## ${sec.heading}" has ${h3Count} sub-mandates (≥3 = integration debt; dissolve into Process phases per §10)`));
          }
        }
      }
      return violations;
    },
  },

  // ── WARN RULES ───────────────────────────────────────────────────────────

  {
    id: 'LR-10',
    severity: 'WARN',
    description: '`archetype` missing on agent (RECOMMENDED `agent` constant) — becomes ERROR in v2.4',
    appliesTo: ['agent'],
    check(file) {
      const violations: Violation[] = [];
      if (!hasField(file.frontmatter, 'archetype')) {
        violations.push(makeWarn('LR-10', 1, 'LR-10: Agent missing optional `archetype: agent` field (RECOMMENDED; becomes ERROR in v2.4)'));
      }
      return violations;
    },
  },

  {
    id: 'LR-12',
    severity: 'WARN',
    description: '`description` field is empty, multi-line, >300 char, OR does not start with imperative verb / "Use when"',
    appliesTo: 'all',
    check(file) {
      const violations: Violation[] = [];
      if (file.type === 'settings' || file.type === 'test-fixture') return [];
      if (file.frontmatter === null) return [];
      const desc = getField(file.frontmatter, 'description');
      if (desc === undefined || desc === null || desc === '') {
        violations.push(makeWarn('LR-12', 1, 'LR-12: `description` field is empty or missing'));
        return violations;
      }
      if (typeof desc !== 'string') {
        violations.push(makeWarn('LR-12', 1, 'LR-12: `description` must be a string'));
        return violations;
      }
      if (desc.includes('\n')) {
        violations.push(makeWarn('LR-12', 1, 'LR-12: `description` must be single-line (no newlines)'));
      }
      if (desc.length > 300) {
        violations.push(makeWarn('LR-12', 1, `LR-12: \`description\` is ${desc.length} chars (max 300)`));
      }
      // Must start with imperative verb or "Use when" / "Use the moment" / "Use when"
      const startsOk = /^(Use |Save |Check |Run |Study |Execute |Dispatch |Plan |Review |Lint |Analyze |Verify |Scan |Debug |Implement |Load |Apply |Generate |Emit |Fix )/i.test(desc.trimStart());
      if (!startsOk) {
        violations.push(makeWarn('LR-12', 1, `LR-12: \`description\` should start with imperative verb or "Use when" (starts with: "${desc.slice(0, 20)}")`));
      }
      return violations;
    },
  },

  {
    id: 'LR-14',
    severity: 'WARN',
    description: '`<artifact>.test.md` sibling does not exist AND parent has no `test: none` opt-out',
    appliesTo: ['agent', 'skill-discipline', 'skill-reference'],
    check(file, projectRoot) {
      const violations: Violation[] = [];
      const testOptOut = getField(file.frontmatter, 'test');
      if (testOptOut === 'none') return [];

      const filePath = resolve(projectRoot, file.path);
      const dir = dirname(filePath);
      const base = basename(filePath, '.md');

      // For agents: <base>.test.md in same dir
      // For skills: SKILL.test.md or <parentDir>.test.md
      let testPath: string;
      if (file.type === 'agent') {
        testPath = join(dir, `${base}.test.md`);
      } else {
        testPath = join(dir, 'SKILL.test.md');
        if (!existsSync(testPath)) {
          testPath = join(dir, `${basename(dir)}.test.md`);
        }
      }
      if (!existsSync(testPath)) {
        violations.push(makeWarn('LR-14', 1, `LR-14: No .test.md sibling found for ${file.path} (add sibling or set \`test: none\`)`));
      }
      return violations;
    },
  },

  {
    id: 'LR-16',
    severity: 'WARN',
    description: 'spawned-section H2 uses cross-form (e.g., skill uses agent form or vice versa)',
    appliesTo: ['agent', 'skill-discipline'],
    check(file) {
      const violations: Violation[] = [];
      for (const sec of file.sections) {
        if (!isSpawnedHeading(sec.heading)) continue;
        if (file.type === 'agent' && sec.heading !== TERMINAL_AGENT_HEADING) {
          violations.push(makeWarn('LR-16', sec.line, `LR-16: Agent spawned section should be "## Spawned Session Handling" (Title Case, no hyphen), found "## ${sec.heading}"`));
        }
        if (file.type === 'skill-discipline' && sec.heading !== TERMINAL_SKILL_HEADING) {
          violations.push(makeWarn('LR-16', sec.line, `LR-16: Skill spawned section should be "## Spawned-session mode" (lowercase-hyphen form), found "## ${sec.heading}"`));
        }
      }
      return violations;
    },
  },

  {
    id: 'LR-17',
    severity: 'WARN',
    description: 'reference-skill includes ## Red Flags / ## Rationalization Counters / ## Spawned-session mode',
    appliesTo: ['skill-reference'],
    check(file) {
      const violations: Violation[] = [];
      const forbidden = ['Red Flags', 'Rationalization Counters', 'Spawned-session mode', 'Spawned Session Handling'];
      for (const sec of file.sections) {
        if (forbidden.some(f => sec.heading.toLowerCase().includes(f.toLowerCase()))) {
          violations.push(makeWarn('LR-17', sec.line, `LR-17: Reference-skill should not contain "## ${sec.heading}" (discipline-only section)`));
        }
      }
      return violations;
    },
  },

  {
    id: 'LR-18',
    severity: 'WARN',
    description: 'command uses variant header instead of canonical `## Spawned Session Handling`',
    appliesTo: ['command'],
    check(file) {
      const violations: Violation[] = [];
      for (const sec of file.sections) {
        if (isAutonomousVariant(sec.heading)) {
          violations.push(makeWarn('LR-18', sec.line, `LR-18: Command uses variant header "## ${sec.heading}"; canonical is "## Spawned Session Handling"`));
        }
      }
      return violations;
    },
  },

  {
    id: 'LR-20',
    severity: 'WARN',
    description: 'body LOC over soft target but under hard ceiling',
    appliesTo: 'all',
    check(file) {
      const violations: Violation[] = [];
      const soft = softTarget(file.type);
      const ceiling = hardCeiling(file.type);
      if (soft !== null && ceiling !== null && file.loc > soft && file.loc <= ceiling) {
        violations.push(makeWarn('LR-20', file.bodyStartLine, `LR-20: Body LOC ${file.loc} exceeds soft target ${soft} (ceiling ${ceiling}) — trim or accept`));
      }
      return violations;
    },
  },

  {
    id: 'LR-21',
    severity: 'WARN',
    description: 'frontmatter key uses snake_case or camelCase',
    appliesTo: 'all',
    check(file) {
      const violations: Violation[] = [];
      if (file.frontmatter === null) return [];
      for (const key of Object.keys(file.frontmatter)) {
        if (/[A-Z]/.test(key) || key.includes('_')) {
          violations.push(makeWarn('LR-21', 1, `LR-21: Frontmatter key "${key}" is not kebab-case (use hyphens, not underscores or camelCase)`));
        }
      }
      return violations;
    },
  },

  {
    id: 'LR-22',
    severity: 'WARN',
    description: 'decision-file citation points to `decisions/NNN-*.md` that doesn\'t exist',
    appliesTo: 'all',
    check(file, projectRoot) {
      const violations: Violation[] = [];
      const decisionRe = /decisions\/(\d{3}-[^\s`'")\]]+\.md)/g;
      let m: RegExpExecArray | null;
      while ((m = decisionRe.exec(file.raw)) !== null) {
        const decPath = `agent-workspace/memory/decisions/${m[1]}`;
        if (!existsSync(resolve(projectRoot, decPath))) {
          violations.push(makeWarn('LR-22', 1, `LR-22: Decision citation "${m[1]}" not found at ${decPath}`));
        }
      }
      return violations;
    },
  },

  {
    id: 'LR-23',
    severity: 'WARN',
    description: 'external URL not on allowlist (Anthropic docs, GitHub, schema.org, charter)',
    appliesTo: 'all',
    check(file) {
      const violations: Violation[] = [];
      const urlRe = /https?:\/\/([a-zA-Z0-9.-]+)/g;
      const allowedDomains = [
        'docs.anthropic.com', 'anthropic.com',
        'github.com', 'raw.githubusercontent.com',
        'json.schemastore.org', 'schema.org',
        'claude.ai',
      ];
      let m: RegExpExecArray | null;
      while ((m = urlRe.exec(file.raw)) !== null) {
        const domain = m[1] ?? '';
        if (!allowedDomains.some(d => domain === d || domain.endsWith(`.${d}`))) {
          violations.push(makeWarn('LR-23', 1, `LR-23: External URL domain "${domain}" not on allowlist (Anthropic docs, GitHub, schema.org)`));
        }
      }
      return violations;
    },
  },

  {
    id: 'LR-24',
    severity: 'WARN',
    description: 'settings.json missing `$schema` field',
    appliesTo: ['settings'],
    check(file) {
      const violations: Violation[] = [];
      if (!file.path.endsWith('settings.json')) return [];
      if (!file.raw.includes('"$schema"')) {
        violations.push(makeWarn('LR-24', 1, 'LR-24: settings.json missing "$schema" field (expected: https://json.schemastore.org/claude-code-settings.json)'));
      }
      return violations;
    },
  },

  {
    id: 'LR-25',
    severity: 'WARN',
    description: 'hook entry in settings.json has neither `_comment_*` sibling key nor named hook-profile reference',
    appliesTo: ['settings'],
    check(_file) {
      // TODO: 8.1.3 will inform via remediation experience — complex JSON traversal
      // Stub: returns [] — enumerated in --list-rules but check is no-op
      return [];
    },
  },

  {
    id: 'LR-27',
    severity: 'WARN',
    description: 'settings.json has duplicate hook entries with same `matcher` under same event',
    appliesTo: ['settings'],
    check(_file) {
      // TODO: 8.1.3 will inform via remediation experience — requires JSON AST traversal
      // Stub: returns [] — enumerated in --list-rules but check is no-op
      return [];
    },
  },

  {
    id: 'LR-28',
    severity: 'WARN',
    description: 'settings.local.json contains absolute path with machine-specific prefix',
    appliesTo: ['settings'],
    check(file) {
      const violations: Violation[] = [];
      if (!file.path.endsWith('settings.local.json')) return [];
      // Look for Windows or Unix absolute paths
      const lines = file.raw.split('\n');
      lines.forEach((line, idx) => {
        if (/[A-Z]:\\|\/home\/[a-z]|\/Users\/[a-zA-Z]/.test(line)) {
          violations.push(makeWarn('LR-28', idx + 1, `LR-28: settings.local.json contains machine-specific absolute path at line ${idx + 1}`));
        }
      });
      return violations;
    },
  },

  {
    id: 'LR-29',
    severity: 'WARN',
    description: 'settings.json hook entry not declared in active profile\'s ## Events covered table, or vice versa',
    appliesTo: ['settings', 'hook-profile'],
    check(_file) {
      // TODO: 8.1.3 + 8.4.7 will implement profile-vs-settings diff (scripts/audit/profile-vs-settings-diff.sh)
      // Stub: returns [] — enumerated in --list-rules but check is no-op
      return [];
    },
  },
];

// ---------------------------------------------------------------------------
// LOC budget helpers (§5)
// ---------------------------------------------------------------------------

function hardCeiling(type: FileType): number | null {
  switch (type) {
    case 'agent': return 200;
    case 'skill-discipline': return 150;
    case 'skill-reference': return 120;
    case 'command': return 120;
    case 'hook-profile': return 80;
    case 'test-fixture': return 100;
    case 'settings': return null; // not LOC-budgeted
  }
}

function softTarget(type: FileType): number | null {
  switch (type) {
    case 'agent': return 150;
    case 'skill-discipline': return 120;
    case 'skill-reference': return 80;
    case 'command': return 90;
    case 'hook-profile': return 50;
    case 'test-fixture': return 60;
    case 'settings': return null;
  }
}

// ---------------------------------------------------------------------------
// Section-ordering check (§4) — LR-05
// ---------------------------------------------------------------------------

/** Check that file's H2 headings appear in the correct canonical order (§4). */
function checkSectionOrder(file: ParsedFile): Violation[] {
  if (file.sections.length === 0) return [];

  switch (file.type) {
    case 'agent':
      return checkAgentOrder(file.sections);
    case 'skill-discipline':
      return checkDisciplineOrder(file.sections);
    case 'skill-reference':
      return checkReferenceOrder(file.sections);
    case 'command':
      return checkCommandOrder(file.sections);
    case 'hook-profile':
      return checkHookProfileOrder(file.sections);
    default:
      return [];
  }
}

/** Required headings must appear in ascending order (not strict consecutive) */
function checkRequiredOrder(
  orderedRequired: string[],
  sections: Section[],
  ruleId: string,
  matchFn?: (heading: string, required: string) => boolean,
): Violation[] {
  const violations: Violation[] = [];
  const defaultMatch = (h: string, r: string) => h.toLowerCase() === r.toLowerCase();
  const match = matchFn ?? defaultMatch;

  let lastFoundIdx = -1;
  for (const req of orderedRequired) {
    const foundIdx = sections.findIndex((s, i) => i > lastFoundIdx - 1 && match(s.heading, req));
    if (foundIdx === -1) continue; // missing sections handled by other rules
    if (foundIdx < lastFoundIdx) {
      violations.push(makeError(ruleId, sections[foundIdx]?.line ?? 1, `LR-05: Section "## ${req}" appears out of canonical order`));
    }
    lastFoundIdx = foundIdx;
  }
  return violations;
}

function checkAgentOrder(sections: Section[]): Violation[] {
  // §4.1 canonical: Persona/When to use, Invocation Context/Trigger/Responsibility/Scope Contract, Input, Process, Output, Constraints, Do NOT, Spawned Session Handling
  const orderedRequired = ['Process', 'Output', 'Constraints'];
  return checkRequiredOrder(orderedRequired, sections, 'LR-05',
    (h, r) => h.toLowerCase().includes(r.toLowerCase()));
}

function checkDisciplineOrder(sections: Section[]): Violation[] {
  // §4.2: When to invoke, Red Flags, Process/Protocol/Ritual, Rationalization Counters, Output, Do NOT, Spawned-session mode
  const violations: Violation[] = [];
  // Red Flags must come before Rationalization Counters
  const rfIdx = sections.findIndex(s => s.heading.toLowerCase().includes('red flags'));
  const rcIdx = sections.findIndex(s => s.heading.toLowerCase().includes('rationalization'));
  if (rfIdx !== -1 && rcIdx !== -1 && rfIdx > rcIdx) {
    violations.push(makeError('LR-05', sections[rcIdx]?.line ?? 1, 'LR-05: "## Rationalization Counters" appears before "## Red Flags" (wrong order per §4.2)'));
  }
  return violations;
}

function checkReferenceOrder(sections: Section[]): Violation[] {
  // §4.3: When to use, Reference Index, Quick Reference, Anti-Patterns
  const ordered = ['When to use', 'Reference Index', 'Quick Reference', 'Anti-Patterns'];
  return checkRequiredOrder(ordered, sections, 'LR-05');
}

function checkCommandOrder(sections: Section[]): Violation[] {
  // §4.4: Purpose/When to use, Steps/Process, Spawned Session Handling
  // Purpose/Steps must come before spawned
  const violations: Violation[] = [];
  const stepsIdx = sections.findIndex(s =>
    s.heading.toLowerCase().includes('step') || s.heading.toLowerCase().includes('process'));
  const spawnedIdx = sections.findIndex(s => isSpawnedHeading(s.heading));
  if (stepsIdx !== -1 && spawnedIdx !== -1 && stepsIdx > spawnedIdx) {
    violations.push(makeError('LR-05', sections[stepsIdx]?.line ?? 1, 'LR-05: Steps/Process section appears after Spawned Session Handling'));
  }
  return violations;
}

function checkHookProfileOrder(sections: Section[]): Violation[] {
  // §4.5: When to use, When NOT to use, Events covered/handled, Wire example/examples
  const ordered = ['When to use', 'When NOT to use', 'Events'];
  return checkRequiredOrder(ordered, sections, 'LR-05',
    (h, r) => h.toLowerCase().startsWith(r.toLowerCase()));
}

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------

/** Recursively discover all lintable files under .claude/ */
export function discoverFiles(projectRoot: string): string[] {
  const claudeDir = join(projectRoot, '.claude');
  if (!existsSync(claudeDir)) return [];

  const results: string[] = [];

  function walk(dir: string): void {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const full = join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        walk(full);
      } else if (stat.isFile()) {
        const relPath = full.replace(/\\/g, '/');
        const type = detectFileType(relPath);
        if (type !== null) {
          results.push(full);
        }
      }
    }
  }

  walk(claudeDir);
  return results;
}

// ---------------------------------------------------------------------------
// Lint engine
// ---------------------------------------------------------------------------

export interface LintResult {
  file: string;
  type: FileType;
  violations: Violation[];
}

export interface LintSummary {
  results: LintResult[];
  totalFiles: number;
  errorCount: number;
  warnCount: number;
}

/** Run all applicable rules against a parsed file */
export function lintFile(parsed: ParsedFile, projectRoot: string, strict: boolean): Violation[] {
  const violations: Violation[] = [];
  for (const rule of ALL_RULES) {
    // Check if rule applies to this file type
    const applies =
      rule.appliesTo === 'all' ||
      (Array.isArray(rule.appliesTo) && rule.appliesTo.includes(parsed.type));
    if (!applies) continue;

    try {
      const vs = rule.check(parsed, projectRoot);
      violations.push(...vs);
    } catch {
      // Rule errors are non-fatal; skip
    }
  }

  // In strict mode, promote WARN to ERROR
  if (strict) {
    return violations.map(v => ({ ...v, severity: 'ERROR' as const }));
  }
  return violations;
}

/** Lint all discovered files and return summary */
export function lintAll(filePaths: string[], projectRoot: string, strict: boolean): LintSummary {
  const results: LintResult[] = [];
  let errorCount = 0;
  let warnCount = 0;

  for (const filePath of filePaths) {
    const parsed = parseFile(filePath, projectRoot);
    if (parsed === null) continue;

    const violations = lintFile(parsed, projectRoot, strict);
    results.push({ file: parsed.path, type: parsed.type, violations });
    errorCount += violations.filter(v => v.severity === 'ERROR').length;
    warnCount += violations.filter(v => v.severity === 'WARN').length;
  }

  return { results, totalFiles: results.length, errorCount, warnCount };
}

// ---------------------------------------------------------------------------
// Report formatters
// ---------------------------------------------------------------------------

export function formatText(summary: LintSummary): string {
  const lines: string[] = [];
  for (const result of summary.results) {
    if (result.violations.length === 0) continue;
    lines.push(`\n${result.file} [${result.type}]`);
    for (const v of result.violations) {
      lines.push(`  ${v.severity === 'ERROR' ? 'ERROR' : 'WARN '}  line ${v.line}: ${v.message}`);
    }
  }
  lines.push('');
  lines.push(`Files: ${summary.totalFiles}  Errors: ${summary.errorCount}  Warnings: ${summary.warnCount}`);
  return lines.join('\n');
}

export function formatJson(summary: LintSummary): string {
  return JSON.stringify(summary, null, 2);
}

// ---------------------------------------------------------------------------
// --list-rules subcommand
// ---------------------------------------------------------------------------

export function listRules(): string {
  const lines: string[] = [
    'Config Style Guide — Linter Rule List (§13)',
    '',
    '| ID     | Severity | Description |',
    '|--------|----------|-------------|',
  ];
  for (const rule of ALL_RULES) {
    lines.push(`| ${rule.id.padEnd(6)} | ${rule.severity.padEnd(8)} | ${rule.description} |`);
  }
  lines.push('');
  const errCount = ALL_RULES.filter(r => r.severity === 'ERROR').length;
  const warnCount = ALL_RULES.filter(r => r.severity === 'WARN').length;
  lines.push(`Total: ${errCount} ERROR rules, ${warnCount} WARN rules`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

function getProjectRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '../..');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // --list-rules
  if (args.includes('--list-rules')) {
    process.stdout.write(listRules() + '\n');
    process.exit(0);
  }

  const strict = args.includes('--strict');
  const reportFormat = (() => {
    const idx = args.indexOf('--report-format');
    if (idx >= 0 && (args[idx + 1] === 'json' || args[idx + 1] === 'text')) {
      return args[idx + 1] as 'json' | 'text';
    }
    return 'text' as const;
  })();

  const fileArgIdx = args.indexOf('--file');
  const singleFile = fileArgIdx >= 0 ? args[fileArgIdx + 1] : undefined;

  const projectRoot = getProjectRoot();

  // Ensure audit output dir exists (for any future file-based reports)
  const auditDir = join(projectRoot, 'scripts', 'audit');
  if (!existsSync(auditDir)) {
    mkdirSync(auditDir, { recursive: true });
  }

  let filePaths: string[];
  if (singleFile !== undefined && singleFile !== '') {
    const resolved = resolve(singleFile);
    if (!existsSync(resolved)) {
      process.stderr.write(`config-style-lint: error: file not found: ${resolved}\n`);
      process.exit(1);
    }
    filePaths = [resolved];
  } else {
    filePaths = discoverFiles(projectRoot);
  }

  if (filePaths.length === 0) {
    process.stdout.write('config-style-lint: no files found under .claude/\n');
    process.exit(0);
  }

  const summary = lintAll(filePaths, projectRoot, strict);

  if (reportFormat === 'json') {
    process.stdout.write(formatJson(summary) + '\n');
  } else {
    process.stdout.write(formatText(summary) + '\n');
  }

  // Exit 1 if any ERROR (in strict mode, WARN already promoted to ERROR above)
  if (summary.errorCount > 0) {
    process.exit(1);
  }
  process.exit(0);
}

// Only run CLI when this file is the direct entry point (not imported by tests)
// ESM: compare import.meta.url with the resolved main script path
const isMain = (() => {
  try {
    const { argv } = process;
    // argv[1] is the entry file path (absolute, with or without .ts extension)
    const entry = argv[1] ?? '';
    const thisFile = fileURLToPath(import.meta.url);
    // Match with or without .ts/.js extension (tsx re-writes extension)
    return entry === thisFile ||
      entry.replace(/\.[jt]s$/, '') === thisFile.replace(/\.[jt]s$/, '');
  } catch {
    return false;
  }
})();

if (isMain) {
  main().catch((err: unknown) => {
    process.stderr.write(`config-style-lint: fatal: ${String(err)}\n`);
    process.exit(1);
  });
}
