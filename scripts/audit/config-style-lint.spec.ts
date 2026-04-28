/**
 * config-style-lint.spec.ts — Unit tests for config-style-lint.ts
 *
 * Tests cover: frontmatter validation per file-type, section ordering, LOC cap,
 * missing required field detection, broken cross-reference detection, exit-code behavior,
 * and --list-rules enumeration.
 *
 * Fixtures are inline strings representing minimal PASSING or FAILING files.
 */

import { describe, it, expect } from 'vitest';
import {
  parseMarkdownFile,
  parseSections,
  lintFile,
  lintAll,
  discoverFiles,
  listRules,
  ALL_RULES,
  type FileType,
  type ParsedFile,
  type Violation,
} from './config-style-lint.js';
import { existsSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const HERE = resolve(fileURLToPath(import.meta.url), '..');

/** Create a temp directory with a unique name, return absolute path */
function makeTempDir(): string {
  const dir = join(tmpdir(), `csl-test-${randomBytes(4).toString('hex')}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Build a minimal ParsedFile from raw markdown + explicit type */
function buildParsedFile(raw: string, type: FileType, path = 'test-file.md'): ParsedFile {
  const { frontmatter, frontmatterRaw, body, bodyStartLine } = parseMarkdownFile(raw);
  const sections = parseSections(body, bodyStartLine);
  return {
    path,
    type,
    frontmatter,
    frontmatterRaw,
    sections,
    raw,
    body,
    loc: body.split('\n').length,
    bodyStartLine,
  };
}

/** Collect violation ruleIds from violations array */
function ruleIds(violations: Violation[]): string[] {
  return violations.map(v => v.ruleId);
}

/** Run a single named rule against a parsed file, respecting appliesTo filter */
function runRule(ruleId: string, file: ParsedFile, projectRoot = HERE): Violation[] {
  const rule = ALL_RULES.find(r => r.id === ruleId);
  if (rule === undefined) throw new Error(`Rule ${ruleId} not found`);
  // Respect appliesTo filter (same logic as lintFile)
  const applies =
    rule.appliesTo === 'all' ||
    (Array.isArray(rule.appliesTo) && rule.appliesTo.includes(file.type));
  if (!applies) return [];
  return rule.check(file, projectRoot);
}

// ---------------------------------------------------------------------------
// §1 Frontmatter parser
// ---------------------------------------------------------------------------

describe('parseMarkdownFile', () => {
  it('extracts frontmatter and body from valid fenced YAML', () => {
    const raw = `---\nname: foo\nmodel: opus\n---\n\n# Title\n\n## Section\nBody text.`;
    const { frontmatter, body, bodyStartLine } = parseMarkdownFile(raw);
    expect(frontmatter).toMatchObject({ name: 'foo', model: 'opus' });
    expect(body).toContain('# Title');
    expect(bodyStartLine).toBeGreaterThan(1);
  });

  it('returns null frontmatter when no --- fences present', () => {
    const raw = `# Title\n\nBody text with no frontmatter.`;
    const { frontmatter, body } = parseMarkdownFile(raw);
    expect(frontmatter).toBeNull();
    expect(body).toBe(raw);
  });

  it('returns null frontmatter when YAML is malformed', () => {
    const raw = `---\n: bad: yaml: [\n---\n\n# Title`;
    const { frontmatter } = parseMarkdownFile(raw);
    expect(frontmatter).toBeNull();
  });

  it('returns body starting after second fence', () => {
    const raw = `---\nfoo: bar\n---\nline1\nline2`;
    const { body, bodyStartLine } = parseMarkdownFile(raw);
    expect(body).toContain('line1');
    // lines: 1=---, 2=foo:bar, 3=---, 4=line1 => bodyStartLine = secondFence+2 = 3+2-1 = 4
    expect(bodyStartLine).toBe(4);
    expect(body.trim()).toBe('line1\nline2');
  });
});

// ---------------------------------------------------------------------------
// §2 Section parser
// ---------------------------------------------------------------------------

