/**
 * ClaudeCodeAdapter — IAgentRuntime implementation using the `ccs` CLI subprocess.
 *
 * Invariants enforced:
 *  I-3: NO Agent SDK imports. CLI subprocess ONLY via `execa('ccs', ...)`.
 *  I-12: All errors caught at adapter boundary and wrapped in DomainError subclasses.
 *  I-14: No NestJS imports except `@nestjs/common` for Injectable/Logger.
 *
 * Spawn pattern: `ccs <profile> -p <prompt> --output-format stream-json`
 * Resume pattern: `ccs <profile> --resume <sessionId> -p <prompt>`
 *
 * Session ID extraction (SYNTHESIS §6.1):
 *  Primary: first stream-json line containing a `session_id` field
 *  Fallback: regex scan on early stdout/stderr for UUID pattern [a-f0-9-]{36}
 *
 * Rate-limit detection (research/ccs.md §6):
 *  On non-zero exit, inspect buffered stderr:
 *   - /rate.?limit|429|quota.?exceeded/i  → RateLimitError
 *   - /context.*(full|exceeded|limit)|token.?limit.?exceeded/i → ContextFullError
 *   - /unauthorized|401|login.?required/i → RuntimeSpawnError (reason=auth)
 *   - everything else non-zero → RuntimeSpawnError
 *
 * W3C TRACEPARENT: injected via TracingService.injectTraceparentIntoEnv() (D7).
 * The original process.env is never mutated.
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  ContextFullError,
  DomainError,
  RateLimitError,
  RuntimeSpawnError,
  WorktreeCreateError,
} from '../../domain/errors.js';
import type {
  IAgentRuntime,
  RuntimeHandle,
  SpawnConfig,
  TerminationReason,
} from '../../domain/types/runtime.js';
import { TracingService } from '../tracing/tracing.service.js';
import { buildPropagatedEnv } from './env-propagation.js';
import { probeWorktreeSupport } from './git-worktree-probe.js';
import type { WorktreeProbeResult } from './git-worktree-probe.js';
import {
  DEFAULT_TERMINATE_TIMEOUT_MS,
  DEFAULT_STDERR_BUFFER_MAX_BYTES,
} from '../../config/defaults.js';
// execa v5 uses `export = execa` (CJS). allowSyntheticDefaultImports lets us import as default.
import execa from 'execa';
import type execa_ns from 'execa';
import type { Readable } from 'node:stream';

// CJS-compatible type alias for ExecaChildProcess
type ExecaChildProcess = execa_ns.ExecaChildProcess;

// ── Constants ─────────────────────────────────────────────────────────────────

/** UUID v4-ish pattern used as fallback session-id extraction from raw text. */
const SESSION_ID_REGEX =
  /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i;

/** Timeout in ms for terminate: SIGTERM → wait → SIGKILL. */
const TERMINATE_TIMEOUT_MS = DEFAULT_TERMINATE_TIMEOUT_MS;

/** Maximum total bytes retained in BoundedStderrBuffer (256 KiB). */
const STDERR_BUFFER_MAX_BYTES = DEFAULT_STDERR_BUFFER_MAX_BYTES;

// ── BoundedStderrBuffer ───────────────────────────────────────────────────────

/**
 * Ring-buffer for stderr chunks with a fixed byte cap.
 *
 * When adding a new chunk would exceed STDERR_BUFFER_MAX_BYTES, the oldest
 * chunks are dropped until the total fits. This keeps memory bounded for
 * long-running subprocesses with chatty stderr (N6 / charter 72h stability).
 *
 * Only the *tail* of stderr is needed for exit classification, so dropping
 * old chunks is safe.
 */
export class BoundedStderrBuffer {
  private readonly chunks: Buffer[] = [];
  private totalBytes = 0;
  private readonly maxBytes: number;

  constructor(maxBytes = STDERR_BUFFER_MAX_BYTES) {
    this.maxBytes = maxBytes;
  }

