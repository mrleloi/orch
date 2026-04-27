/**
 * types.spec.ts — compile-time and runtime shape tests for handoff DTOs.
 *
 * Purpose (3.5.a acceptance criteria):
 *  - Verify that all exported types have the expected fields via Object.keys
 *    on sample literals — catches accidental field removal at the type level.
 *  - Verify constants are the correct numeric values per Part A.3.
 *  - Verify HandoffBuilderError constructor sets code + message + cause correctly.
 *
 * No network I/O. No NestJS bootstrap. Pure value checks.
 */

import {
  HANDOFF_MAX_TOKENS,
  HANDOFF_CHARS_PER_TOKEN,
  HANDOFF_MAX_CHARS,
  HandoffBuilderError,
  IHANDOFF_BUILDER,
  EXECA_TOKEN,
  FS_TOKEN,
  LOGGER_TOKEN,
} from './types.js';
import type {
  FileDiffRecord,
  GitDiffSummary,
  SessionTaskRecord,
  SessionDecisionRecord,
  SessionLogSummary,
  HandoffContext,
  RenderedPrompt,
  HandoffBuildInput,
  TruncationAction,
} from './types.js';

// ── Constant sanity checks ────────────────────────────────────────────────────

describe('Handoff constants', () => {
  it('HANDOFF_MAX_TOKENS is 5000', () => {
    expect(HANDOFF_MAX_TOKENS).toBe(5000);
  });

  it('HANDOFF_CHARS_PER_TOKEN is 4', () => {
    expect(HANDOFF_CHARS_PER_TOKEN).toBe(4);
  });

  it('HANDOFF_MAX_CHARS is HANDOFF_MAX_TOKENS * HANDOFF_CHARS_PER_TOKEN', () => {
    expect(HANDOFF_MAX_CHARS).toBe(HANDOFF_MAX_TOKENS * HANDOFF_CHARS_PER_TOKEN);
    expect(HANDOFF_MAX_CHARS).toBe(20000);
  });
});

// ── DI token smoke checks ─────────────────────────────────────────────────────

describe('DI tokens', () => {
  it('all tokens are unique symbols', () => {
    const tokens = [IHANDOFF_BUILDER, EXECA_TOKEN, FS_TOKEN, LOGGER_TOKEN];
    const set = new Set(tokens);
    expect(set.size).toBe(tokens.length);
  });

  it('tokens are symbols (not strings or numbers)', () => {
    expect(typeof IHANDOFF_BUILDER).toBe('symbol');
    expect(typeof EXECA_TOKEN).toBe('symbol');
    expect(typeof FS_TOKEN).toBe('symbol');
    expect(typeof LOGGER_TOKEN).toBe('symbol');
  });
});

// ── DTO shape checks via object literals ──────────────────────────────────────

describe('FileDiffRecord shape', () => {
  it('sample literal has all required fields', () => {
    const record: FileDiffRecord = {
      path: 'src/foo.ts',
      insertions: 10,
      deletions: 5,
      binary: false,
    };
    expect(Object.keys(record)).toEqual(
      expect.arrayContaining(['path', 'insertions', 'deletions', 'binary']),
    );
  });
});

describe('GitDiffSummary shape', () => {
  it('sample literal has all required fields', () => {
    const summary: GitDiffSummary = {
      fromRef: 'abc1234',
      toRef: 'def5678',
      files: [],
      totalInsertions: 0,
      totalDeletions: 0,
      degraded: false,
    };
    expect(Object.keys(summary)).toEqual(
      expect.arrayContaining([
        'fromRef',
        'toRef',
        'files',
        'totalInsertions',
        'totalDeletions',
        'degraded',
      ]),
    );
  });

  it('degraded summary includes degradedReason field', () => {
    const degraded: GitDiffSummary = {
      fromRef: '',
      toRef: '',
      files: [],
      totalInsertions: 0,
      totalDeletions: 0,
      degraded: true,
      degradedReason: 'git not available',
    };
    expect(degraded.degradedReason).toBe('git not available');
  });
});

describe('SessionTaskRecord shape', () => {
  it('sample literal has title and detail', () => {
    const task: SessionTaskRecord = {
      title: 'Implement collector',
      detail: 'Full implementation of git diff wrapper',
    };
    expect(Object.keys(task)).toEqual(
      expect.arrayContaining(['title', 'detail']),
    );
  });
});

describe('SessionDecisionRecord shape', () => {
  it('optional id field is accepted', () => {
    const withId: SessionDecisionRecord = {
      id: '006',
      title: 'No LLM in handoff',
      detail: 'Binding decision — see decisions/006-handoff-no-llm.md',
    };
    const withoutId: SessionDecisionRecord = {
      title: 'Use regex parser',
      detail: 'Deterministic state machine',
    };
    expect(withId.id).toBe('006');
    expect(withoutId.id).toBeUndefined();
  });
});