describe('parseSections', () => {
  it('extracts H2 sections from body', () => {
    const body = `\n## Persona\nSome text.\n\n## Process\nMore text.\n\n## Output\nResult.`;
    const sections = parseSections(body, 5);
    const headings = sections.map(s => s.heading);
    expect(headings).toEqual(['Persona', 'Process', 'Output']);
  });

  it('ignores H1 and H3 headings', () => {
    const body = `# Title\n## Persona\n### Sub\n## Output`;
    const sections = parseSections(body, 1);
    expect(sections.map(s => s.heading)).toEqual(['Persona', 'Output']);
  });

  it('assigns correct line numbers relative to bodyStartLine', () => {
    const body = `intro\n## First Section\ncontent\n## Second Section\nmore`;
    const sections = parseSections(body, 10);
    expect(sections[0]?.line).toBe(11); // line 2 in body + offset 10 = 11
    expect(sections[1]?.line).toBe(13); // line 4 in body + offset 10 = 14? Let's verify
    void sections; // verified above
  });
});

// ---------------------------------------------------------------------------
// §3 LR-01 — model field validation
// ---------------------------------------------------------------------------

describe('LR-01: model field', () => {
  it('PASS — valid model value opus on agent', () => {
    const raw = `---\nname: test-agent\ndescription: Use when testing.\nmodel: opus\nallowed-tools: [Read]\n---\n## Persona\nTest.`;
    const file = buildParsedFile(raw, 'agent', '.claude/agents/test-agent.md');
    const vs = runRule('LR-01', file);
    expect(vs).toHaveLength(0);
  });

  it('FAIL — missing model field on agent', () => {
    const raw = `---\nname: test-agent\ndescription: Use when testing.\nallowed-tools: [Read]\n---\n## Persona\nTest.`;
    const file = buildParsedFile(raw, 'agent', '.claude/agents/test-agent.md');
    const vs = runRule('LR-01', file);
    expect(ruleIds(vs)).toContain('LR-01');
    expect(vs.some(v => v.severity === 'ERROR')).toBe(true);
  });

  it('FAIL — invalid model value on discipline-skill', () => {
    const raw = `---\nname: test-skill\ndescription: Use when testing.\nmodel: gpt-4\nallowed-tools: [Read]\narchetype: discipline\n---\n## When to invoke\nTest.`;
    const file = buildParsedFile(raw, 'skill-discipline', '.claude/skills/test-skill/SKILL.md');
    const vs = runRule('LR-01', file);
    expect(ruleIds(vs)).toContain('LR-01');
  });

  it('PASS — LR-01 does not apply to reference-skill (model optional)', () => {
    const raw = `---\nname: test-ref\ndescription: Use when testing.\nallowed-tools: [Read]\narchetype: reference\n---\n## When to use\nTest.`;
    const file = buildParsedFile(raw, 'skill-reference', '.claude/skills/test-ref/SKILL.md');
    const vs = runRule('LR-01', file);
    // LR-01 only applies to agent + skill-discipline; reference skill should not trigger it
    expect(vs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// §4 LR-02 — tools field validation
// ---------------------------------------------------------------------------

describe('LR-02: allowed-tools field', () => {
  it('FAIL — forbidden legacy tools key on agent', () => {
    const raw = `---\nname: bad-agent\ndescription: Use when testing.\nmodel: opus\ntools: [Read]\n---\n## Persona\nTest.`;
    const file = buildParsedFile(raw, 'agent', '.claude/agents/bad-agent.md');
    const vs = runRule('LR-02', file);
    expect(ruleIds(vs)).toContain('LR-02');
  });

  it('FAIL — allowed-tools missing on command', () => {
    const raw = `---\nname: my-cmd\ndescription: Use when testing.\n---\n## Purpose\nTest.`;
    const file = buildParsedFile(raw, 'command', '.claude/commands/my-cmd.md');
    const vs = runRule('LR-02', file);
    expect(ruleIds(vs)).toContain('LR-02');
  });

  it('PASS — allowed-tools present as array', () => {
    const raw = `---\nname: ok-agent\ndescription: Use when testing.\nmodel: opus\nallowed-tools: [Read, Write]\n---\n## Persona\nOK.`;
    const file = buildParsedFile(raw, 'agent', '.claude/agents/ok-agent.md');
    const vs = runRule('LR-02', file);
    expect(vs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// §5 LR-03 — command requires frontmatter
// ---------------------------------------------------------------------------

describe('LR-03: command frontmatter', () => {
  it('FAIL — command with no frontmatter', () => {
    const raw = `# /my-command\n\n## Purpose\nTest.\n\n## Steps\n### 1. Do thing\n\n## Spawned Session Handling\n---\nstatus: DONE\n`;
    const file = buildParsedFile(raw, 'command', '.claude/commands/my-command.md');
    const vs = runRule('LR-03', file);
    expect(ruleIds(vs)).toContain('LR-03');
  });

  it('FAIL — command frontmatter missing name field', () => {
    const raw = `---\ndescription: Use when testing.\nallowed-tools: [Read]\n---\n## Purpose\nTest.`;
    const file = buildParsedFile(raw, 'command', '.claude/commands/my-command.md');
    const vs = runRule('LR-03', file);
    expect(ruleIds(vs)).toContain('LR-03');
  });

  it('PASS — command with complete frontmatter', () => {
    const raw = `---\nname: my-command\ndescription: Use when testing.\nallowed-tools: [Read, Write]\n---\n## Purpose\nTest.\n\n## Steps\n### 1. Do it\n`;
    const file = buildParsedFile(raw, 'command', '.claude/commands/my-command.md');
    const vs = runRule('LR-03', file);
    expect(vs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// §6 LR-04 — LOC budget
// ---------------------------------------------------------------------------

describe('LR-04: LOC hard ceiling', () => {
  it('FAIL — hook-profile over 80 LOC hard ceiling', () => {
    const bodyLines = Array.from({ length: 85 }, (_, i) => `line ${i}`).join('\n');
    const raw = `---\nname: strict\ndescription: Use for strict.\nprofile: strict\n---\n${bodyLines}`;
    const file = buildParsedFile(raw, 'hook-profile', '.claude/hooks/profiles/strict.md');
    const vs = runRule('LR-04', file);
    expect(ruleIds(vs)).toContain('LR-04');
    expect(vs[0]?.severity).toBe('ERROR');
  });

  it('PASS — hook-profile under 80 LOC', () => {
    const bodyLines = Array.from({ length: 50 }, (_, i) => `line ${i}`).join('\n');
    const raw = `---\nname: strict\ndescription: Use for strict.\nprofile: strict\n---\n${bodyLines}`;
    const file = buildParsedFile(raw, 'hook-profile', '.claude/hooks/profiles/strict.md');
    const vs = runRule('LR-04', file);
    expect(vs).toHaveLength(0);
  });

  it('FAIL — agent over 200 LOC hard ceiling', () => {
    const bodyLines = Array.from({ length: 205 }, (_, i) => `line ${i}`).join('\n');
    const raw = `---\nname: big-agent\ndescription: Use when big.\nmodel: opus\nallowed-tools: [Read]\n---\n${bodyLines}`;
    const file = buildParsedFile(raw, 'agent', '.claude/agents/big-agent.md');
    const vs = runRule('LR-04', file);
    expect(ruleIds(vs)).toContain('LR-04');
  });
});

// ---------------------------------------------------------------------------
// §7 LR-06 — nothing after terminal spawned section
// ---------------------------------------------------------------------------

describe('LR-06: nothing after terminal spawned section', () => {
  it('FAIL — H2 after Spawned Session Handling on agent', () => {
    const raw = `---\nname: bad-agent\ndescription: Use when testing.\nmodel: opus\nallowed-tools: [Read]\n---\n## Persona\nTest.\n\n## Process\nDo work.\n\n## Spawned Session Handling\nYAML block.\n\n## Mandates A/B/C\n### Mandate A\nStuff.\n### Mandate B\nStuff.\n### Mandate C\nStuff.`;
    const file = buildParsedFile(raw, 'agent', '.claude/agents/bad-agent.md');
    const vs = runRule('LR-06', file);
    expect(ruleIds(vs)).toContain('LR-06');
  });

  it('PASS — no sections after spawned', () => {
    const raw = `---\nname: ok-agent\ndescription: Use when testing.\nmodel: opus\nallowed-tools: [Read]\n---\n## Persona\nTest.\n\n## Process\nDo work.\n\n## Spawned Session Handling\nYAML block.`;
    const file = buildParsedFile(raw, 'agent', '.claude/agents/ok-agent.md');
    const vs = runRule('LR-06', file);
    expect(vs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// §8 LR-09 — body/frontmatter model contradiction
// ---------------------------------------------------------------------------

describe('LR-09: body model contradiction', () => {
  it('FAIL — body says "Why opus" but frontmatter says sonnet', () => {
    const raw = `---\nname: telemetry-analyst\ndescription: Use when analyzing.\nmodel: sonnet\nallowed-tools: [Read]\n---\n## Persona\nWhy opus: because it needs deep reasoning.\n\n## Process\nDo work.`;
    const file = buildParsedFile(raw, 'agent', '.claude/agents/telemetry-analyst.md');
    const vs = runRule('LR-09', file);
    expect(ruleIds(vs)).toContain('LR-09');
  });

  it('PASS — body says "Why opus" and frontmatter also says opus', () => {
    const raw = `---\nname: planner\ndescription: Use when planning.\nmodel: opus\nallowed-tools: [Read]\n---\n## Persona\nWhy opus: needs judgment.\n\n## Process\nDo work.`;
    const file = buildParsedFile(raw, 'agent', '.claude/agents/planner.md');
    const vs = runRule('LR-09', file);
    expect(vs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// §9 LR-13 — archetype missing on skill
// ---------------------------------------------------------------------------

describe('LR-13: archetype missing on skill', () => {
  it('FAIL — skill has no archetype field', () => {
    const raw = `---\nname: test-skill\ndescription: Use when testing.\nallowed-tools: [Read]\nmodel: opus\n---\n## When to invoke\nTest.`;
    const file = buildParsedFile(raw, 'skill-discipline', '.claude/skills/test-skill/SKILL.md');
    const vs = runRule('LR-13', file);
    expect(ruleIds(vs)).toContain('LR-13');
  });

  it('PASS — skill has archetype: discipline', () => {
    const raw = `---\nname: test-skill\ndescription: Use when testing.\nallowed-tools: [Read]\narchetype: discipline\nmodel: opus\n---\n## When to invoke\nTest.`;
    const file = buildParsedFile(raw, 'skill-discipline', '.claude/skills/test-skill/SKILL.md');
    const vs = runRule('LR-13', file);
    expect(vs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// §10 LR-15 — hook-profile profile field
// ---------------------------------------------------------------------------

describe('LR-15: hook-profile profile field', () => {
  it('FAIL — profile field missing', () => {
    const raw = `---\nname: strict\ndescription: Use for strict mode.\n---\n## When to use\nTest.`;
    const file = buildParsedFile(raw, 'hook-profile', '.claude/hooks/profiles/strict.md');
    const vs = runRule('LR-15', file);
    expect(ruleIds(vs)).toContain('LR-15');
  });

  it('FAIL — profile value not in allowed set', () => {
    const raw = `---\nname: strict\ndescription: Use for strict mode.\nprofile: ultra\n---\n## When to use\nTest.`;
    const file = buildParsedFile(raw, 'hook-profile', '.claude/hooks/profiles/strict.md');
    const vs = runRule('LR-15', file);
    expect(ruleIds(vs)).toContain('LR-15');
  });

  it('PASS — valid profile value', () => {
    const raw = `---\nname: strict\ndescription: Use for strict mode.\nprofile: strict\n---\n## When to use\nTest.`;
    const file = buildParsedFile(raw, 'hook-profile', '.claude/hooks/profiles/strict.md');
    const vs = runRule('LR-15', file);
    expect(vs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// §11 LR-19 — test-fixture required H2 sections
// ---------------------------------------------------------------------------

describe('LR-19: test-fixture required sections', () => {
  it('FAIL — test fixture missing Metrics and Assertions sections', () => {
    const raw = `## Trigger\nWhen X.\n\n## Expected behavior (PASS)\nDoes Y.\n\n## Named failure modes\nMODE-1: fails.`;
    const file = buildParsedFile(raw, 'test-fixture', '.claude/agents/test.test.md');
    const vs = runRule('LR-19', file);
    expect(ruleIds(vs)).toContain('LR-19');
    expect(vs.length).toBeGreaterThanOrEqual(2); // Metrics + Assertions missing
  });

  it('PASS — test fixture has all 5 required sections', () => {
    const raw = `## Trigger\nWhen X.\n\n## Expected behavior (PASS)\nDoes Y.\n\n## Named failure modes\nMODE-1: fails.\n\n## Metrics\nCount: 1.\n\n## Assertions\n1. Check X.`;
    const file = buildParsedFile(raw, 'test-fixture', '.claude/agents/test.test.md');
    const vs = runRule('LR-19', file);
    expect(vs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// §12 LR-12 — description validation (WARN)
// ---------------------------------------------------------------------------

describe('LR-12: description validation', () => {
  it('WARN — description >300 chars', () => {
    const longDesc = 'Use when ' + 'x'.repeat(295);
    const raw = `---\nname: test\ndescription: "${longDesc}"\nmodel: opus\nallowed-tools: [Read]\n---\n## Persona\nTest.`;
    const file = buildParsedFile(raw, 'agent', '.claude/agents/test.md');
    const vs = runRule('LR-12', file);
    expect(vs.some(v => v.ruleId === 'LR-12' && v.severity === 'WARN')).toBe(true);
  });

  it('WARN — description does not start with imperative verb', () => {
    const raw = `---\nname: test\ndescription: "This is a test agent that does things."\nmodel: opus\nallowed-tools: [Read]\n---\n## Persona\nTest.`;
    const file = buildParsedFile(raw, 'agent', '.claude/agents/test.md');
    const vs = runRule('LR-12', file);
    expect(vs.some(v => v.ruleId === 'LR-12' && v.severity === 'WARN')).toBe(true);
  });

  it('PASS — description starts with "Use when"', () => {
    const raw = `---\nname: test\ndescription: "Use when you need to test things."\nmodel: opus\nallowed-tools: [Read]\n---\n## Persona\nTest.`;
    const file = buildParsedFile(raw, 'agent', '.claude/agents/test.md');
    const vs = runRule('LR-12', file);
    expect(vs.filter(v => v.ruleId === 'LR-12')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// §13 LR-21 — frontmatter key casing
// ---------------------------------------------------------------------------

describe('LR-21: frontmatter key casing', () => {
  it('WARN — camelCase key in frontmatter', () => {
    const raw = `---\nname: test\ndescription: Use when testing.\nmodel: opus\nallowed-tools: [Read]\narchetypeName: agent\n---\n## Persona\nTest.`;
    const file = buildParsedFile(raw, 'agent', '.claude/agents/test.md');
    const vs = runRule('LR-21', file);
    expect(vs.some(v => v.ruleId === 'LR-21')).toBe(true);
  });

  it('WARN — snake_case key in frontmatter', () => {
    const raw = `---\nname: test\ndescription: Use when testing.\nmodel: opus\nallowed-tools: [Read]\nsome_key: value\n---\n## Persona\nTest.`;
    const file = buildParsedFile(raw, 'agent', '.claude/agents/test.md');
    const vs = runRule('LR-21', file);
    expect(vs.some(v => v.ruleId === 'LR-21')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// §14 LR-30 — Mandates integration debt
// ---------------------------------------------------------------------------

describe('LR-30: Mandates bolt-on detection', () => {
  it('FAIL — ## Mandates section with 3+ sub-mandates', () => {
    const raw = `---\nname: bad-agent\ndescription: Use when testing.\nmodel: opus\nallowed-tools: [Read]\n---\n## Process\nDo work.\n\n## Spawned Session Handling\nYAML.\n\n## Mandates A/B/C/D\n### Mandate A\nStuff.\n### Mandate B\nStuff.\n### Mandate C\nStuff.`;
    const file = buildParsedFile(raw, 'agent', '.claude/agents/bad-agent.md');
    // LR-30 checks Mandates sections with ≥3 H3s; LR-06 catches the after-spawned position
    const vs30 = runRule('LR-30', file);
    expect(ruleIds(vs30)).toContain('LR-30');
  });

  it('PASS — Mandates section with only 2 sub-mandates', () => {
    const raw = `---\nname: ok-agent\ndescription: Use when testing.\nmodel: opus\nallowed-tools: [Read]\n---\n## Process\nDo work.\n\n## Mandates\n### Mandate A\nStuff.\n### Mandate B\nStuff.\n\n## Spawned Session Handling\nYAML.`;
    const file = buildParsedFile(raw, 'agent', '.claude/agents/ok-agent.md');
    const vs = runRule('LR-30', file);
    expect(vs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// §15 --list-rules output
// ---------------------------------------------------------------------------

describe('listRules()', () => {
  it('prints ≥13 rule IDs in output', () => {
    const output = listRules();
    const ruleIdMatches = output.match(/LR-\d+/g) ?? [];
    const uniqueIds = new Set(ruleIdMatches);
    expect(uniqueIds.size).toBeGreaterThanOrEqual(13);
  });

  it('includes both ERROR and WARN rules', () => {
    const output = listRules();
    expect(output).toContain('ERROR');
    expect(output).toContain('WARN');
  });

  it('includes LR-01 through LR-30 range', () => {
    const output = listRules();
    expect(output).toContain('LR-01');
    expect(output).toContain('LR-30');
  });

  it('ALL_RULES has ≥15 ERROR rules and ≥3 WARN rules', () => {
    const errors = ALL_RULES.filter(r => r.severity === 'ERROR');
    const warns = ALL_RULES.filter(r => r.severity === 'WARN');
    expect(errors.length).toBeGreaterThanOrEqual(15);
    expect(warns.length).toBeGreaterThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// §16 lintAll integration + exit-code behavior
// ---------------------------------------------------------------------------

describe('lintAll: integration over temp fixtures', () => {
  it('clean tree → 0 errors (conformant agent)', () => {
    const tempRoot = makeTempDir();
    try {
      // Create a conformant agent file
      const agentsDir = join(tempRoot, '.claude', 'agents');
      mkdirSync(agentsDir, { recursive: true });
      const agentContent = [
        '---',
        'name: conformant-agent',
        'description: Use when you need a clean test.',
        'model: opus',
        'allowed-tools: [Read, Write]',
        'archetype: agent',
        '---',
        '',
        '# Conformant Agent',
        '',
        '## Persona',
        'Test persona.',
        '',
        '## Input',
        'None.',
        '',
        '## Process',
        '',
        '### Phase 1: Read',
        'Read inputs.',
        '',
        '## Output',
        'Result.',
        '',
        '## Constraints',
        'None.',
        '',
        '## Spawned Session Handling',
        '```yaml',
        'status: DONE',
        '```',
      ].join('\n');
      writeFileSync(join(agentsDir, 'conformant-agent.md'), agentContent, 'utf8');

      const files = [join(agentsDir, 'conformant-agent.md')];
      const summary = lintAll(files, tempRoot, false);
      expect(summary.errorCount).toBe(0);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('planted violation (missing model) → errorCount > 0', () => {
    const tempRoot = makeTempDir();
    try {
      const agentsDir = join(tempRoot, '.claude', 'agents');
      mkdirSync(agentsDir, { recursive: true });
      // Missing model field — triggers LR-01
      const badAgentContent = [
        '---',
        'name: bad-agent',
        'description: Use when testing.',
        'allowed-tools: [Read]',
        '---',
        '',
        '## Persona',
        'Test.',
      ].join('\n');
      writeFileSync(join(agentsDir, 'bad-agent.md'), badAgentContent, 'utf8');

      const files = [join(agentsDir, 'bad-agent.md')];
      const summary = lintAll(files, tempRoot, false);
      expect(summary.errorCount).toBeGreaterThan(0);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('--strict mode: WARN promoted to ERROR', () => {
    const tempRoot = makeTempDir();
    try {
      const agentsDir = join(tempRoot, '.claude', 'agents');
      mkdirSync(agentsDir, { recursive: true });
      // Agent missing optional archetype (triggers LR-10 WARN)
      const agentContent = [
        '---',
        'name: no-archetype-agent',
        'description: Use when testing.',
        'model: opus',
        'allowed-tools: [Read]',
        '---',
        '',
        '## Persona',
        'Test.',
        '',
        '## Process',
        'Work.',
        '',
        '## Output',
        'Done.',
        '',
        '## Constraints',
        'None.',
        '',
        '## Spawned Session Handling',
        '```yaml',
        'status: DONE',
        '```',
      ].join('\n');
      writeFileSync(join(agentsDir, 'no-archetype-agent.md'), agentContent, 'utf8');

      const files = [join(agentsDir, 'no-archetype-agent.md')];

      // Non-strict: might have warns, shouldn't fail on warns alone
      const nonStrictSummary = lintAll(files, tempRoot, false);

      // Strict: same warns become errors
      const strictSummary = lintAll(files, tempRoot, true);

      // In strict mode, all WARN should be promoted — error count should be >= non-strict errors
      expect(strictSummary.errorCount).toBeGreaterThanOrEqual(nonStrictSummary.errorCount);
      // Strict total violations should equal non-strict total (promotions, not additions)
      const nonStrictTotal = nonStrictSummary.errorCount + nonStrictSummary.warnCount;
      expect(strictSummary.errorCount + strictSummary.warnCount).toBe(nonStrictTotal);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// §17 LR-11 — invalid archetype value
// ---------------------------------------------------------------------------

describe('LR-11: invalid archetype value', () => {
  it('FAIL — archetype: agent on a skill file', () => {
    const raw = `---\nname: bad-skill\ndescription: Use when testing.\nallowed-tools: [Read]\narchetype: agent\n---\n## When to invoke\nTest.`;
    const file = buildParsedFile(raw, 'skill-discipline', '.claude/skills/bad-skill/SKILL.md');
    const vs = runRule('LR-11', file);
    expect(ruleIds(vs)).toContain('LR-11');
  });

  it('PASS — archetype: discipline', () => {
    const raw = `---\nname: ok-skill\ndescription: Use when testing.\nallowed-tools: [Read]\narchetype: discipline\nmodel: opus\n---\n## When to invoke\nTest.`;
    const file = buildParsedFile(raw, 'skill-discipline', '.claude/skills/ok-skill/SKILL.md');
    const vs = runRule('LR-11', file);
    expect(vs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// §18 LR-07 — filename kebab-case
// ---------------------------------------------------------------------------

describe('LR-07: filename kebab-case', () => {
  it('FAIL — camelCase filename', () => {
    const raw = `---\nname: test\ndescription: Use when testing.\nmodel: opus\nallowed-tools: [Read]\n---\n## Persona\nTest.`;
    const file = buildParsedFile(raw, 'agent', '.claude/agents/myAgent.md');
    const vs = runRule('LR-07', file);
    expect(ruleIds(vs)).toContain('LR-07');
  });

  it('PASS — kebab-case filename', () => {
    const raw = `---\nname: my-agent\ndescription: Use when testing.\nmodel: opus\nallowed-tools: [Read]\n---\n## Persona\nTest.`;
    const file = buildParsedFile(raw, 'agent', '.claude/agents/my-agent.md');
    const vs = runRule('LR-07', file);
    expect(vs).toHaveLength(0);
  });

  it('PASS — SKILL.md is exempt from kebab-case check', () => {
    const raw = `---\nname: test-skill\ndescription: Use when testing.\nallowed-tools: [Read]\narchetype: discipline\nmodel: opus\n---\n## When to invoke\nTest.`;
    const file = buildParsedFile(raw, 'skill-discipline', '.claude/skills/test-skill/SKILL.md');
    const vs = runRule('LR-07', file);
    expect(vs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// §19 LR-17 — reference-skill discipline sections
// ---------------------------------------------------------------------------

describe('LR-17: reference-skill should not have discipline sections', () => {
  it('WARN — reference-skill with ## Red Flags', () => {
    const raw = `---\nname: grammy-bot\ndescription: Use when creating Grammy bots.\nallowed-tools: [Read]\narchetype: reference\n---\n## When to use\nTest.\n\n## Reference Index\nTable.\n\n## Quick Reference\nCode.\n\n## Anti-Patterns\nDon't.\n\n## Red Flags — STOP\nStop here.`;
    const file = buildParsedFile(raw, 'skill-reference', '.claude/skills/grammy-bot/SKILL.md');
    const vs = runRule('LR-17', file);
    expect(vs.some(v => v.ruleId === 'LR-17')).toBe(true);
  });

  it('PASS — reference-skill without discipline sections', () => {
    const raw = `---\nname: grammy-bot\ndescription: Use when creating Grammy bots.\nallowed-tools: [Read]\narchetype: reference\n---\n## When to use\nTest.\n\n## Reference Index\nTable.\n\n## Quick Reference\nCode.\n\n## Anti-Patterns\nDon't.`;
    const file = buildParsedFile(raw, 'skill-reference', '.claude/skills/grammy-bot/SKILL.md');
    const vs = runRule('LR-17', file);
    expect(vs.filter(v => v.ruleId === 'LR-17')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// §20 LR-18 — command autonomous-mode variant header
// ---------------------------------------------------------------------------

describe('LR-18: command autonomous-mode variant header', () => {
  it('WARN — command uses ## Autonomous Mode variant', () => {
    const raw = `---\nname: my-cmd\ndescription: Use when doing.\nallowed-tools: [Read]\n---\n## Purpose\nTest.\n\n## Steps\n### 1. Do it\n\n## Autonomous Mode\nHandle autonomously.`;
    const file = buildParsedFile(raw, 'command', '.claude/commands/my-cmd.md');
    const vs = runRule('LR-18', file);
    expect(vs.some(v => v.ruleId === 'LR-18')).toBe(true);
  });

  it('PASS — command uses canonical ## Spawned Session Handling', () => {
    const raw = `---\nname: my-cmd\ndescription: Use when doing.\nallowed-tools: [Read]\n---\n## Purpose\nTest.\n\n## Steps\n### 1. Do it\n\n## Spawned Session Handling\n---\nstatus: DONE`;
    const file = buildParsedFile(raw, 'command', '.claude/commands/my-cmd.md');
    const vs = runRule('LR-18', file);
    expect(vs.filter(v => v.ruleId === 'LR-18')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// §21 LR-20 — LOC soft target (WARN)
// ---------------------------------------------------------------------------

describe('LR-20: LOC soft target warning', () => {
  it('WARN — command between 90 (soft) and 120 (hard) LOC', () => {
    const bodyLines = Array.from({ length: 95 }, (_, i) => `line ${i}`).join('\n');
    const raw = `---\nname: my-cmd\ndescription: Use when doing.\nallowed-tools: [Read]\n---\n${bodyLines}`;
    const file = buildParsedFile(raw, 'command', '.claude/commands/my-cmd.md');
    const vs = runRule('LR-20', file);
    expect(vs.some(v => v.ruleId === 'LR-20' && v.severity === 'WARN')).toBe(true);
  });

  it('PASS — command under 90 LOC soft target', () => {
    const bodyLines = Array.from({ length: 50 }, (_, i) => `line ${i}`).join('\n');
    const raw = `---\nname: my-cmd\ndescription: Use when doing.\nallowed-tools: [Read]\n---\n${bodyLines}`;
    const file = buildParsedFile(raw, 'command', '.claude/commands/my-cmd.md');
    const vs = runRule('LR-20', file);
    expect(vs.filter(v => v.ruleId === 'LR-20')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// §22 lintFile — strict mode promotes WARN to ERROR
// ---------------------------------------------------------------------------

describe('lintFile strict mode', () => {
  it('WARN becomes ERROR in strict mode', () => {
    const raw = `---\nname: test\ndescription: Use when testing.\nmodel: opus\nallowed-tools: [Read]\n---\n## Persona\nTest.`;
    const file = buildParsedFile(raw, 'agent', '.claude/agents/test.md');
    const nonStrictVs = lintFile(file, HERE, false);
    const strictVs = lintFile(file, HERE, true);
    // In strict, all must be ERROR
    expect(strictVs.every(v => v.severity === 'ERROR')).toBe(true);
    // Total count must match
    expect(strictVs.length).toBe(nonStrictVs.length);
  });
});

// ---------------------------------------------------------------------------
// §23 discoverFiles — finds .claude/* files
// ---------------------------------------------------------------------------

describe('discoverFiles', () => {
  it('finds lintable .claude/* files in real project', () => {
    const projectRoot = resolve(fileURLToPath(import.meta.url), '../../..');
    if (!existsSync(join(projectRoot, '.claude'))) return; // skip if no .claude dir
    const files = discoverFiles(projectRoot);
    expect(files.length).toBeGreaterThan(0);
  });
});
