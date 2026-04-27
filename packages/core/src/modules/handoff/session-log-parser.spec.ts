/**
 * session-log-parser.spec.ts — Unit tests for SessionLogParser.
 *
 * Test inventory (≥ 13 tests per Part B.4):
 *
 * Golden tests (B.1) — 5 real session logs:
 *  G1: 2026-04-25-session-15-task-2.13.md — baseline happy path
 *  G2: 2026-04-25-session-19-task-3.8.md — decision sub-headings (list-item fallback)
 *  G3: 2026-04-25-session-1-task-1.10.md — variant template
 *  G4: 2026-04-24-session-1.md — "What Got Done" alias + H3 sub-headings
 *  G5: 2026-04-25-session-13-task-2.9.md — larger log; size sanity check
 *
 * Synthetic tests (B.2) — 8 edge cases:
 *  S1: missing-pickup.md — nextSessionPickup === null; missingSections contains 'next_session_pickup'
 *  S2: nonstandard-headings.md — H3 headings ignored; all sections missing
 *  S3: empty.md — 0-byte; all empty + all missingSections raised
 *  S4: code-block-trap.md — list items inside fences NOT extracted
 *  S5: huge-50kb.md — perf assertion < 100ms (generated in beforeAll)
 *  S6: binary-fence.md — null bytes in fence do not crash parser
 *  S7: crlf-line-endings.md — CRLF identical extraction to missing-pickup.md
 *  S8: over-256kb.md — throws HandoffBuilderError with code LOG_TOO_LARGE
 *
 * Additional:
 *  A1: LOG_READ_FAILED — mock IFsReader throws ENOENT
 *
 * Decision 006 enforcement: no LLM, no Anthropic SDK, no network.
 * I-12: Zero `any` in this file (test mocks are typed).
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { SessionLogSummary, IFsReader } from './types.js';
import { HandoffBuilderError } from './types.js';
import { SessionLogParser } from './session-log-parser.js';
import {
  generateHuge50kb,
  generateOver256kb,
} from './__fixtures__/sessions/synthetic/_generators.js';

// ── Paths ─────────────────────────────────────────────────────────────────────

const SESSIONS_DIR = join(__dirname, '__fixtures__', 'sessions');
const SYNTHETIC_DIR = join(SESSIONS_DIR, 'synthetic');
const EXPECTATIONS_PATH = join(SESSIONS_DIR, 'expectations.json');

const HUGE_PATH = join(SYNTHETIC_DIR, 'huge-50kb.md');
const OVER256_PATH = join(SYNTHETIC_DIR, 'over-256kb.md');

// ── Expectations ──────────────────────────────────────────────────────────────

interface FixtureExpectation {
  completed?: number;
  completedMin?: number;
  pending?: number;
  decisions?: number;
  decisionsMin?: number;
  hasPickup: boolean;
  pickupContains?: string;
  missingSections: string[];
  sessionDate?: string;
  sessionNumber?: number;
}

const expectations: Record<string, FixtureExpectation> = JSON.parse(
  readFileSync(EXPECTATIONS_PATH, 'utf-8'),
);

// ── IFsReader factory (real filesystem) ──────────────────────────────────────

import { promises as fsPromises } from 'node:fs';

function createRealFsReader(): IFsReader {
  return {
    readFile: (path: string, encoding: 'utf-8') =>
      fsPromises.readFile(path, encoding),
    stat: async (path: string) => {
      const s = await fsPromises.stat(path);
      return { size: s.size };
    },
  };
}

/** Build a parser that reads from the real filesystem. */
function makeParser(fs: IFsReader = createRealFsReader()): SessionLogParser {
  return new SessionLogParser(fs);
}

// ── Large fixture setup ───────────────────────────────────────────────────────

let hugeFixtureStats: { completedCount: number; pendingCount: number; decisionsCount: number };

beforeAll(() => {
  // Ensure synthetic dir exists
  if (!existsSync(SYNTHETIC_DIR)) {
    mkdirSync(SYNTHETIC_DIR, { recursive: true });
  }
  // Generate large fixtures at test setup (not committed as bytes)
  hugeFixtureStats = generateHuge50kb(HUGE_PATH);
  generateOver256kb(OVER256_PATH);
});

// ─────────────────────────────────────────────────────────────────────────────
// GOLDEN TESTS (B.1)
// ─────────────────────────────────────────────────────────────────────────────

