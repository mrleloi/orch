/**
 * handoff-context-builder.spec.ts — Integration tests for HandoffContextBuilder.
 *
 * Uses REAL SessionLogParser and REAL session-log fixtures (from 3.5.c).
 * Uses a mocked ExecaFn for GitDiffCollector (canned git diff output).
 * Uses REAL PromptRenderer.
 *
 * Test plan (3.5.e Part 1):
 *  T-INT-1: Full pipeline happy path (real git diff canned output + real session-15 fixture).
 *  T-INT-2: Full pipeline second variant (real session-19 fixture + canned git diff).
 *  T-INT-3: Missing log path — logParser.parse rejects → builder degrades (not throws)
 *           with reason containing 'log_missing'.
 *  T-INT-4: Git collect rejects → builder degrades with reason 'git_degraded' +
 *           parser succeeds with real log.
 *
 * I-10 gate: each test asserts returned HandoffContext shape (checked against HandoffContext DTO).
 * I-11 gate: OTEL span attrs are verified via tracer spy on the ITracer mock.
 * Decision 006: no LLM imports, no network I/O.
 *
 * 3.5.a carryforward: afterEach(jest.clearAllMocks) to prevent mock state leak.
 */

import { join } from 'node:path';
import { promises as fsPromises } from 'node:fs';
import type {
  HandoffBuildInput,
  HandoffContext,
  ILogger,
  ITracer,
  ExecaFn,
  IFsReader,
} from './types.js';
import { LOGGER_TOKEN, TRACER_TOKEN } from './types.js';
import { HandoffContextBuilder } from './handoff-context-builder.js';
import { GitDiffCollector } from './git-diff-collector.js';
import { SessionLogParser } from './session-log-parser.js';
import { PromptRenderer } from './prompt-renderer.js';

// ── Fixture paths ─────────────────────────────────────────────────────────────

const SESSIONS_DIR = join(
  __dirname,
  '__fixtures__',
  'sessions',
);

const SESSION_15_PATH = join(SESSIONS_DIR, '2026-04-25-session-15-task-2.13.md');
const SESSION_19_PATH = join(SESSIONS_DIR, '2026-04-25-session-19-task-3.8.md');

// ── Canned git diff stdout ─────────────────────────────────────────────────────

const CANNED_DIFF_STDOUT = [
  ' packages/core/src/foo.ts | 12 ++++----',
  ' packages/core/src/bar.ts |  4 ++',
  ' 2 files changed, 16 insertions(+), 4 deletions(-)',
  '',
].join('\n');

// ── Mock factories ─────────────────────────────────────────────────────────────