  push(buf: Buffer): void {
    // Drop oldest chunks until there is room for the new one
    while (
      this.chunks.length > 0 &&
      this.totalBytes + buf.length > this.maxBytes
    ) {
      const oldest = this.chunks.shift()!;
      this.totalBytes -= oldest.length;
    }

    // If the single chunk is larger than the cap, keep only its tail
    if (buf.length > this.maxBytes) {
      const tail = buf.subarray(buf.length - this.maxBytes);
      this.chunks.push(tail);
      this.totalBytes += tail.length;
    } else {
      this.chunks.push(buf);
      this.totalBytes += buf.length;
    }
  }

  /** Concatenate all retained chunks into a single Buffer. */
  getTail(): Buffer {
    return Buffer.concat(this.chunks);
  }

  /** Current total retained byte count. */
  getSize(): number {
    return this.totalBytes;
  }
}

/**
 * BoundedStdoutBuffer — identical ring-buffer used for stdout tailing.
 *
 * Re-uses the same 256 KiB ring pattern (N6 / charter 72h stability).
 * Stdout is stored line-by-line via push(); the tail is used by
 * GET /api/v1/sessions/:id/tail and /api/v1/sessions/:id/logs.
 */
export class BoundedStdoutBuffer extends BoundedStderrBuffer {
  /** Default cap: 256 KiB — same as stderr buffer. */
  constructor(maxBytes = STDERR_BUFFER_MAX_BYTES) {
    super(maxBytes);
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

/** A parsed event from the ccs --output-format stream-json stdout. */
export interface ClaudeStreamEvent {
  type: string;
  session_id?: string;
  [key: string]: unknown;
}

// ── Adapter ───────────────────────────────────────────────────────────────────

@Injectable()
export class ClaudeCodeAdapter implements IAgentRuntime {
  private readonly logger = new Logger(ClaudeCodeAdapter.name);

  /**
   * Maps RuntimeHandle → { child, stderrBuf } so `awaitAndClassify` can
   * look up the underlying child process and its collected stderr from the
   * opaque handle (I-14: handle stays domain-pure; process refs live only in
   * the adapter).
   *
   * stderrBuf is collected by wireSessionIdExtraction() — necessary because
   * execa is spawned with `buffer: false`, so `result.stderr` is always empty.
   * We need the raw stream data to classify rate-limit / context-full exits.
   * BoundedStderrBuffer caps memory at 256 KiB (N6 / charter 72h stability).
   */
  private readonly childProcessMap = new Map<
    RuntimeHandle,
    {
      child: ExecaChildProcess;
      stderrBuf: BoundedStderrBuffer;
      /** Phase 6.3: mutable box holding worktree path + branch; cleared after cleanup. */
      worktreeBox?: {
        path: string | undefined;
        branchName: string | undefined;
      };
    }
  >();

  /**
   * Lazy-once cache for the git-worktree probe result (Phase 6.3 / Decision 018).
   *
   * Undefined = not yet probed. Set once on the first call to
   * `createWorktreeIfNeeded` that actually needs worktree isolation.
   * The cache lives for the lifetime of this adapter instance (daemon process).
   */
  private worktreeSupportCache: WorktreeProbeResult | undefined = undefined;

  // ── writeStdin ─────────────────────────────────────────────────────────────

  /**
   * Write text to the stdin of the subprocess associated with `handle`.
   *
   * Used by SessionManager (Task 3.3) to deliver a graceful-end slash-command
   * (e.g. `/session-end\n`) when the context budget is exhausted and
   * `profile.commands.sessionEnd` is configured.
   *
   * No-ops when:
   *  - The handle is not in the child process map (already exited).
   *  - The child's stdin is null or not writable (already closed).
   *
   * Resolves immediately after write (buffered write — kernel handles delivery).
   * Timeout fallback in SessionManager handles the case where the write does not
   * trigger a graceful exit within `gracefulEndTimeoutMs`.
   *
   * I-1: pure stdin I/O — zero LLM calls.
   */
  async writeStdin(handle: RuntimeHandle, text: string): Promise<void> {
    const entry = this.childProcessMap.get(handle);
    if (!entry) {
      this.logger.debug({
        msg: 'adapter:write-stdin:handle-not-found',
        pid: handle.pid,
      });
      return;
    }
    const { child } = entry;
    if (!child.stdin || !child.stdin.writable) {
      this.logger.debug({
        msg: 'adapter:write-stdin:stdin-not-writable',
        pid: handle.pid,
      });
      return;
    }
    await new Promise<void>((resolve) => {
      child.stdin!.write(text, 'utf8', (err) => {
        if (err) {
          // Treat EPIPE / ERR_STREAM_WRITE_AFTER_END as no-op (process already closed stdin)
          this.logger.debug({
            msg: 'adapter:write-stdin:write-error',
            pid: handle.pid,
            error: String(err),
          });
        }
        resolve(); // Always resolve — timeout fallback handles the rest
      });
    });
    this.logger.debug({
      msg: 'adapter:write-stdin:sent',
      pid: handle.pid,
      bytes: text.length,
    });
  }

  constructor(private readonly tracing: TracingService) {}

  // ── spawn ──────────────────────────────────────────────────────────────────

  /**
   * Spawn a new Claude Code worker via
   * `ccs <profile> -p <prompt> --output-format stream-json`.
   *
   * The returned RuntimeHandle exposes raw stdout/stderr streams; callers may
   * read stream-json events directly or use ClaudeCodeAdapter.parseStreamLine().
   *
   * Session ID is extracted as soon as the first `session_id` field appears in stdout.
   * Until that moment handle.sessionId is an empty string — callers that need the ID
   * should wait for the `session.started` event emitted by the session manager (1.9d).
   *
   * @throws RuntimeSpawnError  binary not found or unknown non-zero exit
   * @throws RateLimitError     stderr contains rate-limit signal
   * @throws ContextFullError   stderr contains context-full signal
   */
  async spawn(config: SpawnConfig): Promise<RuntimeHandle> {
    // Phase 6.3: create a git worktree before spawning when worktreeIsolation is
    // requested. Must run BEFORE execa('ccs', ...) so the effectiveCwd is resolved.
    const orchSessionId = `spawn-${Date.now()}`;
    const worktreePath = await this.createWorktreeIfNeeded(
      config,
      orchSessionId,
    );

    const { profile, prompt, workdir, env: extraEnv, seedPrompt } = config;
    const childEnv = this.buildEnv(extraEnv);

    // Task 3.6: if seedPrompt is provided, prepend it to the prompt with a separator
    // so the successor session starts with full handoff context.
    const effectivePrompt = seedPrompt
      ? `${seedPrompt}\n\n---\n\n${prompt}`
      : prompt;

    // Phase 6.3: use worktree path as cwd when isolation is active (Decision 018).
    const effectiveCwd = worktreePath ?? workdir ?? process.cwd();

    this.logger.log({
      msg: 'adapter:spawn',
      profile,
      workdir: effectiveCwd,
    });

    let child: ExecaChildProcess;
    try {
      child = execa(
        'ccs',
        [profile, '-p', effectivePrompt, '--output-format', 'stream-json'],
        {
          cwd: effectiveCwd,
          env: childEnv,
          reject: false, // never throw on non-zero exit — we handle it
          buffer: false, // do not buffer; we read from streams directly
          all: false,
        },
      );
    } catch (err) {
      // Synchronous throw (e.g. ENOENT when ccs is not on PATH)
      throw new RuntimeSpawnError(
        `Failed to spawn ccs for profile "${profile}": ${String(err)}`,
        { cause: err },
      );
    }

    const pid = child.pid ?? 0;
    const sessionIdBox = { value: '' };
    const stderrBuf = new BoundedStderrBuffer();
    // Phase 6.3: mutable box for worktreePath so cleanupWorktreeIfPresent can
    // clear it after first cleanup (idempotency — T7).
    const worktreeBox = {
      path: worktreePath,
      branchName: worktreePath
        ? `${config.baseBranch ?? 'main'}-orch-${orchSessionId}`
        : undefined,
    };

    // Set up session-id extraction from stdout stream
    this.wireSessionIdExtraction(child, sessionIdBox, stderrBuf);

    const handle: RuntimeHandle = {
      get sessionId() {
        return sessionIdBox.value;
      },
      get worktreePath() {
        return worktreeBox.path;
      },
      pid,
      abort: () => {
        child.kill('SIGINT');
      },
      stdout: child.stdout as Readable,
      stderr: child.stderr as Readable,
    };

    // Register handle → { child, stderrBuf, worktreeBox } mapping for awaitAndClassify
    this.childProcessMap.set(handle, { child, stderrBuf, worktreeBox });

    // Attach error handler on child promise so unhandled rejection does not crash
    void child.then(
      (result) => {
        if (result.exitCode !== 0) {
          this.logger.warn({
            msg: 'adapter:spawn:non-zero-exit',
            profile,
            exitCode: result.exitCode,
          });
        }
      },
      (err: unknown) => {
        this.logger.error({
          msg: 'adapter:spawn:child-error',
          profile,
          error: String(err),
        });
      },
    );

    return handle;
  }

  // ── resume ─────────────────────────────────────────────────────────────────

  /**
   * Resume an existing Claude Code session via
   * `ccs <profile> --resume <sessionId> -p <prompt>`.
   *
   * Same error contract as spawn().
   * Note: ccs only supports same-account resume (ccs.md §Cross-Account Resume).
   *
   * The sessionId parameter uses "<profile>/<claudeSessionId>" encoding so the
   * session manager (1.9d) can route to the correct profile without extending
   * the IAgentRuntime interface signature.
   * If no slash is present, profile defaults to "default".
   */
  async resume(sessionId: string, prompt: string): Promise<RuntimeHandle> {
    // await ensures genuinely async (eslint require-await)
    await Promise.resolve();

    const slashIdx = sessionId.indexOf('/');
    const profile = slashIdx >= 0 ? sessionId.slice(0, slashIdx) : 'default';
    const claudeSessionId =
      slashIdx >= 0 ? sessionId.slice(slashIdx + 1) : sessionId;

    const childEnv = this.buildEnv({});

    this.logger.log({
      msg: 'adapter:resume',
      profile,
      claudeSessionId,
    });

    let child: ExecaChildProcess;
    try {
      child = execa(
        'ccs',
        [
          profile,
          '--resume',
          claudeSessionId,
          '-p',
          prompt,
          '--output-format',
          'stream-json',
        ],
        {
          env: childEnv,
          reject: false,
          buffer: false,
          all: false,
        },
      );
    } catch (err) {
      throw new RuntimeSpawnError(
        `Failed to resume ccs session "${claudeSessionId}" for profile "${profile}": ${String(err)}`,
        { cause: err },
      );
    }

    const pid = child.pid ?? 0;
    const sessionIdBox = { value: claudeSessionId };
    const stderrBuf = new BoundedStderrBuffer();

    this.wireSessionIdExtraction(child, sessionIdBox, stderrBuf);

    const handle: RuntimeHandle = {
      get sessionId() {
        return sessionIdBox.value;
      },
      // resume() never creates a worktree — Phase 6.3 / Decision 018
      worktreePath: undefined,
      pid,
      abort: () => {
        child.kill('SIGINT');
      },
      stdout: child.stdout as Readable,
      stderr: child.stderr as Readable,
    };

    // Register handle → { child, stderrBuf } mapping for awaitAndClassify
    this.childProcessMap.set(handle, { child, stderrBuf });

    void child.then(
      (result) => {
        if (result.exitCode !== 0) {
          this.logger.warn({
            msg: 'adapter:resume:non-zero-exit',
            claudeSessionId,
            exitCode: result.exitCode,
          });
        }
      },
      (err: unknown) => {
        this.logger.error({
          msg: 'adapter:resume:child-error',
          claudeSessionId,
          error: String(err),
        });
      },
    );

    return handle;
  }

  // ── terminate ──────────────────────────────────────────────────────────────

  /**
   * Gracefully terminate a running handle.
   *
   * Sends SIGTERM first. If the child is still running after TERMINATE_TIMEOUT_MS,
   * sends SIGKILL. Polls for process exit (signal 0) to resolve early.
   *
   * @throws DomainError if termination encounters an unexpected error
   */
  async terminate(
    handle: RuntimeHandle,
    reason: TerminationReason,
  ): Promise<void> {
    this.logger.log({
      msg: 'adapter:terminate',
      pid: handle.pid,
      reason,
    });

    const { pid } = handle;
    if (!pid) {
      this.logger.warn({ msg: 'adapter:terminate:no-pid', reason });
      return;
    }

    try {
      process.kill(pid, 'SIGTERM');
    } catch (err) {
      // ESRCH = process already gone — treat as success
      if ((err as NodeJS.ErrnoException).code === 'ESRCH') {
        this.logger.debug({
          msg: 'adapter:terminate:already-gone',
          pid,
          reason,
        });
        return;
      }
      throw new DomainError(
        'TERMINATE_ERROR',
        `Failed to send SIGTERM to pid ${pid}: ${String(err)}`,
        { cause: err },
      );
    }

    // Wait for process to die; SIGKILL after timeout
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        clearInterval(pollInterval);
        try {
          process.kill(pid, 'SIGKILL');
          this.logger.warn({
            msg: 'adapter:terminate:sigkill-sent',
            pid,
            reason,
          });
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== 'ESRCH') {
            this.logger.error({
              msg: 'adapter:terminate:sigkill-failed',
              pid,
              error: String(err),
            });
          }
        }
        resolve();
      }, TERMINATE_TIMEOUT_MS);