describe('SessionLogParser — Golden fixtures (B.1)', () => {
  // G1: session-15 — baseline happy path
  it('G1: session-15 (task-2.13) — 4 completed, 0 decisions, pickup contains sentinel', async () => {
    const filePath = join(SESSIONS_DIR, '2026-04-25-session-15-task-2.13.md');
    const parser = makeParser();
    const result: SessionLogSummary = await parser.parse(filePath);
    const exp = expectations['2026-04-25-session-15-task-2.13.md'];

    expect(result.completed.length).toBe(exp.completed);
    expect(result.pending.length).toBe(exp.pending);
    expect(result.decisions.length).toBe(exp.decisions);
    expect(result.nextSessionPickup).not.toBeNull();
    expect(result.nextSessionPickup).toContain(exp.pickupContains!);
    expect(result.missingSections).toEqual(expect.arrayContaining(exp.missingSections));
    expect(result.missingSections.length).toBe(exp.missingSections.length);
    expect(result.sessionDate).toBe(exp.sessionDate);
    expect(result.sessionNumber).toBe(exp.sessionNumber);
    expect(result.filePath).toBe(filePath);
  });

  // G2: session-19 — decision list items (no sub-headings → fallback)
  it('G2: session-19 (task-3.8) — ≥3 completed, 4 decisions, pickup contains Task 3.9', async () => {
    const filePath = join(SESSIONS_DIR, '2026-04-25-session-19-task-3.8.md');
    const parser = makeParser();
    const result: SessionLogSummary = await parser.parse(filePath);
    const exp = expectations['2026-04-25-session-19-task-3.8.md'];

    expect(result.completed.length).toBeGreaterThanOrEqual(exp.completed!);
    expect(result.pending.length).toBe(exp.pending);
    expect(result.decisions.length).toBe(exp.decisions);
    expect(result.nextSessionPickup).not.toBeNull();
    expect(result.nextSessionPickup).toContain(exp.pickupContains!);
    expect(result.missingSections).toContain('pending');
    expect(result.sessionDate).toBe(exp.sessionDate);
    expect(result.sessionNumber).toBe(exp.sessionNumber);
  });

  // G3: session-1-task-1.10 — variant template
  it('G3: session-1 (task-1.10) — ≥8 completed, ≥1 decisions, has pickup', async () => {
    const filePath = join(SESSIONS_DIR, '2026-04-25-session-1-task-1.10.md');
    const parser = makeParser();
    const result: SessionLogSummary = await parser.parse(filePath);
    const exp = expectations['2026-04-25-session-1-task-1.10.md'];

    expect(result.completed.length).toBeGreaterThanOrEqual(exp.completedMin!);
    expect(result.decisions.length).toBeGreaterThanOrEqual(exp.decisionsMin!);
    expect(result.nextSessionPickup).not.toBeNull();
    expect(result.missingSections).toContain('pending');
    expect(result.sessionDate).toBe(exp.sessionDate);
    expect(result.sessionNumber).toBe(exp.sessionNumber);
  });

  // G4: session-1 (2026-04-24) — "What Got Done" alias + H3 sub-headings
  it('G4: session-1 (2026-04-24) — "What Got Done" alias; H3 sub-headings do not split items', async () => {
    const filePath = join(SESSIONS_DIR, '2026-04-24-session-1.md');
    const parser = makeParser();
    const result: SessionLogSummary = await parser.parse(filePath);
    const exp = expectations['2026-04-24-session-1.md'];

    // "What Got Done" should be classified as completed
    expect(result.completed.length).toBeGreaterThanOrEqual(exp.completedMin!);
    expect(result.nextSessionPickup).not.toBeNull();
    expect(result.nextSessionPickup).toContain(exp.pickupContains!);
    expect(result.missingSections).toContain('pending');
    expect(result.sessionDate).toBe(exp.sessionDate);
    expect(result.sessionNumber).toBe(exp.sessionNumber);
    // "Key Decisions" is NOT a recognized alias → decisions section missing
    expect(result.missingSections).toContain('decisions');
  });

  // G5: session-13 — larger log; size sanity check
  it('G5: session-13 (task-2.9) — ≥8 completed, ≥1 decisions, has pickup', async () => {
    const filePath = join(SESSIONS_DIR, '2026-04-25-session-13-task-2.9.md');
    const parser = makeParser();
    const result: SessionLogSummary = await parser.parse(filePath);
    const exp = expectations['2026-04-25-session-13-task-2.9.md'];

    expect(result.completed.length).toBeGreaterThanOrEqual(exp.completedMin!);
    expect(result.decisions.length).toBeGreaterThanOrEqual(exp.decisionsMin!);
    expect(result.nextSessionPickup).not.toBeNull();
    expect(result.missingSections).toContain('pending');
    expect(result.sessionDate).toBe(exp.sessionDate);
    expect(result.sessionNumber).toBe(exp.sessionNumber);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SYNTHETIC EDGE-CASE TESTS (B.2)
// ─────────────────────────────────────────────────────────────────────────────

describe('SessionLogParser — Synthetic edge fixtures (B.2)', () => {
  // S1: missing-pickup.md
  it('S1: missing-pickup.md — nextSessionPickup is null; next_session_pickup in missingSections', async () => {
    const filePath = join(SYNTHETIC_DIR, 'missing-pickup.md');
    const parser = makeParser();
    const result: SessionLogSummary = await parser.parse(filePath);

    expect(result.nextSessionPickup).toBeNull();
    expect(result.missingSections).toContain('next_session_pickup');
    // The other three sections are present
    expect(result.completed.length).toBeGreaterThan(0);
    expect(result.pending.length).toBeGreaterThan(0);
    expect(result.decisions.length).toBeGreaterThan(0);
    expect(result.missingSections).not.toContain('completed');
    expect(result.missingSections).not.toContain('pending');
    expect(result.missingSections).not.toContain('decisions');
  });

  // S2: nonstandard-headings.md — H3 sections ignored
  it('S2: nonstandard-headings.md — H3 sections not recognised; all four missingSections raised', async () => {
    const filePath = join(SYNTHETIC_DIR, 'nonstandard-headings.md');
    const parser = makeParser();
    const result: SessionLogSummary = await parser.parse(filePath);

    expect(result.completed.length).toBe(0);
    expect(result.pending.length).toBe(0);
    expect(result.decisions.length).toBe(0);
    expect(result.nextSessionPickup).toBeNull();
    expect(result.missingSections).toContain('completed');
    expect(result.missingSections).toContain('pending');
    expect(result.missingSections).toContain('decisions');
    expect(result.missingSections).toContain('next_session_pickup');
  });

  // S3: empty.md — 0-byte file
  it('S3: empty.md — all empty arrays; all four sections missing; no throw', async () => {
    const filePath = join(SYNTHETIC_DIR, 'empty.md');
    const parser = makeParser();
    const result: SessionLogSummary = await parser.parse(filePath);

    expect(result.completed.length).toBe(0);
    expect(result.pending.length).toBe(0);
    expect(result.decisions.length).toBe(0);
    expect(result.nextSessionPickup).toBeNull();
    expect(result.missingSections).toEqual(
      expect.arrayContaining(['completed', 'pending', 'decisions', 'next_session_pickup']),
    );
    expect(result.missingSections.length).toBe(4);
  });

  // S4: code-block-trap.md — list items inside fences not extracted
  it('S4: code-block-trap.md — list items inside ``` fences are NOT extracted', async () => {
    const filePath = join(SYNTHETIC_DIR, 'code-block-trap.md');
    const parser = makeParser();
    const result: SessionLogSummary = await parser.parse(filePath);

    // Only 3 real tasks (A, B, C) should be captured; fake tasks inside fence are NOT
    expect(result.completed.length).toBe(3);

    const titles = result.completed.map((t) => t.title);
    expect(titles.some((t) => t.toLowerCase().includes('fake'))).toBe(false);
    expect(titles.some((t) => t.toLowerCase().includes('real task a'))).toBe(true);
    expect(titles.some((t) => t.toLowerCase().includes('real task b'))).toBe(true);
    expect(titles.some((t) => t.toLowerCase().includes('real task c'))).toBe(true);
  });

  // S5: huge-50kb.md — performance assertion < 100ms
  it('S5: huge-50kb.md — parses in < 100ms; correct item counts', async () => {
    const filePath = HUGE_PATH;
    const parser = makeParser();

    const start = Date.now();
    const result: SessionLogSummary = await parser.parse(filePath);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(100);
    expect(result.completed.length).toBe(hugeFixtureStats.completedCount);
    expect(result.pending.length).toBe(hugeFixtureStats.pendingCount);
    expect(result.decisions.length).toBe(hugeFixtureStats.decisionsCount);
  });

  // S6: binary-fence.md — null bytes in fence do not crash
  it('S6: binary-fence.md — parser does not crash; items outside fence extracted', async () => {
    const filePath = join(SYNTHETIC_DIR, 'binary-fence.md');
    const parser = makeParser();

    // Must not throw
    const result: SessionLogSummary = await parser.parse(filePath);

    // 2 tasks outside the fence should be extracted
    expect(result.completed.length).toBe(2);
    expect(result.nextSessionPickup).not.toBeNull();
  });

  // S7: crlf-line-endings.md — identical extraction to missing-pickup.md
  it('S7: crlf-line-endings.md — CRLF normalisation yields identical extraction to LF version', async () => {
    const lfParser = makeParser();
    const crlfParser = makeParser();

    const lfResult = await lfParser.parse(join(SYNTHETIC_DIR, 'missing-pickup.md'));
    const crlfResult = await crlfParser.parse(join(SYNTHETIC_DIR, 'crlf-line-endings.md'));

    // Core counts and content should match (file paths differ, sessionDate/sessionNumber may differ)
    expect(crlfResult.completed.length).toBe(lfResult.completed.length);
    expect(crlfResult.pending.length).toBe(lfResult.pending.length);
    expect(crlfResult.decisions.length).toBe(lfResult.decisions.length);
    expect(crlfResult.nextSessionPickup).toBe(lfResult.nextSessionPickup);

    // Section detection matches
    const lfMissingSet = new Set(lfResult.missingSections);
    const crlfMissingSet = new Set(crlfResult.missingSections);
    expect(crlfMissingSet).toEqual(lfMissingSet);
  });

  // S8: over-256kb.md — throws LOG_TOO_LARGE
  it('S8: over-256kb.md — throws HandoffBuilderError with code LOG_TOO_LARGE', async () => {
    const filePath = OVER256_PATH;
    const parser = makeParser();

    await expect(parser.parse(filePath)).rejects.toMatchObject({
      code: 'LOG_TOO_LARGE',
    });
    await expect(parser.parse(filePath)).rejects.toBeInstanceOf(HandoffBuilderError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ADDITIONAL TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe('SessionLogParser — Additional tests', () => {
  // A1: LOG_READ_FAILED — mock IFsReader throws ENOENT
  it('A1: LOG_READ_FAILED — stat throws; parser wraps as HandoffBuilderError', async () => {
    const enoentErr = Object.assign(new Error('ENOENT: no such file'), {
      code: 'ENOENT',
    });
    const mockFs: IFsReader = {
      stat: () => Promise.reject(enoentErr),
      readFile: () => Promise.reject(enoentErr),
    };
    const parser = makeParser(mockFs);

    await expect(parser.parse('/nonexistent/session.md')).rejects.toMatchObject({
      code: 'LOG_READ_FAILED',
    });
    await expect(parser.parse('/nonexistent/session.md')).rejects.toBeInstanceOf(
      HandoffBuilderError,
    );
  });

  // A2: readFile throws (stat returns size in range but readFile fails)
  it('A2: LOG_READ_FAILED — readFile throws; parser wraps as HandoffBuilderError', async () => {
    const mockFs: IFsReader = {
      stat: () => Promise.resolve({ size: 100 }),
      readFile: () => Promise.reject(new Error('Permission denied')),
    };
    const parser = makeParser(mockFs);

    await expect(parser.parse('/some/file.md')).rejects.toMatchObject({
      code: 'LOG_READ_FAILED',
    });
  });

  // A3: Section alias coverage — "Outstanding" maps to pending
  it('A3: section alias "Outstanding" is recognised as pending', async () => {
    const content = `# Test\n\n## Outstanding\n- Item A\n- Item B\n`;
    const mockFs: IFsReader = {
      stat: () => Promise.resolve({ size: Buffer.byteLength(content, 'utf-8') }),
      readFile: () => Promise.resolve(content),
    };
    const parser = makeParser(mockFs);
    const result = await parser.parse('/fake/path.md');

    expect(result.pending.length).toBe(2);
    expect(result.missingSections).not.toContain('pending');
  });

  // A4: BOM stripping
  it('A4: BOM at start of file is stripped before parsing', async () => {
    const content = '﻿# Test\n\n## Accomplished\n- Task A\n';
    const mockFs: IFsReader = {
      stat: () => Promise.resolve({ size: Buffer.byteLength(content, 'utf-8') }),
      readFile: () => Promise.resolve(content),
    };
    const parser = makeParser(mockFs);
    const result = await parser.parse('/fake/bom-file.md');

    // Should parse without throwing; completed has 1 item
    expect(result.completed.length).toBe(1);
  });

  // A5: HTML comment stripping
  it('A5: HTML comments are stripped before parsing', async () => {
    const content = [
      '# Test',
      '',
      '<!-- This comment contains a fake ## Accomplished section -->',
      '',
      '## Accomplished',
      '- Real task A',
      '<!-- - Fake task inside comment -->',
      '- Real task B',
    ].join('\n');
    const mockFs: IFsReader = {
      stat: () => Promise.resolve({ size: Buffer.byteLength(content, 'utf-8') }),
      readFile: () => Promise.resolve(content),
    };
    const parser = makeParser(mockFs);
    const result = await parser.parse('/fake/comment-file.md');

    expect(result.completed.length).toBe(2);
    expect(result.completed.map((t) => t.title).some((t) => t.includes('Fake'))).toBe(false);
  });

  // A6: Filename metadata parsing
  it('A6: sessionDate and sessionNumber are extracted from filename', async () => {
    const content = '# Test\n\n## Accomplished\n- Task\n';
    const mockFs: IFsReader = {
      stat: () => Promise.resolve({ size: Buffer.byteLength(content, 'utf-8') }),
      readFile: () => Promise.resolve(content),
    };
    const parser = makeParser(mockFs);
    const result = await parser.parse('/logs/2026-04-25-session-42-task-1.5.md');

    expect(result.sessionDate).toBe('2026-04-25');
    expect(result.sessionNumber).toBe(42);
  });

  // A7: No filename match yields undefined metadata
  it('A7: missing date/session in filename → sessionDate and sessionNumber are undefined', async () => {
    const content = '# Test\n\n## Accomplished\n- Task\n';
    const mockFs: IFsReader = {
      stat: () => Promise.resolve({ size: Buffer.byteLength(content, 'utf-8') }),
      readFile: () => Promise.resolve(content),
    };
    const parser = makeParser(mockFs);
    const result = await parser.parse('/logs/notes.md');

    expect(result.sessionDate).toBeUndefined();
    expect(result.sessionNumber).toBeUndefined();
  });

  // A8: Trailing colon in heading stripped
  it('A8: heading with trailing colon (e.g. "## Accomplished:") is still recognised', async () => {
    const content = '# Test\n\n## Accomplished:\n- Task A\n- Task B\n';
    const mockFs: IFsReader = {
      stat: () => Promise.resolve({ size: Buffer.byteLength(content, 'utf-8') }),
      readFile: () => Promise.resolve(content),
    };
    const parser = makeParser(mockFs);
    const result = await parser.parse('/fake/path.md');

    expect(result.completed.length).toBe(2);
    expect(result.missingSections).not.toContain('completed');
  });

  // A9: Tilde fence (~~~) is also treated as code fence
  it('A9: tilde fences (~~~) skip enclosed list items', async () => {
    const content = [
      '# Test',
      '',
      '## Accomplished',
      '- Real task outside fence',
      '',
      '~~~',
      '- Fake task inside tilde fence',
      '~~~',
      '',
      '- Another real task',
    ].join('\n');
    const mockFs: IFsReader = {
      stat: () => Promise.resolve({ size: Buffer.byteLength(content, 'utf-8') }),
      readFile: () => Promise.resolve(content),
    };
    const parser = makeParser(mockFs);
    const result = await parser.parse('/fake/path.md');

    expect(result.completed.length).toBe(2);
    expect(result.completed.map((t) => t.title).some((t) => t.includes('Fake'))).toBe(false);
  });

  // A10: LOG_TOO_LARGE thrown when stat reports > 256KB even if readFile would succeed
  it('A10: LOG_TOO_LARGE thrown when stat.size > 256KB', async () => {
    const mockFs: IFsReader = {
      stat: () => Promise.resolve({ size: 256 * 1024 + 1 }),
      readFile: () => Promise.resolve('# test'),
    };
    const parser = makeParser(mockFs);

    await expect(parser.parse('/fake/large.md')).rejects.toMatchObject({
      code: 'LOG_TOO_LARGE',
    });
  });

  // A11: "To-Do" alias for pending section
  it('A11: "To-Do" heading alias is recognised as pending section', async () => {
    const content = '# Test\n\n## To-Do\n- Item X\n- Item Y\n';
    const mockFs: IFsReader = {
      stat: () => Promise.resolve({ size: Buffer.byteLength(content, 'utf-8') }),
      readFile: () => Promise.resolve(content),
    };
    const parser = makeParser(mockFs);
    const result = await parser.parse('/fake/path.md');

    expect(result.pending.length).toBe(2);
    expect(result.missingSections).not.toContain('pending');
  });
});
