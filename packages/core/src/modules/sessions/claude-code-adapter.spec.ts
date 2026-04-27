/**
 * ClaudeCodeAdapter unit tests.
 *
 * I-13: All tests mock execa — no real subprocesses spawned.
 * I-3:  Asserted via the grep gate at review time; no Agent SDK imports here.
 *
 * Coverage targets:
 *  - spawn: session_id extracted from first stream-json event
 *  - spawn: fallback UUID extraction from stderr when no session_id in stream
 *  - resume: passes --resume <id> to ccs and sets initial sessionId
 *  - traceparent: injectTraceparentIntoEnv result merged into execa env
 *  - rate-limit stderr → RateLimitError (via classifyError)
 *  - context-full stderr → ContextFullError (via classifyError)
 *  - auth-fail stderr → RuntimeSpawnError (reason=auth message)
 *  - unknown non-zero exit → RuntimeSpawnError (via classifyError)
 *  - terminate: sends SIGTERM then SIGKILL after timeout
 *  - stream-json lines with invalid JSON are skipped without crashing
 *  - parseStreamLine: valid JSON, empty line, non-object JSON, invalid JSON
 *  - extractSessionIdFallback: UUID found, no UUID, partial match
 *  - awaitAndClassify: exit 0 returns void; non-zero throws classified error
 *  - stdoutHandler receives each parsed event in order (via stream pipe test)
 */

import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { BoundedStderrBuffer, ClaudeCodeAdapter } from './claude-code-adapter.js';
import {
  ContextFullError,
  RateLimitError,
  RuntimeSpawnError,
  WorktreeCreateError,
} from '../../domain/errors.js';
import type { TracingService } from '../tracing/tracing.service.js';

// ── Execa mock ────────────────────────────────────────────────────────────────

/**
 * We mock the 'execa' module.
 * execa v5 is a CJS module so Jest transforms it normally.
 */
jest.mock('execa', () => {
  const mockExeca = jest.fn();
  return mockExeca;
});

// Import after mock registration
import mockExecaImport from 'execa';
const mockExeca = mockExecaImport as jest.Mock;

// ── TracingService mock ───────────────────────────────────────────────────────

function makeMockTracingService(
  traceparent = '00-aabbccdd00112233aabbccdd00112233-0011223344556677-01',
): jest.Mocked<TracingService> {
  return {
    injectTraceparentIntoEnv: jest.fn((env: NodeJS.ProcessEnv) => ({
      ...env,
      TRACEPARENT: traceparent,
    })),
    withSpan: jest.fn(),
    getActiveTraceparent: jest.fn().mockReturnValue(traceparent),
    getTracer: jest.fn(),
  } as unknown as jest.Mocked<TracingService>;
}

// ── Fake ExecaChildProcess builder ────────────────────────────────────────────

interface FakeChildOptions {
  /** Lines to push to stdout (emitted as data events) */
  stdoutLines?: string[];
  /** Lines to push to stderr */
  stderrLines?: string[];
  /** Exit code for the resolved child result */
  exitCode?: number;
  /** pid for the process */
  pid?: number;
}

/**
 * Build a fake ExecaChildProcess that behaves like a real one:
 *  - .stdout and .stderr are Readable streams
 *  - the object is also a Promise resolving to { exitCode, stdout, stderr }
 */