      // Poll every 200ms; resolve early when process exits
      const pollInterval = setInterval(() => {
        try {
          // Signal 0 checks process existence without sending a real signal
          process.kill(pid, 0);
        } catch {
          clearTimeout(timer);
          clearInterval(pollInterval);
          resolve();
        }
      }, 200);
    });

    // Phase 6.3: prune the worktree after the process is gone (best-effort,
    // no-throw — I-12 adapter failure isolation).
    await this.cleanupWorktreeIfPresent(handle);
  }

  // ── awaitAndClassify ───────────────────────────────────────────────────────

  /**
   * Await the child process associated with `handle` and classify any non-zero
   * exit into a typed DomainError subclass.
   *
   * Looks up the ExecaChildProcess from the internal handle map, awaits it, then
   * removes the map entry to prevent memory leaks. Clean exit (exitCode 0) returns
   * void. Non-zero exits throw a typed DomainError.
   *
   * @throws RateLimitError   if stderr contains rate-limit patterns
   * @throws ContextFullError if stderr contains context-full patterns
   * @throws RuntimeSpawnError for auth failures or unknown errors
   */
  async awaitAndClassify(handle: RuntimeHandle): Promise<void> {
    const entry = this.childProcessMap.get(handle);
    if (!entry) {
      // Handle was not spawned by this adapter instance (or already classified).
      // Treat as a clean exit — the process is gone either way.
      return;
    }

    // Always clean up the map entry regardless of outcome
    this.childProcessMap.delete(handle);

    const { child, stderrBuf } = entry;
    const result = await child;

    if (result.exitCode === 0) {
      return;
    }

    // Use the collected stream chunks for classification — `result.stderr` is
    // always empty because execa was spawned with `buffer: false`.
    const stderr = stderrBuf.getTail().toString('utf8');
    throw ClaudeCodeAdapter.classifyError(stderr, result.exitCode);
  }

  // ── Static helpers (public for testing) ───────────────────────────────────

  /**
   * Parse a single stream-json line.
   *
   * Returns null if the line is empty or contains invalid JSON.
   * Does NOT throw on parse failure (I-12: invalid JSON = skip, not crash).
   */
  static parseStreamLine(line: string): ClaudeStreamEvent | null {
    const trimmed = line.trim();
    if (!trimmed) return null;
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (typeof parsed === 'object' && parsed !== null) {
        return parsed as ClaudeStreamEvent;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Extract a session ID from a raw text blob (fallback regex scan).
   *
   * Used when no stream-json event carries a session_id field.
   * Returns null if no UUID-ish pattern is found.
   */
  static extractSessionIdFallback(text: string): string | null {
    const match = SESSION_ID_REGEX.exec(text);
    return match ? match[0] : null;
  }

  /**
   * Classify a non-zero exit into a DomainError subclass based on stderr content.
   *
   * Patterns from research/ccs.md §6 and SYNTHESIS §D1.
   */
  static classifyError(
    stderr: string,
    exitCode: number | null | undefined,
  ): DomainError {
    if (/rate.?limit|429|quota.?exceeded/i.test(stderr)) {
      return new RateLimitError(
        `Claude rate limit detected (exit ${exitCode ?? '?'}): ${truncate(stderr)}`,
      );
    }
    if (/context.*(full|exceeded|limit)|token.?limit.?exceeded/i.test(stderr)) {
      return new ContextFullError(
        `Context window full (exit ${exitCode ?? '?'}): ${truncate(stderr)}`,
      );
    }
    if (/unauthorized|401|login.?required/i.test(stderr)) {
      return new RuntimeSpawnError(
        `Auth failure (exit ${exitCode ?? '?'}): ${truncate(stderr)}`,
      );
    }
    return new RuntimeSpawnError(
      `ccs exited with code ${exitCode ?? '?'}: ${truncate(stderr)}`,
    );
  }

  // ── Worktree helpers (Phase 6.3 / Decision 018) ──────────────────────────────

  /**
   * Create an isolated git worktree for this session when `config.worktreeIsolation`
   * is true.
   *
   * Computes:
   *   path       = .git/worktrees/orch-<sessionId>
   *   branchName = <baseBranch ?? 'main'>-orch-<sessionId>
   *
   * Runs `git worktree add -b <branchName> <path> <baseBranch>` via execa (I-3).
   * On non-zero exit, throws `WorktreeCreateError` (I-12).
   * Returns the resolved absolute path, or `undefined` when isolation is not requested.
   *
   * @throws WorktreeCreateError  when `git worktree add` fails
   */
  private async createWorktreeIfNeeded(
    config: SpawnConfig,
    sessionId: string,
  ): Promise<string | undefined> {
    if (!config.worktreeIsolation) {
      return undefined;
    }

    // Phase 6.3 / Decision 018: lazy-once probe for git-worktree support.
    // On Windows with minimal Git Bash, git worktree may be unavailable.
    // Cache the result for the lifetime of this adapter instance so the probe
    // runs at most once per daemon process (not once per spawn call).
    if (this.worktreeSupportCache === undefined) {
      this.worktreeSupportCache = await probeWorktreeSupport();
    }

    if (!this.worktreeSupportCache.supported) {
      this.logger.warn({
        msg: 'adapter:worktree:probe-failed',
        reason: this.worktreeSupportCache.reason,
        action: 'skipping worktree isolation; spawn proceeds with default cwd',
      });
      // Degrade gracefully: treat as if worktreeIsolation=false.
      return undefined;
    }

    const baseBranch = config.baseBranch ?? 'main';
    const path = `.git/worktrees/orch-${sessionId}`;
    const branchName = `${baseBranch}-orch-${sessionId}`;

    this.logger.log({
      msg: 'adapter:worktree:create',
      path,
      branchName,
      baseBranch,
    });

    const addChild = execa(
      'git',
      ['worktree', 'add', '-b', branchName, path, baseBranch],
      { reject: false },
    );
    let addResult: { exitCode: number | null | undefined };
    try {
      addResult = await addChild;
    } catch (err) {
      // Synchronous throw (e.g. ENOENT when git is not on PATH)
      throw new WorktreeCreateError(
        `git worktree add failed for session "${sessionId}": ${String(err)}`,
        { cause: err },
      );
    }

    if (addResult.exitCode !== 0) {
      throw new WorktreeCreateError(
        `git worktree add exited with code ${addResult.exitCode ?? '?'} for session "${sessionId}"`,
        { cause: addResult },
      );
    }

    return path;
  }

  /**
   * Remove the git worktree created for this session, if one exists.
   *
   * No-throw: on non-zero exit from either git command, logs a WARN and continues
   * (I-12 adapter failure isolation). Idempotent: clears the worktree path box
   * after the first cleanup so a second call is a no-op (T7 contract).
   *
   * Runs (best-effort, `reject: false`):
   *   git worktree remove --force <path>
   *   git branch -D <branchName>
   */
  private async cleanupWorktreeIfPresent(handle: RuntimeHandle): Promise<void> {
    const entry = this.childProcessMap.get(handle);
    const worktreeBox = entry?.worktreeBox;
    if (!worktreeBox?.path) {
      // No worktree for this handle, or already cleaned up — idempotent no-op.
      return;
    }

    const { path, branchName } = worktreeBox;
    // Clear immediately to enforce single-fire semantics (T7).
    worktreeBox.path = undefined;
    worktreeBox.branchName = undefined;

    this.logger.log({
      msg: 'adapter:worktree:cleanup',
      path,
      branchName,
    });

    const removeChild = execa('git', ['worktree', 'remove', '--force', path], {
      reject: false,
    });
    const removeResult = await removeChild;
    if (removeResult.exitCode !== 0) {
      this.logger.warn({
        msg: 'adapter:worktree:remove-failed',
        path,
        exitCode: removeResult.exitCode,
      });
    }

    if (branchName) {
      const branchChild = execa('git', ['branch', '-D', branchName], {
        reject: false,
      });
      const branchResult = await branchChild;
      if (branchResult.exitCode !== 0) {
        this.logger.warn({
          msg: 'adapter:worktree:branch-delete-failed',
          branchName,
          exitCode: branchResult.exitCode,
        });
      }
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Build the subprocess env by injecting W3C TRACEPARENT into a copy of process.env,
   * then merging any caller-supplied extra vars.
   *
   * Caller-supplied vars take precedence (allows test overrides).
   */
  private buildEnv(
    extraEnv: Record<string, string> | undefined,
  ): NodeJS.ProcessEnv {
    // D7: injectTraceparentIntoEnv returns a new object — process.env is never mutated
    const withTrace = this.tracing.injectTraceparentIntoEnv(process.env);
    // Phase 5.3.6: propagate the 8-var family per architecture.md adapter section
    return buildPropagatedEnv(withTrace, extraEnv);
  }

  /**
   * Attach line readers to child.stdout and child.stderr that:
   *  1. Extract the Claude session ID from the first stream-json event carrying
   *     a `session_id` field (primary), or scan stderr for a UUID (fallback).
   *  2. Collect stderr bytes into `stderrBuf` (BoundedStderrBuffer — 256 KiB cap)
   *     for later use by `awaitAndClassify` — necessary because execa is spawned
   *     with `buffer: false`, so `result.stderr` is always empty on process exit.
   *
   * Side-effects:
   *  - Writes into `sessionIdBox.value` when a session ID is found.
   *  - Pushes stderr bytes into `stderrBuf` (bounded — oldest chunks dropped).
   */
  private wireSessionIdExtraction(
    child: ExecaChildProcess,
    sessionIdBox: { value: string },
    stderrBuf: BoundedStderrBuffer,
  ): void {
    if (!child.stdout) return;

    let buffer = '';

    child.stdout.on('data', (chunk: Buffer | string) => {
      buffer += typeof chunk === 'string' ? chunk : chunk.toString('utf8');

      // Process complete newline-delimited lines
      const lines = buffer.split('\n');
      // Keep the potentially-incomplete last segment in the buffer
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const event = ClaudeCodeAdapter.parseStreamLine(line);
        if (event?.session_id && !sessionIdBox.value) {
          sessionIdBox.value = event.session_id;
        }
      }
    });

    // Collect stderr for classification + fallback session-id extraction
    let stderrIdBuffer = '';
    if (child.stderr) {
      child.stderr.on('data', (chunk: Buffer | string) => {
        const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
        // Collect for awaitAndClassify exit classification (bounded ring buffer)
        stderrBuf.push(buf);

        // Fallback session-id scan (only until ID is found)
        if (!sessionIdBox.value) {
          stderrIdBuffer += buf.toString('utf8');
          // Cap scan buffer at 4 KB to avoid unbounded growth on verbose stderr
          if (stderrIdBuffer.length > 4096) {
            stderrIdBuffer = stderrIdBuffer.slice(-4096);
          }
          const id = ClaudeCodeAdapter.extractSessionIdFallback(stderrIdBuffer);
          if (id) sessionIdBox.value = id;
        }
      });
    }
  }
}

// ── Module-private helpers ─────────────────────────────────────────────────────

/** Truncate text for error messages (prevents giant error strings). */
function truncate(text: string, maxLen = 200): string {
  return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text;
}