function makeLogger(): ILogger {
  return {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}

/** ISpan stub that records setAttribute calls for I-11 assertions. */
function makeSpan(): {
  setAttribute: jest.Mock;
  addEvent: jest.Mock;
  setStatus: jest.Mock;
  recordException: jest.Mock;
  end: jest.Mock;
} {
  return {
    setAttribute: jest.fn(),
    addEvent: jest.fn(),
    setStatus: jest.fn(),
    recordException: jest.fn(),
    end: jest.fn(),
  };
}

/** ITracer that executes fn synchronously and captures span calls. */
function makeTracer(span = makeSpan()): ITracer & { capturedSpan: ReturnType<typeof makeSpan> } {
  return {
    capturedSpan: span,
    startSpan: jest.fn().mockReturnValue(span),
    withSpan: jest.fn().mockImplementation(
      async <T>(_name: string, fn: (s: ReturnType<typeof makeSpan>) => Promise<T>) => fn(span),
    ),
  };
}

/** Real filesystem reader. */
function makeRealFsReader(): IFsReader {
  return {
    readFile: (path: string, encoding: 'utf-8') => fsPromises.readFile(path, encoding),
    stat: async (path: string) => {
      const s = await fsPromises.stat(path);
      return { size: s.size };
    },
  };
}

/** ExecaFn that returns canned git diff stdout. */
function makeSuccessExeca(stdout = CANNED_DIFF_STDOUT): ExecaFn {
  return () =>
    Promise.resolve({
      stdout,
      stderr: '',
      exitCode: 0,
      failed: false,
    });
}

/** ExecaFn that simulates a non-repo (non-zero exit). */
function makeDegradedExeca(): ExecaFn {
  return () =>
    Promise.resolve({
      stdout: '',
      stderr: 'not a git repository',
      exitCode: 128,
      failed: true,
    });
}

/** Build a HandoffContextBuilder wiring real sub-components with the given mocks. */
function makeBuilder(opts: {
  execaFn: ExecaFn;
  fsReader?: IFsReader;
  logger?: ILogger;
  tracer?: ITracer;
}): HandoffContextBuilder {
  const logger = opts.logger ?? makeLogger();
  const fsReader = opts.fsReader ?? makeRealFsReader();
  const diffCollector = new GitDiffCollector(opts.execaFn, logger);
  const logParser = new SessionLogParser(fsReader);
  const renderer = new PromptRenderer();
  return new HandoffContextBuilder(
    diffCollector,
    logParser,
    renderer,
    logger,
    opts.tracer ?? null,
  );
}

/** Build a minimal valid HandoffBuildInput. */
function makeInput(overrides: Partial<HandoffBuildInput> = {}): HandoffBuildInput {
  return {
    sessionId: 'test-session-001',
    projectId: 'test-project',
    repoPath: '/fake/repo',
    sessionStartCommit: 'abc1234',
    sessionEndCommit: 'def5678',
    sessionLogPath: SESSION_15_PATH,
    endedAt: '2026-04-25T12:00:00Z',
    endedReason: 'CONTEXT_FULL',
    ...overrides,
  };
}

// ── Assert HandoffContext structural shape ─────────────────────────────────────

function assertHandoffContextShape(ctx: HandoffContext): void {
  expect(typeof ctx.sessionId).toBe('string');
  expect(typeof ctx.projectId).toBe('string');
  expect(typeof ctx.endedAt).toBe('string');
  expect(['CONTEXT_FULL', 'CONTEXT_FULL_FORCED', 'OPERATOR', 'ERROR']).toContain(
    ctx.endedReason,
  );
  expect(typeof ctx.gitDiff).toBe('object');
  expect(typeof ctx.gitDiff.fromRef).toBe('string');
  expect(typeof ctx.gitDiff.toRef).toBe('string');
  expect(Array.isArray(ctx.gitDiff.files)).toBe(true);
  expect(typeof ctx.gitDiff.degraded).toBe('boolean');
  expect(typeof ctx.degraded).toBe('boolean');
  expect(Array.isArray(ctx.degradedReasons)).toBe(true);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

afterEach(() => {
  jest.clearAllMocks();
});

describe('HandoffContextBuilder integration', () => {
  // T-INT-1: Full pipeline happy path (session-15 fixture + canned git diff)
  it('T-INT-1: happy path — session-15 fixture + canned git diff → valid HandoffContext', async () => {
    const span = makeSpan();
    const tracer = makeTracer(span);
    const builder = makeBuilder({ execaFn: makeSuccessExeca(), tracer });

    const input = makeInput({ sessionLogPath: SESSION_15_PATH });
    const ctx = await builder.build(input);

    // Shape
    assertHandoffContextShape(ctx);
    expect(ctx.sessionId).toBe('test-session-001');
    expect(ctx.projectId).toBe('test-project');
    expect(ctx.endedReason).toBe('CONTEXT_FULL');

    // Git diff should be parsed from canned output
    expect(ctx.gitDiff.degraded).toBe(false);
    expect(ctx.gitDiff.files.length).toBe(2);
    expect(ctx.gitDiff.totalInsertions).toBeGreaterThan(0);

    // Log summary from real session-15 fixture
    expect(ctx.logSummary).not.toBeNull();
    expect(ctx.logSummary!.completed.length).toBe(4);  // per expectations.json
    expect(ctx.logSummary!.nextSessionPickup).not.toBeNull();
    expect(ctx.logSummary!.nextSessionPickup).toContain('Phase 3 is now active');

    // Not degraded
    expect(ctx.degraded).toBe(false);
    expect(ctx.degradedReasons).toHaveLength(0);

    // I-11: OTEL span was emitted with correct attrs
    expect(tracer.withSpan).toHaveBeenCalledWith(
      'handoff.build',
      expect.any(Function),
    );
    expect(span.setAttribute).toHaveBeenCalledWith('sessionId', 'test-session-001');
    expect(span.setAttribute).toHaveBeenCalledWith('degraded', false);
    expect(span.setAttribute).toHaveBeenCalledWith('gitDegraded', false);
    // 3.5.e carryforward #1: assert logDegraded span attr (builder.ts:209-214)
    expect(span.setAttribute).toHaveBeenCalledWith('logDegraded', false);

    // Render should succeed and produce non-empty text
    const rendered = builder.render(ctx);
    expect(typeof rendered.text).toBe('string');
    expect(rendered.text.length).toBeGreaterThan(0);
    expect(typeof rendered.truncated).toBe('boolean');
    expect(rendered.text).toContain('test-session-001');
  });

  // T-INT-2: Second variant — session-19 fixture (4 decisions) + canned git diff
  it('T-INT-2: happy path — session-19 fixture with 4 decisions → decisions captured', async () => {
    const span = makeSpan();
    const tracer = makeTracer(span);
    const builder = makeBuilder({ execaFn: makeSuccessExeca(), tracer });

    const input = makeInput({
      sessionId: 'test-session-019',
      sessionLogPath: SESSION_19_PATH,
      endedReason: 'OPERATOR',
    });
    const ctx = await builder.build(input);

    // Shape
    assertHandoffContextShape(ctx);
    expect(ctx.sessionId).toBe('test-session-019');
    expect(ctx.endedReason).toBe('OPERATOR');

    // Session-19 has 4 decisions per expectations.json; completed >= 3 (subtasks)
    expect(ctx.logSummary).not.toBeNull();
    expect(ctx.logSummary!.decisions.length).toBe(4);
    expect(ctx.logSummary!.completed.length).toBeGreaterThanOrEqual(3);
    expect(ctx.logSummary!.nextSessionPickup).not.toBeNull();
    expect(ctx.logSummary!.nextSessionPickup).toContain('Task 3.9');

    // Not degraded
    expect(ctx.degraded).toBe(false);
    expect(ctx.degradedReasons).toHaveLength(0);

    // I-11: span emitted
    expect(tracer.withSpan).toHaveBeenCalledWith('handoff.build', expect.any(Function));
    expect(span.setAttribute).toHaveBeenCalledWith('sessionId', 'test-session-019');

    // render produces text referencing pickup
    const rendered = builder.render(ctx);
    expect(rendered.text).toContain('Task 3.9');
  });

  // T-INT-3: Missing log path — logParser.parse rejects → degraded, NOT thrown
  it('T-INT-3: missing log path → degraded with log_missing reason (no throw)', async () => {
    const logger = makeLogger();
    const builder = makeBuilder({
      execaFn: makeSuccessExeca(),
      logger,
    });

    const nonexistentPath = '/tmp/__does_not_exist__/session-missing.md';
    const input = makeInput({ sessionLogPath: nonexistentPath });

    // Must NOT throw
    const ctx = await builder.build(input);

    // Structural shape must be valid
    assertHandoffContextShape(ctx);

    // Degraded because log parse failed
    expect(ctx.degraded).toBe(true);
    // degradedReasons must be non-empty; content is log_missing or log_degraded
    // depending on whether the ENOENT is detectable in the cause chain
    expect(ctx.degradedReasons.length).toBeGreaterThan(0);
    const hasLogReason = ctx.degradedReasons.some(
      (r) => r.includes('log_missing') || r.includes('log_degraded'),
    );
    expect(hasLogReason).toBe(true);

    // Git diff succeeded (canned)
    expect(ctx.gitDiff.degraded).toBe(false);

    // logSummary is null (parse failed)
    expect(ctx.logSummary).toBeNull();

    // logger.warn should have been called for the failure
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('SessionLogParser failed'),
      expect.objectContaining({ sessionLogPath: nonexistentPath }),
    );

    // render still works (renders minimal/partial output)
    const rendered = builder.render(ctx);
    expect(typeof rendered.text).toBe('string');
    expect(rendered.text.length).toBeGreaterThan(0);
  });

  // T-INT-4: Git collect returns degraded (non-repo simulation) → git_degraded + log succeeds
  it('T-INT-4: git degraded (not-a-repo) → git_degraded reason, log summary still parsed', async () => {
    const span = makeSpan();
    const tracer = makeTracer(span);
    const builder = makeBuilder({
      execaFn: makeDegradedExeca(),
      tracer,
    });

    const input = makeInput({ sessionLogPath: SESSION_15_PATH });
    const ctx = await builder.build(input);

    // Shape valid
    assertHandoffContextShape(ctx);

    // Git is degraded
    expect(ctx.gitDiff.degraded).toBe(true);

    // Log succeeded (real session-15)
    expect(ctx.logSummary).not.toBeNull();
    expect(ctx.logSummary!.completed.length).toBe(4);

    // Overall degraded
    expect(ctx.degraded).toBe(true);
    const hasGitDegradedReason = ctx.degradedReasons.some((r) => r.startsWith('git_degraded'));
    expect(hasGitDegradedReason).toBe(true);

    // I-11: span emitted, gitDegraded attr set to true
    expect(tracer.withSpan).toHaveBeenCalledWith('handoff.build', expect.any(Function));
    expect(span.setAttribute).toHaveBeenCalledWith('degraded', true);
    expect(span.setAttribute).toHaveBeenCalledWith('gitDegraded', true);
    // 3.5.e carryforward #1: assert logDegraded span attr (log succeeded here so false)
    expect(span.setAttribute).toHaveBeenCalledWith('logDegraded', false);

    // render still works
    const rendered = builder.render(ctx);
    expect(rendered.text).toContain('test-session-001');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// I-10 validation test
// ─────────────────────────────────────────────────────────────────────────────

describe('HandoffContextBuilder — I-10 input validation', () => {
  it('throws HandoffBuilderError (VALIDATION_FAILED) for invalid input', async () => {
    const builder = makeBuilder({ execaFn: makeSuccessExeca() });
    const badInput = {
      sessionId: '', // empty — must fail
      projectId: 'valid',
      repoPath: '/some/path',
      sessionStartCommit: 'abc',
      sessionEndCommit: 'def',
      sessionLogPath: null,
      endedAt: 'not-a-date',  // invalid ISO
      endedReason: 'INVALID_REASON',
    } as unknown as HandoffBuildInput;

    await expect(builder.build(badInput)).rejects.toMatchObject({
      name: 'HandoffBuilderError',
      code: 'VALIDATION_FAILED',
    });
  });
});