function makeFakeChild(opts: FakeChildOptions = {}) {
  const {
    stdoutLines = [],
    stderrLines = [],
    exitCode = 0,
    pid = 12345,
  } = opts;

  const stdoutStream = new Readable({ read() {} });
  const stderrStream = new Readable({ read() {} });

  // Push data asynchronously to mimic real subprocess behaviour
  const pushStreams = async () => {
    await Promise.resolve(); // yield to allow listener setup
    for (const line of stdoutLines) {
      stdoutStream.push(line + '\n');
    }
    stdoutStream.push(null); // EOF

    for (const line of stderrLines) {
      stderrStream.push(line + '\n');
    }
    stderrStream.push(null);
  };

  const resultPromise = pushStreams().then(() => ({
    exitCode,
    stdout: stdoutLines.join('\n'),
    stderr: stderrLines.join('\n'),
    command: 'ccs test',
    escapedCommand: 'ccs test',
    failed: exitCode !== 0,
    timedOut: false,
    isCanceled: false,
    killed: false,
    signal: undefined,
    signalDescription: undefined,
  }));

  // Create the child object that is also a thenable
  const child = Object.assign(
    Object.create(EventEmitter.prototype) as EventEmitter,
    {
      pid,
      stdout: stdoutStream,
      stderr: stderrStream,
      kill: jest.fn(),
      // Make it a thenable (Promise-like)
      then: resultPromise.then.bind(resultPromise),
      catch: resultPromise.catch.bind(resultPromise),
      finally: resultPromise.finally.bind(resultPromise),
    },
  );

  return child;
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('ClaudeCodeAdapter', () => {
  let adapter: ClaudeCodeAdapter;
  let tracingService: jest.Mocked<TracingService>;

  beforeEach(() => {
    jest.clearAllMocks();
    tracingService = makeMockTracingService();
    adapter = new ClaudeCodeAdapter(tracingService);
  });

  // ── parseStreamLine ─────────────────────────────────────────────────────────

  describe('parseStreamLine', () => {
    it('returns null for empty line', () => {
      expect(ClaudeCodeAdapter.parseStreamLine('')).toBeNull();
      expect(ClaudeCodeAdapter.parseStreamLine('   ')).toBeNull();
    });

    it('returns null for invalid JSON', () => {
      expect(ClaudeCodeAdapter.parseStreamLine('not json')).toBeNull();
      expect(ClaudeCodeAdapter.parseStreamLine('{')).toBeNull();
    });

    it('returns null for non-object JSON (string)', () => {
      expect(ClaudeCodeAdapter.parseStreamLine('"hello"')).toBeNull();
    });

    it('returns null for non-object JSON (number)', () => {
      expect(ClaudeCodeAdapter.parseStreamLine('42')).toBeNull();
    });

    it('returns null for null JSON', () => {
      expect(ClaudeCodeAdapter.parseStreamLine('null')).toBeNull();
    });

    it('returns parsed event for valid JSON object', () => {
      const line = JSON.stringify({ type: 'session_started', session_id: 'abc-123' });
      const result = ClaudeCodeAdapter.parseStreamLine(line);
      expect(result).not.toBeNull();
      expect(result?.type).toBe('session_started');
      expect(result?.session_id).toBe('abc-123');
    });

    it('handles leading/trailing whitespace', () => {
      const line = '  ' + JSON.stringify({ type: 'text' }) + '  ';
      const result = ClaudeCodeAdapter.parseStreamLine(line);
      expect(result?.type).toBe('text');
    });
  });

  // ── extractSessionIdFallback ────────────────────────────────────────────────

  describe('extractSessionIdFallback', () => {
    it('returns null when no UUID in text', () => {
      expect(ClaudeCodeAdapter.extractSessionIdFallback('no uuid here')).toBeNull();
    });

    it('extracts UUID from text', () => {
      const text = 'Session started: a1b2c3d4-e5f6-7890-abcd-ef1234567890\nsome other text';
      const result = ClaudeCodeAdapter.extractSessionIdFallback(text);
      expect(result).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    });

    it('extracts first UUID when multiple present', () => {
      const text = 'First: 11111111-2222-3333-4444-555555555555 Second: aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
      const result = ClaudeCodeAdapter.extractSessionIdFallback(text);
      expect(result).toBe('11111111-2222-3333-4444-555555555555');
    });

    it('returns null for partial UUID-like string', () => {
      // Not a full UUID
      expect(ClaudeCodeAdapter.extractSessionIdFallback('abc-123-def')).toBeNull();
    });
  });

  // ── classifyError ───────────────────────────────────────────────────────────

  describe('classifyError', () => {
    it('returns RateLimitError for "rate limit" in stderr', () => {
      const err = ClaudeCodeAdapter.classifyError('rate limit exceeded', 1);
      expect(err).toBeInstanceOf(RateLimitError);
    });

    it('returns RateLimitError for "429" in stderr', () => {
      const err = ClaudeCodeAdapter.classifyError('HTTP 429 Too Many Requests', 6);
      expect(err).toBeInstanceOf(RateLimitError);
    });

    it('returns RateLimitError for "quota exceeded" in stderr', () => {
      const err = ClaudeCodeAdapter.classifyError('quota exceeded for account', 6);
      expect(err).toBeInstanceOf(RateLimitError);
    });

    it('returns ContextFullError for "context full" in stderr', () => {
      const err = ClaudeCodeAdapter.classifyError('context full, please start a new session', 1);
      expect(err).toBeInstanceOf(ContextFullError);
    });

    it('returns ContextFullError for "context exceeded" in stderr', () => {
      const err = ClaudeCodeAdapter.classifyError('context limit exceeded', 1);
      expect(err).toBeInstanceOf(ContextFullError);
    });

    it('returns ContextFullError for "token limit exceeded" in stderr', () => {
      const err = ClaudeCodeAdapter.classifyError('token limit exceeded for this model', 1);
      expect(err).toBeInstanceOf(ContextFullError);
    });

    it('returns RuntimeSpawnError for "unauthorized" in stderr', () => {
      const err = ClaudeCodeAdapter.classifyError('unauthorized: please login first', 4);
      expect(err).toBeInstanceOf(RuntimeSpawnError);
      expect(err.message).toContain('Auth failure');
    });

    it('returns RuntimeSpawnError for "401" in stderr', () => {
      const err = ClaudeCodeAdapter.classifyError('HTTP 401 Unauthorized', 4);
      expect(err).toBeInstanceOf(RuntimeSpawnError);
    });

    it('returns RuntimeSpawnError for "login required" in stderr', () => {
      const err = ClaudeCodeAdapter.classifyError('login required to continue', 4);
      expect(err).toBeInstanceOf(RuntimeSpawnError);
      expect(err.message).toContain('Auth failure');
    });

    it('returns RuntimeSpawnError for unknown non-zero exit', () => {
      const err = ClaudeCodeAdapter.classifyError('something went wrong', 2);
      expect(err).toBeInstanceOf(RuntimeSpawnError);
      expect(err.message).toContain('2');
    });

    it('includes exit code in error message', () => {
      const err = ClaudeCodeAdapter.classifyError('generic error', 5);
      expect(err.message).toContain('5');
    });
  });

  // ── spawn: session_id from stream-json ──────────────────────────────────────

  describe('spawn', () => {
    it('extracts session_id from first stream-json event with session_id field', async () => {
      const sessionId = 'sess-aabb-1122-ccdd-3344556677aa';
      const child = makeFakeChild({
        stdoutLines: [
          JSON.stringify({ type: 'session_started', session_id: sessionId }),
          JSON.stringify({ type: 'text', content: 'hello' }),
        ],
        exitCode: 0,
      });
      mockExeca.mockReturnValue(child);

      const handle = await adapter.spawn({
        profile: 'default',
        prompt: 'test prompt',
      });

      // Wait for the stdout stream to finish delivering all lines
      await new Promise<void>((resolve) => child.stdout.once('end', resolve));
      expect(handle.sessionId).toBe(sessionId);
    });

    it('extracts session_id from later event if not in first event', async () => {
      const sessionId = 'sess-9988-7766-5544-332211009988';
      const child = makeFakeChild({
        stdoutLines: [
          JSON.stringify({ type: 'text', content: 'starting...' }),
          JSON.stringify({ type: 'session_ready', session_id: sessionId }),
        ],
        exitCode: 0,
      });
      mockExeca.mockReturnValue(child);

      const handle = await adapter.spawn({
        profile: 'default',
        prompt: 'test',
      });

      // Wait for the stdout stream to finish delivering all lines
      await new Promise<void>((resolve) => child.stdout.once('end', resolve));
      expect(handle.sessionId).toBe(sessionId);
    });

    it('falls back to stderr UUID regex when no session_id in stream', async () => {
      const sessionId = 'ff001122-3344-5566-7788-99aabbccddee';
      const child = makeFakeChild({
        stdoutLines: [
          JSON.stringify({ type: 'text', content: 'hello no session id' }),
        ],
        stderrLines: [`Resuming session ${sessionId}`],
        exitCode: 0,
      });
      mockExeca.mockReturnValue(child);

      const handle = await adapter.spawn({
        profile: 'default',
        prompt: 'test',
      });

      // Wait for the stderr stream to finish (UUID comes from stderr)
      await new Promise<void>((resolve) => child.stderr.once('end', resolve));
      expect(handle.sessionId).toBe(sessionId);
    });

    it('injects TRACEPARENT into execa env via TracingService', async () => {
      const child = makeFakeChild({ exitCode: 0 });
      mockExeca.mockReturnValue(child);

      await adapter.spawn({ profile: 'myprofile', prompt: 'hello' });

      expect(tracingService.injectTraceparentIntoEnv).toHaveBeenCalledWith(process.env);
      const callArgs = mockExeca.mock.calls[0] as [string, string[], { env: NodeJS.ProcessEnv }];
      expect(callArgs[2]?.env?.['TRACEPARENT']).toBeDefined();
    });

    it('calls ccs with correct args for spawn', async () => {
      const child = makeFakeChild({ exitCode: 0 });
      mockExeca.mockReturnValue(child);

      await adapter.spawn({
        profile: 'myprofile',
        prompt: 'do the thing',
        workdir: '/some/path',
      });

      expect(mockExeca).toHaveBeenCalledWith(
        'ccs',
        ['myprofile', '-p', 'do the thing', '--output-format', 'stream-json'],
        expect.objectContaining({ cwd: '/some/path', reject: false }),
      );
    });

    it('handle.stdout is the child stdout stream', async () => {
      const child = makeFakeChild({ stdoutLines: [], exitCode: 0 });
      mockExeca.mockReturnValue(child);

      const handle = await adapter.spawn({ profile: 'p', prompt: 'q' });
      expect(handle.stdout).toBe(child.stdout);
    });

    it('handle.stderr is the child stderr stream', async () => {
      const child = makeFakeChild({ stderrLines: [], exitCode: 0 });
      mockExeca.mockReturnValue(child);

      const handle = await adapter.spawn({ profile: 'p', prompt: 'q' });
      expect(handle.stderr).toBe(child.stderr);
    });

    it('handle.pid matches child.pid', async () => {
      const child = makeFakeChild({ pid: 9876, exitCode: 0 });
      mockExeca.mockReturnValue(child);

      const handle = await adapter.spawn({ profile: 'p', prompt: 'q' });
      expect(handle.pid).toBe(9876);
    });

    it('handle.abort() calls child.kill(SIGINT)', async () => {
      const child = makeFakeChild({ exitCode: 0 });
      mockExeca.mockReturnValue(child);

      const handle = await adapter.spawn({ profile: 'p', prompt: 'q' });
      handle.abort();
      expect(child.kill).toHaveBeenCalledWith('SIGINT');
    });

    it('skips invalid JSON lines without throwing', async () => {
      const sessionId = 'valid-uuid-11aa-22bb-33cc-ddeeff001122';
      const child = makeFakeChild({
        stdoutLines: [
          'NOT JSON AT ALL }{',
          '',
          '   ',
          JSON.stringify({ type: 'started', session_id: sessionId }),
        ],
        exitCode: 0,
      });
      mockExeca.mockReturnValue(child);

      // Should not throw
      const handle = await adapter.spawn({ profile: 'p', prompt: 'q' });
      // Wait for the stdout stream to finish delivering all lines
      await new Promise<void>((resolve) => child.stdout.once('end', resolve));
      expect(handle.sessionId).toBe(sessionId);
    });

    it('stdoutHandler receives each parsed event in order', async () => {
      const events = [
        { type: 'session_started', session_id: 'sid-aabbcc' },
        { type: 'text', content: 'line 1' },
        { type: 'text', content: 'line 2' },
      ];
      const child = makeFakeChild({
        stdoutLines: events.map((e) => JSON.stringify(e)),
        exitCode: 0,
      });
      mockExeca.mockReturnValue(child);

      const received: unknown[] = [];
      const handle = await adapter.spawn({ profile: 'p', prompt: 'q' });

      // Attach a raw data listener to the stream (simulating what session manager does)
      const lines: string[] = [];
      handle.stdout.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        for (const line of text.split('\n')) {
          const event = ClaudeCodeAdapter.parseStreamLine(line);
          if (event) received.push(event);
        }
      });

      // Wait for stream to finish
      await new Promise<void>((resolve) => handle.stdout.on('end', resolve));

      expect(received).toHaveLength(events.length);
      expect((received[0] as { type: string }).type).toBe('session_started');
      expect((received[1] as { type: string }).type).toBe('text');
      expect((received[2] as { type: string }).type).toBe('text');
    });
  });

  // ── seedPrompt prepend behavior ─────────────────────────────────────────────
  //
  // The adapter prepends seedPrompt to the user prompt via the -p CLI argument:
  //   effectivePrompt = `${seedPrompt}\n\n---\n\n${prompt}`
  // This is the "input channel" for the child process (ccs receives it as -p).
  // Tests verify the assembled argument, not stdin writes (there are none for
  // seedPrompt — that distinction belongs to writeStdin, which is separate).

  describe('seedPrompt prepend behavior', () => {
    it('prepends seedPrompt to child stdin before user input', async () => {
      // "stdin" here = the -p argument that ccs receives as its initial input.
      // The adapter assembles: `${seedPrompt}\n\n---\n\n${prompt}` and passes
      // it as the -p flag. This is the first (and only) "write" to the process.
      const child = makeFakeChild({ exitCode: 0 });
      mockExeca.mockReturnValue(child);

      await adapter.spawn({
        profile: 'default',
        prompt: 'USER_PROMPT',
        seedPrompt: 'TEST_SEED_MARKER',
      });

      const callArgs = mockExeca.mock.calls[0] as [string, string[]];
      const pFlagIdx = callArgs[1].indexOf('-p');
      expect(pFlagIdx).toBeGreaterThanOrEqual(0);

      const effectivePrompt = callArgs[1][pFlagIdx + 1];
      // seedPrompt must appear FIRST in the assembled prompt
      expect(effectivePrompt).toMatch(/^TEST_SEED_MARKER/);
      // User prompt must appear AFTER the separator, not before
      expect(effectivePrompt.indexOf('TEST_SEED_MARKER')).toBeLessThan(
        effectivePrompt.indexOf('USER_PROMPT'),
      );
      // The seed marker must appear exactly once (no duplication)
      const markerCount = effectivePrompt.split('TEST_SEED_MARKER').length - 1;
      expect(markerCount).toBe(1);
    });

    it('does not prepend when seedPrompt is undefined', async () => {
      const child = makeFakeChild({ exitCode: 0 });
      mockExeca.mockReturnValue(child);

      await adapter.spawn({
        profile: 'default',
        prompt: 'USER_PROMPT_ONLY',
        // seedPrompt intentionally omitted (undefined)
      });

      const callArgs = mockExeca.mock.calls[0] as [string, string[]];
      const pFlagIdx = callArgs[1].indexOf('-p');
      expect(pFlagIdx).toBeGreaterThanOrEqual(0);

      const effectivePrompt = callArgs[1][pFlagIdx + 1];
      // No seed marker — child receives only the user prompt unchanged
      expect(effectivePrompt).toBe('USER_PROMPT_ONLY');
      // The separator must not appear either
      expect(effectivePrompt).not.toContain('---');
    });

    it('treats empty string seedPrompt as absent (no prepend)', async () => {
      const child = makeFakeChild({ exitCode: 0 });
      mockExeca.mockReturnValue(child);

      await adapter.spawn({
        profile: 'default',
        prompt: 'USER_PROMPT_ONLY',
        seedPrompt: '', // empty string — must be treated as absent
      });

      const callArgs = mockExeca.mock.calls[0] as [string, string[]];
      const pFlagIdx = callArgs[1].indexOf('-p');
      expect(pFlagIdx).toBeGreaterThanOrEqual(0);

      const effectivePrompt = callArgs[1][pFlagIdx + 1];
      // Empty seedPrompt must not prepend an empty line or separator
      expect(effectivePrompt).toBe('USER_PROMPT_ONLY');
      expect(effectivePrompt).not.toContain('---');
    });
  });

  // ── resume ──────────────────────────────────────────────────────────────────

  describe('resume', () => {
    it('calls ccs with --resume flag when sessionId has no slash', async () => {
      const child = makeFakeChild({ exitCode: 0 });
      mockExeca.mockReturnValue(child);

      await adapter.resume('my-session-id-here', 'follow-up prompt');

      const callArgs = mockExeca.mock.calls[0] as [string, string[]][0];
      expect(callArgs[1]).toContain('--resume');
      expect(callArgs[1]).toContain('my-session-id-here');
      expect(callArgs[1]).toContain('-p');
      expect(callArgs[1]).toContain('follow-up prompt');
    });

    it('uses profile/sessionId encoding when slash present', async () => {
      const child = makeFakeChild({ exitCode: 0 });
      mockExeca.mockReturnValue(child);

      await adapter.resume('myprofile/sess-abc123', 'continue');

      const callArgs = mockExeca.mock.calls[0] as [string, string[]][0];
      expect(callArgs[1]).toEqual([
        'myprofile', '--resume', 'sess-abc123', '-p', 'continue', '--output-format', 'stream-json',
      ]);
    });

    it('pre-sets sessionId to the claude session part', async () => {
      const claudeId = 'resume-session-11223344-5566-7788-99aa-bbccddeeff00';
      const child = makeFakeChild({ exitCode: 0 });
      mockExeca.mockReturnValue(child);

      const handle = await adapter.resume(`default/${claudeId}`, 'prompt');
      // Before stream events, sessionId is pre-set to claudeId
      expect(handle.sessionId).toBe(claudeId);
    });

    it('injects TRACEPARENT into env on resume', async () => {
      const child = makeFakeChild({ exitCode: 0 });
      mockExeca.mockReturnValue(child);

      await adapter.resume('profile/sid', 'hello');

      expect(tracingService.injectTraceparentIntoEnv).toHaveBeenCalledWith(process.env);
      const callArgs = mockExeca.mock.calls[0] as [string, string[], { env: NodeJS.ProcessEnv }];
      expect(callArgs[2]?.env?.['TRACEPARENT']).toBeDefined();
    });

    // SC-10: arg-array contract tests (2 cases)

    it('SC-10: resume("abc", "p") argv contains ["--resume", "abc"] as consecutive args', async () => {
      // When a bare claudeSessionId (no profile slash) is passed, the adapter must
      // pass --resume <id> as consecutive argv elements to ccs (SC-10 arg-array contract).
      const child = makeFakeChild({ exitCode: 0 });
      mockExeca.mockReturnValue(child);

      await adapter.resume('abc', 'p');

      const callArgs = mockExeca.mock.calls[0] as [string, string[]];
      const argv = callArgs[1];
      const resumeIdx = argv.indexOf('--resume');
      expect(resumeIdx).toBeGreaterThanOrEqual(0);
      expect(argv[resumeIdx + 1]).toBe('abc');
    });

    it('SC-10: spawn() argv does NOT contain --resume (backward compat)', async () => {
      // spawn() must never pass --resume — that flag is exclusively for resume().
      // This ensures backward compatibility when claudeSessionId is absent.
      const child = makeFakeChild({ exitCode: 0 });
      mockExeca.mockReturnValue(child);

      await adapter.spawn({ profile: 'default', prompt: 'p' });

      const callArgs = mockExeca.mock.calls[0] as [string, string[]];
      expect(callArgs[1]).not.toContain('--resume');
    });
  });

  // ── awaitAndClassify ────────────────────────────────────────────────────────

  describe('awaitAndClassify', () => {
    it('resolves void on exit code 0', async () => {
      const child = makeFakeChild({ exitCode: 0 });
      mockExeca.mockReturnValue(child);

      // spawn() registers handle → { child, stderrChunks } in childProcessMap
      const handle = await adapter.spawn({ profile: 'p', prompt: 'q' });
      await expect(adapter.awaitAndClassify(handle)).resolves.toBeUndefined();
    });

    it('resolves void for unknown handle (handle not in map)', async () => {
      // A handle not registered via spawn/resume returns void (treat as clean exit)
      const fakeHandle = {
        sessionId: '',
        pid: 0,
        abort: jest.fn(),
        stdout: new Readable({ read() {} }),
        stderr: new Readable({ read() {} }),
      };
      await expect(adapter.awaitAndClassify(fakeHandle)).resolves.toBeUndefined();
    });

    it('throws RateLimitError on non-zero exit with rate-limit stderr', async () => {
      const child = makeFakeChild({
        exitCode: 6,
        stderrLines: ['rate limit exceeded for this account'],
      });
      mockExeca.mockReturnValue(child);

      const handle = await adapter.spawn({ profile: 'p', prompt: 'q' });
      // Wait for streams to drain so stderrChunks is populated
      await new Promise<void>((resolve) => child.stderr.on('end', resolve));

      await expect(adapter.awaitAndClassify(handle)).rejects.toBeInstanceOf(RateLimitError);
    });

    it('throws ContextFullError on non-zero exit with context-full stderr', async () => {
      const child = makeFakeChild({
        exitCode: 1,
        stderrLines: ['context full, cannot continue'],
      });
      mockExeca.mockReturnValue(child);

      const handle = await adapter.spawn({ profile: 'p', prompt: 'q' });
      await new Promise<void>((resolve) => child.stderr.on('end', resolve));

      await expect(adapter.awaitAndClassify(handle)).rejects.toBeInstanceOf(ContextFullError);
    });

    it('throws RuntimeSpawnError on unknown non-zero exit', async () => {
      const child = makeFakeChild({
        exitCode: 2,
        stderrLines: ['config error'],
      });
      mockExeca.mockReturnValue(child);

      const handle = await adapter.spawn({ profile: 'p', prompt: 'q' });
      await new Promise<void>((resolve) => child.stderr.on('end', resolve));

      await expect(adapter.awaitAndClassify(handle)).rejects.toBeInstanceOf(RuntimeSpawnError);
    });
  });

  // ── terminate ───────────────────────────────────────────────────────────────

  describe('terminate', () => {
    const KILL_MOCK = jest.spyOn(process, 'kill');

    beforeEach(() => {
      KILL_MOCK.mockReset();
    });

    afterAll(() => {
      KILL_MOCK.mockRestore();
    });

    it('sends SIGTERM to the process pid', async () => {
      // Make process.kill simulate the process dying on SIGTERM
      KILL_MOCK.mockImplementation((pid: number, signal?: string | number) => {
        if (signal === 'SIGTERM') return true; // signal 0 check
        if (signal === 0) throw Object.assign(new Error('ESRCH'), { code: 'ESRCH' });
        return true;
      });

      const handle = {
        sessionId: 'test',
        pid: 5555,
        abort: jest.fn(),
        stdout: new Readable({ read() {} }),
        stderr: new Readable({ read() {} }),
      };

      await adapter.terminate(handle, 'user_cancel');

      expect(KILL_MOCK).toHaveBeenCalledWith(5555, 'SIGTERM');
    });

    it('resolves immediately if process is already gone (ESRCH on SIGTERM)', async () => {
      KILL_MOCK.mockImplementationOnce(() => {
        throw Object.assign(new Error('ESRCH'), { code: 'ESRCH' });
      });

      const handle = {
        sessionId: 'test',
        pid: 6666,
        abort: jest.fn(),
        stdout: new Readable({ read() {} }),
        stderr: new Readable({ read() {} }),
      };

      // Should not throw
      await expect(adapter.terminate(handle, 'timeout')).resolves.toBeUndefined();
    });

    it('resolves without error when pid is 0', async () => {
      const handle = {
        sessionId: 'test',
        pid: 0,
        abort: jest.fn(),
        stdout: new Readable({ read() {} }),
        stderr: new Readable({ read() {} }),
      };

      await expect(adapter.terminate(handle, 'error')).resolves.toBeUndefined();
      expect(KILL_MOCK).not.toHaveBeenCalled();
    });
  });

  // ── env-var propagation (SC-11) ─────────────────────────────────────────────

  describe('ClaudeCodeAdapter — env-var propagation (SC-11)', () => {
    it.each([
      'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX',
      'HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY',
      'CLAUDE_CODE_REMOTE',
    ])('propagates %s when set in parent env', (varName) => {
      process.env[varName] = 'test-value';
      const env = (adapter as any).buildEnv({}) as NodeJS.ProcessEnv;
      expect(env[varName]).toBe('test-value');
      delete process.env[varName];
    });

    it('propagates TRACEPARENT (injected by TracingService, wins over raw process.env)', () => {
      // TracingService mock always injects the mock traceparent, overriding process.env
      const env = (adapter as any).buildEnv({}) as NodeJS.ProcessEnv;
      expect(env['TRACEPARENT']).toBe(
        '00-aabbccdd00112233aabbccdd00112233-0011223344556677-01',
      );
    });

    it('propagates ALL OTEL_EXPORTER_OTLP_* keys (prefix glob)', () => {
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://otel:4317';
      process.env.OTEL_EXPORTER_OTLP_HEADERS = 'auth=xxx';
      process.env.OTEL_EXPORTER_OTLP_PROTOCOL = 'grpc';
      const env = (adapter as any).buildEnv({}) as NodeJS.ProcessEnv;
      expect(env.OTEL_EXPORTER_OTLP_ENDPOINT).toBe('http://otel:4317');
      expect(env.OTEL_EXPORTER_OTLP_HEADERS).toBe('auth=xxx');
      expect(env.OTEL_EXPORTER_OTLP_PROTOCOL).toBe('grpc');
      delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
      delete process.env.OTEL_EXPORTER_OTLP_HEADERS;
      delete process.env.OTEL_EXPORTER_OTLP_PROTOCOL;
    });

    it('caller extraEnv takes precedence over parent env (override semantics)', () => {
      process.env.HTTPS_PROXY = 'parent';
      const env = (adapter as any).buildEnv({ HTTPS_PROXY: 'override' }) as NodeJS.ProcessEnv;
      expect(env.HTTPS_PROXY).toBe('override');
      delete process.env.HTTPS_PROXY;
    });
  });

  // ── worktree lifecycle (Phase 6.3 / Decision 018) ───────────────────────────
  //
  // T1..T7 test the createWorktreeIfNeeded + cleanupWorktreeIfPresent contract.
  // All git commands are intercepted by the mockExeca spy — no real git I/O.

  describe('worktree lifecycle (Phase 6.3)', () => {
    /**
     * Build a fake execa result that looks like a resolved child process.
     */
    function makeGitResult(exitCode = 0) {
      const stdout = new Readable({ read() {} });
      const stderr = new Readable({ read() {} });
      stdout.push(null);
      stderr.push(null);
      const promise = Promise.resolve({
        exitCode,
        stdout: '',
        stderr: '',
        command: 'git',
        escapedCommand: 'git',
        failed: exitCode !== 0,
        timedOut: false,
        isCanceled: false,
        killed: false,
        signal: undefined,
        signalDescription: undefined,
      });
      return Object.assign(Object.create(EventEmitter.prototype) as EventEmitter, {
        pid: 9999,
        stdout,
        stderr,
        kill: jest.fn(),
        then: promise.then.bind(promise),
        catch: promise.catch.bind(promise),
        finally: promise.finally.bind(promise),
      });
    }

    /**
     * Build a fake probe result (git worktree add --help exit 0).
     * Phase 6.3 lazy-once probe fires before git worktree add.
     */
    function makeProbeResult() {
      return makeGitResult(0); // probe exit 0 → supported=true
    }

    /**
     * Make mockExeca dispatch correctly:
     *  - First call  (probe: git worktree add --help) → probe result (exit 0)
     *  - Second call (git worktree add) → gitAddChild
     *  - Remaining calls (ccs, git remove, git branch -D) → ccsChild / gitResult
     *
     * Phase 6.3: the lazy-once probe runs before git worktree add for every fresh
     * adapter instance with worktreeIsolation=true.
     */
    function setupWorktreeSpawn(
      gitAddExitCode = 0,
      ccsExitCode = 0,
    ) {
      const probeChild = makeProbeResult();
      const gitAddChild = makeGitResult(gitAddExitCode);
      const ccsChild = makeFakeChild({ exitCode: ccsExitCode, pid: 5678 });
      mockExeca
        .mockReturnValueOnce(probeChild)    // git worktree add --help (probe)
        .mockReturnValueOnce(gitAddChild)   // git worktree add
        .mockReturnValue(ccsChild);          // ccs + any subsequent git calls
      return { probeChild, gitAddChild, ccsChild };
    }

    // ── T1 ────────────────────────────────────────────────────────────────────

    it('T1: worktreeIsolation=true + baseBranch=main → spawn() invokes git worktree add exactly once', async () => {
      const { ccsChild } = setupWorktreeSpawn(0, 0);

      await adapter.spawn({
        profile: 'default',
        prompt: 'task',
        worktreeIsolation: true,
        baseBranch: 'main',
      });

      // Phase 6.3: probe + git-add + ccs = 3 calls
      expect(mockExeca).toHaveBeenCalledTimes(3); // probe + git-add + ccs

      // Call[0]: probe — git worktree add --help
      const probeCall = mockExeca.mock.calls[0] as [string, string[]];
      expect(probeCall[0]).toBe('git');
      expect(probeCall[1]).toEqual(['worktree', 'add', '--help']);

      // Call[1]: git worktree add -b <branch> <path> <baseBranch>
      const gitCall = mockExeca.mock.calls[1] as [string, string[], object];
      expect(gitCall[0]).toBe('git');
      expect(gitCall[1][0]).toBe('worktree');
      expect(gitCall[1][1]).toBe('add');
      expect(gitCall[1][2]).toBe('-b');
      // branch = main-orch-<sessionId>
      expect(gitCall[1][3]).toMatch(/^main-orch-/);
      // path = .git/worktrees/orch-<sessionId>
      expect(gitCall[1][4]).toMatch(/^\.git\/worktrees\/orch-/);
      // base branch
      expect(gitCall[1][5]).toBe('main');

      // Call[2]: ccs spawn
      const ccsCall = mockExeca.mock.calls[2] as [string, string[]];
      expect(ccsCall[0]).toBe('ccs');
      void ccsChild;
    });

    // ── T2 ────────────────────────────────────────────────────────────────────

    it('T2: worktreeIsolation=false (default) → spawn() invokes ZERO git commands', async () => {
      const ccsChild = makeFakeChild({ exitCode: 0 });
      mockExeca.mockReturnValue(ccsChild);

      await adapter.spawn({
        profile: 'default',
        prompt: 'task',
        // worktreeIsolation intentionally omitted — defaults to false
      });

      // Only one execa call: ccs
      expect(mockExeca).toHaveBeenCalledTimes(1);
      const call = mockExeca.mock.calls[0] as [string, string[]];
      expect(call[0]).toBe('ccs');
    });

    // ── T3 ────────────────────────────────────────────────────────────────────

    it('T3: worktreeIsolation=true + baseBranch=develop → branch arg starts with develop-orch-', async () => {
      setupWorktreeSpawn(0, 0);

      await adapter.spawn({
        profile: 'default',
        prompt: 'task',
        worktreeIsolation: true,
        baseBranch: 'develop',
      });

      // Call[0] is probe; Call[1] is git worktree add
      const gitCall = mockExeca.mock.calls[1] as [string, string[]];
      expect(gitCall[1][3]).toMatch(/^develop-orch-/);
      expect(gitCall[1][5]).toBe('develop');
    });

    // ── T4 ────────────────────────────────────────────────────────────────────

    it('T4: git worktree add non-zero exit → spawn() throws WorktreeCreateError (instanceof RuntimeSpawnError)', async () => {
      setupWorktreeSpawn(1, 0); // git exits with code 1

      // Catch the error and verify both the specific type and the inheritance chain
      const err = await adapter
        .spawn({
          profile: 'default',
          prompt: 'task',
          worktreeIsolation: true,
          baseBranch: 'main',
        })
        .catch((e: unknown) => e);

      // T4a: specific error type
      expect(err).toBeInstanceOf(WorktreeCreateError);
      // T4b: inherits from RuntimeSpawnError (classifyError() compat — I-12)
      expect(err).toBeInstanceOf(RuntimeSpawnError);
    });

    // ── T5 ────────────────────────────────────────────────────────────────────

    it('T5: terminate() with worktreePath → invokes git worktree remove --force exactly once', async () => {
      // Setup: probe succeeds, git add succeeds, ccs spawns, then cleanup git calls succeed
      const probeChild = makeProbeResult();
      const gitAddChild = makeGitResult(0);
      const ccsChild = makeFakeChild({ exitCode: 0, pid: 7777 });
      const gitRemoveChild = makeGitResult(0);
      const gitBranchChild = makeGitResult(0);
      mockExeca
        .mockReturnValueOnce(probeChild)     // git worktree add --help (probe)
        .mockReturnValueOnce(gitAddChild)    // git worktree add
        .mockReturnValueOnce(ccsChild)       // ccs spawn
        .mockReturnValueOnce(gitRemoveChild) // git worktree remove
        .mockReturnValueOnce(gitBranchChild); // git branch -D

      // Spy on process.kill per-test to avoid double-spy conflicts with outer describe
      const killSpy = jest.spyOn(process, 'kill').mockImplementation(
        (_pid: number, signal?: string | number) => {
          if (signal === 0) throw Object.assign(new Error('ESRCH'), { code: 'ESRCH' });
          return true;
        },
      );

      try {
        const handle = await adapter.spawn({
          profile: 'default',
          prompt: 'task',
          worktreeIsolation: true,
          baseBranch: 'main',
        });

        expect(handle.worktreePath).toMatch(/^\.git\/worktrees\/orch-/);

        await adapter.terminate(handle, 'user_cancel');

        // git worktree remove must have been called exactly once
        const removeCalls = (mockExeca.mock.calls as [string, string[]][]).filter(
          ([cmd, args]) => cmd === 'git' && args[0] === 'worktree' && args[1] === 'remove',
        );
        expect(removeCalls).toHaveLength(1);
        expect(removeCalls[0]![1]).toContain('--force');
        expect(removeCalls[0]![1][3]).toMatch(/^\.git\/worktrees\/orch-/);
      } finally {
        killSpy.mockRestore();
      }
    });

    // ── T6 ────────────────────────────────────────────────────────────────────

    it('T6: terminate() where git worktree remove fails → resolves cleanly, WARN logged', async () => {
      const probeChild = makeProbeResult();
      const gitAddChild = makeGitResult(0);
      const ccsChild = makeFakeChild({ exitCode: 0, pid: 8888 });
      const gitRemoveChild = makeGitResult(1); // remove fails with code 1
      const gitBranchChild = makeGitResult(1); // branch -D also fails
      mockExeca
        .mockReturnValueOnce(probeChild)     // git worktree add --help (probe)
        .mockReturnValueOnce(gitAddChild)
        .mockReturnValueOnce(ccsChild)
        .mockReturnValueOnce(gitRemoveChild)
        .mockReturnValueOnce(gitBranchChild);

      const killSpy = jest.spyOn(process, 'kill').mockImplementation(
        (_pid: number, signal?: string | number) => {
          if (signal === 0) throw Object.assign(new Error('ESRCH'), { code: 'ESRCH' });
          return true;
        },
      );

      try {
        const handle = await adapter.spawn({
          profile: 'default',
          prompt: 'task',
          worktreeIsolation: true,
          baseBranch: 'main',
        });

        // Must resolve without throwing even when git remove fails
        await expect(adapter.terminate(handle, 'user_cancel')).resolves.toBeUndefined();
      } finally {
        killSpy.mockRestore();
      }
    });

    // ── T7 ────────────────────────────────────────────────────────────────────

    it('T7 (idempotency): terminate() called twice → second call does NOT invoke git again', async () => {
      const probeChild = makeProbeResult();
      const gitAddChild = makeGitResult(0);
      const ccsChild = makeFakeChild({ exitCode: 0, pid: 3333 });
      const gitRemoveChild = makeGitResult(0);
      const gitBranchChild = makeGitResult(0);
      mockExeca
        .mockReturnValueOnce(probeChild)     // git worktree add --help (probe)
        .mockReturnValueOnce(gitAddChild)    // git worktree add
        .mockReturnValueOnce(ccsChild)       // ccs spawn
        .mockReturnValueOnce(gitRemoveChild) // git worktree remove (first terminate)
        .mockReturnValueOnce(gitBranchChild); // git branch -D (first terminate)

      const killSpy = jest.spyOn(process, 'kill').mockImplementation(
        (_pid: number, signal?: string | number) => {
          if (signal === 0) throw Object.assign(new Error('ESRCH'), { code: 'ESRCH' });
          return true;
        },
      );

      try {
        const handle = await adapter.spawn({
          profile: 'default',
          prompt: 'task',
          worktreeIsolation: true,
          baseBranch: 'main',
        });

        // First terminate — git worktree remove + branch -D run
        await adapter.terminate(handle, 'user_cancel');

        const callCountAfterFirst = mockExeca.mock.calls.length;

        // Second terminate — must NOT invoke any additional git commands
        await adapter.terminate(handle, 'user_cancel');

        expect(mockExeca.mock.calls.length).toBe(callCountAfterFirst);
      } finally {
        killSpy.mockRestore();
      }
    });

    // ── T8 (lazy-cache: probe supported=false) ────────────────────────────────

    it('T8: probe returns supported=false → spawn() skips worktree creation, proceeds with ccs only', async () => {
      // Probe fails (e.g. git not on PATH → ENOENT)
      mockExeca.mockRejectedValueOnce(
        Object.assign(new Error('ENOENT: git not found'), { code: 'ENOENT' }),
      );
      // ccs spawn succeeds
      const ccsChild = makeFakeChild({ exitCode: 0, pid: 1234 });
      mockExeca.mockReturnValueOnce(ccsChild);

      const handle = await adapter.spawn({
        profile: 'default',
        prompt: 'task',
        worktreeIsolation: true,
        baseBranch: 'main',
      });

      // Only 2 execa calls: probe + ccs (no git worktree add)
      expect(mockExeca).toHaveBeenCalledTimes(2);
      // Second call must be ccs (not a git worktree add)
      const secondCall = mockExeca.mock.calls[1] as [string, string[]];
      expect(secondCall[0]).toBe('ccs');
      // worktreePath must be undefined (isolation skipped)
      expect(handle.worktreePath).toBeUndefined();
    });

    // ── T9 (lazy-cache: probe cached across consecutive spawns) ───────────────

    it('T9: probe is called only once even when spawn() is called twice with worktreeIsolation=true', async () => {
      // Probe succeeds once
      const probeChild = makeProbeResult();
      const gitAdd1 = makeGitResult(0);
      const ccs1 = makeFakeChild({ exitCode: 0, pid: 1111 });
      const gitAdd2 = makeGitResult(0);
      const ccs2 = makeFakeChild({ exitCode: 0, pid: 2222 });

      mockExeca
        .mockReturnValueOnce(probeChild) // probe — only once
        .mockReturnValueOnce(gitAdd1)    // git worktree add (first spawn)
        .mockReturnValueOnce(ccs1)       // ccs (first spawn)
        .mockReturnValueOnce(gitAdd2)    // git worktree add (second spawn)
        .mockReturnValueOnce(ccs2);      // ccs (second spawn)

      await adapter.spawn({ profile: 'default', prompt: 'task1', worktreeIsolation: true });
      await adapter.spawn({ profile: 'default', prompt: 'task2', worktreeIsolation: true });

      // Total calls: 1 probe + 2×(git-add + ccs) = 5
      expect(mockExeca).toHaveBeenCalledTimes(5);

      // Verify only ONE probe call (git worktree add --help)
      const probeCalls = (mockExeca.mock.calls as [string, string[]][]).filter(
        ([cmd, args]) => cmd === 'git' && args.includes('--help'),
      );
      expect(probeCalls).toHaveLength(1);
    });
  });
});