describe('SessionLogSummary shape', () => {
  it('sample literal has all required fields including missingSections', () => {
    const summary: SessionLogSummary = {
      filePath: '/agent-workspace/memory/sessions/2026-04-25-session-1.md',
      completed: [],
      pending: [],
      decisions: [],
      nextSessionPickup: null,
      missingSections: ['next_session_pickup'],
    };
    expect(Object.keys(summary)).toEqual(
      expect.arrayContaining([
        'filePath',
        'completed',
        'pending',
        'decisions',
        'nextSessionPickup',
        'missingSections',
      ]),
    );
    expect(summary.missingSections).toContain('next_session_pickup');
  });
});

describe('HandoffContext shape', () => {
  it('sample literal has all required fields', () => {
    const gitDiff: GitDiffSummary = {
      fromRef: 'a',
      toRef: 'b',
      files: [],
      totalInsertions: 0,
      totalDeletions: 0,
      degraded: false,
    };
    const ctx: HandoffContext = {
      sessionId: 'sess-001',
      projectId: 'proj-001',
      endedAt: '2026-04-25T12:00:00.000Z',
      endedReason: 'CONTEXT_FULL',
      gitDiff,
      logSummary: null,
      degraded: false,
      degradedReasons: [],
    };
    expect(Object.keys(ctx)).toEqual(
      expect.arrayContaining([
        'sessionId',
        'projectId',
        'endedAt',
        'endedReason',
        'gitDiff',
        'logSummary',
        'degraded',
        'degradedReasons',
      ]),
    );
  });

  it('endedReason discriminated union accepts all four values', () => {
    const reasons: Array<HandoffContext['endedReason']> = [
      'CONTEXT_FULL',
      'CONTEXT_FULL_FORCED',
      'OPERATOR',
      'ERROR',
    ];
    expect(reasons).toHaveLength(4);
    reasons.forEach((r) => expect(typeof r).toBe('string'));
  });
});

describe('RenderedPrompt shape', () => {
  it('sample literal has all required fields', () => {
    const prompt: RenderedPrompt = {
      text: 'Previous session ended.',
      tokens: 5,
      truncated: false,
      truncationActions: [],
    };
    expect(Object.keys(prompt)).toEqual(
      expect.arrayContaining(['text', 'tokens', 'truncated', 'truncationActions']),
    );
  });
});

describe('TruncationAction discriminated union', () => {
  it('all five kinds are representable', () => {
    const actions: TruncationAction[] = [
      { kind: 'dropped_oldest_decisions', count: 2 },
      { kind: 'dropped_oldest_completed', count: 3 },
      { kind: 'dropped_diff_records', count: 5 },
      { kind: 'shortened_pickup', charsRemoved: 1000 },
      { kind: 'hard_truncated', charsRemoved: 500 },
    ];
    expect(actions).toHaveLength(5);
    expect(actions[0].kind).toBe('dropped_oldest_decisions');
    expect(actions[3].kind).toBe('shortened_pickup');
    expect(actions[4].kind).toBe('hard_truncated');
  });
});

describe('HandoffBuildInput shape', () => {
  it('sample literal has all required fields', () => {
    const input: HandoffBuildInput = {
      sessionId: 'sess-001',
      projectId: 'proj-001',
      repoPath: '/repos/myproject',
      sessionStartCommit: 'abc123',
      sessionEndCommit: 'def456',
      sessionLogPath: null,
      endedAt: '2026-04-25T12:00:00.000Z',
      endedReason: 'CONTEXT_FULL',
    };
    expect(Object.keys(input)).toEqual(
      expect.arrayContaining([
        'sessionId',
        'projectId',
        'repoPath',
        'sessionStartCommit',
        'sessionEndCommit',
        'sessionLogPath',
        'endedAt',
        'endedReason',
      ]),
    );
  });
});

// ── HandoffBuilderError ───────────────────────────────────────────────────────

describe('HandoffBuilderError', () => {
  it('sets code, message, and name correctly', () => {
    const err = new HandoffBuilderError('GIT_NOT_AVAILABLE', 'git not found');
    expect(err.code).toBe('GIT_NOT_AVAILABLE');
    expect(err.message).toBe('git not found');
    expect(err.name).toBe('HandoffBuilderError');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(HandoffBuilderError);
  });

  it('stores cause as unknown (no any)', () => {
    const cause = new Error('inner');
    const err = new HandoffBuilderError('LOG_READ_FAILED', 'read failed', cause);
    expect(err.cause).toBe(cause);
    expect(err.code).toBe('LOG_READ_FAILED');
  });

  it('cause is optional (undefined when not provided)', () => {
    const err = new HandoffBuilderError('LOG_TOO_LARGE', 'file exceeds 256KB');
    expect(err.cause).toBeUndefined();
  });

  it('accepts all five error codes', () => {
    const codes: Array<HandoffBuilderError['code']> = [
      'GIT_NOT_AVAILABLE',
      'GIT_BAD_REVISION',
      'LOG_READ_FAILED',
      'LOG_TOO_LARGE',
      'INVARIANT_VIOLATED',
    ];
    codes.forEach((code) => {
      const err = new HandoffBuilderError(code, `test: ${code}`);
      expect(err.code).toBe(code);
    });
  });
});
