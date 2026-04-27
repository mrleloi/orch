/**
 * session-end-escalation.spec.ts — Structural tests for Task 5.1.6 (G-1 sentinel discipline)
 *
 * Tests:
 *   1. session-end.md declares the escalation sentinel write step (content check)
 *   2. agent-workspace/memory/escalation.md exists at repo root memory dir
 *   3. escalation.md frontmatter parses with required fields: status, last_session,
 *      last_check, phase, substage
 *
 * These are structural / markdown-lint-style tests because /session-end is a command
 * doc (instructional), not an executable script. The acceptance harness verifies the
 * command file contract and the sentinel file presence per spec §3.5.1.6.D.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const PROJECT_ROOT = resolve(__dirname, '../..');
const SESSION_END_CMD = resolve(PROJECT_ROOT, '.claude/commands/session-end.md');
const ESCALATION_SENTINEL = resolve(PROJECT_ROOT, 'agent-workspace/memory/escalation.md');

// ---------------------------------------------------------------------------
// Minimal frontmatter parser — no external yaml dep needed.
// Extracts the YAML block between the first pair of `---` delimiters.
// ---------------------------------------------------------------------------
function parseFrontmatter(content: string): Record<string, string> | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  const fm: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (kv) {
      fm[kv[1]] = kv[2].trim();
    }
  }
  return fm;
}

describe('G-1 escalation sentinel discipline (Task 5.1.6)', () => {
  it('session-end.md declares the escalation sentinel write step with G-1 marker', () => {
    expect(existsSync(SESSION_END_CMD)).toBe(true);
    const content = readFileSync(SESSION_END_CMD, 'utf8');

    // Spec §D row 1: must match /Escalation Sentinel.{0,30}G-1.{0,30}always/
    expect(content).toMatch(/Escalation Sentinel.{0,30}G-1.{0,30}always/);

    // Must contain the YAML template literal with all required fields.
    expect(content).toContain('status: NONE | STOP-1 | STOP-2 | STOP-3 | STOP-4 | STOP-5');
    expect(content).toContain('last_session:');
    expect(content).toContain('last_check:');
    expect(content).toContain('phase:');
    expect(content).toContain('substage:');
  });

  it('escalation.md exists in agent-workspace/memory/', () => {
    // Spec §D row 2: file must exist after Phase 5.1 close.
    expect(existsSync(ESCALATION_SENTINEL)).toBe(true);
  });

  it('escalation.md frontmatter parses as valid YAML with required fields', () => {
    expect(existsSync(ESCALATION_SENTINEL)).toBe(true);
    const content = readFileSync(ESCALATION_SENTINEL, 'utf8');

    // Spec §D row 3: object has keys status, last_session, last_check, phase, substage.
    const fm = parseFrontmatter(content);
    expect(fm).not.toBeNull();
    expect(fm).toHaveProperty('status');
    expect(fm).toHaveProperty('last_session');
    expect(fm).toHaveProperty('last_check');
    expect(fm).toHaveProperty('phase');
    expect(fm).toHaveProperty('substage');

    // status must be one of the valid values.
    const validStatuses = ['NONE', 'STOP-1', 'STOP-2', 'STOP-3', 'STOP-4', 'STOP-5'];
    expect(validStatuses).toContain(fm!['status']);
  });
});