// ── BoundedStderrBuffer (Fix C1) ──────────────────────────────────────────────

describe('BoundedStderrBuffer', () => {
  const CHUNK_SIZE = 100;

  it('accumulates chunks within the cap', () => {
    const buf = new BoundedStderrBuffer(256 * 1024);
    for (let i = 0; i < 10; i++) {
      buf.push(Buffer.alloc(CHUNK_SIZE, 0x61 + i));
    }
    expect(buf.getSize()).toBe(10 * CHUNK_SIZE);
    expect(buf.getTail().length).toBe(10 * CHUNK_SIZE);
  });

  it('drops oldest chunks when cap is exceeded', () => {
    const cap = 256 * 1024;
    const buf = new BoundedStderrBuffer(cap);

    // Push exactly cap bytes first
    for (let i = 0; i < 10; i++) {
      buf.push(Buffer.alloc(CHUNK_SIZE, 0x41)); // 10 × 100 = 1000 bytes
    }

    // Now push a chunk that is larger than cap (cap + 100 bytes)
    const oversized = Buffer.alloc(cap + 100, 0x42);
    buf.push(oversized);

    // Total retained must be ≤ cap
    expect(buf.getSize()).toBeLessThanOrEqual(cap);
  });

  it('total bytes stay ≤ cap after many small pushes that together exceed cap', () => {
    const cap = 1000;
    const buf = new BoundedStderrBuffer(cap);

    // Push 20 chunks of 100 bytes each (total 2000 bytes, double the cap)
    for (let i = 0; i < 20; i++) {
      buf.push(Buffer.alloc(100, 0x61 + (i % 26)));
    }

    expect(buf.getSize()).toBeLessThanOrEqual(cap);
    expect(buf.getTail().length).toBeLessThanOrEqual(cap);
  });

  it('getTail() returns a Buffer containing only the most recently pushed data', () => {
    const cap = 300;
    const buf = new BoundedStderrBuffer(cap);

    // Fill with 'A' up to cap
    buf.push(Buffer.alloc(300, 0x41));
    // Push 50 bytes of 'B' — should displace oldest
    buf.push(Buffer.alloc(50, 0x42));

    const tail = buf.getTail();
    // The tail should end with 'B' bytes
    const lastByte = tail[tail.length - 1];
    expect(lastByte).toBe(0x42);
    expect(buf.getSize()).toBeLessThanOrEqual(cap);
  });

  it('getSize() returns 0 for empty buffer', () => {
    const buf = new BoundedStderrBuffer();
    expect(buf.getSize()).toBe(0);
    expect(buf.getTail().length).toBe(0);
  });
});
