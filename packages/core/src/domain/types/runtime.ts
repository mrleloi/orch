/**
 * IAgentRuntime — adapter contract for spawning and managing Claude Code workers.
 *
 * Concrete impls (ClaudeCodeAdapter, etc.) use `execa` + the `ccs` CLI subprocess.
 * The interface is SDK-agnostic so the daemon never imports the Anthropic SDK (I-1, I-3).
 */

import type { Readable } from 'node:stream';

/** Reason a worker is being forcefully stopped — drives log/metric attribution. */
export type TerminationReason =
  | 'user_cancel'
  | 'timeout'
  | 'rate_limit'
  | 'context_full'
  | 'error';

/** Configuration passed to `spawn` when launching a new Claude Code worker. */
export interface SpawnConfig {
  /** Name of the ccs profile to use (maps to a Claude Code account / API key). */
  profile: string;

  /** Initial prompt handed to `claude -p`. */
  prompt: string;

  /** Working directory for the spawned process; defaults to project root. */
  workdir?: string;

  /**
   * Extra env vars merged into the child process environment.
   *
   * Typically contains `TRACEPARENT` for W3C trace propagation (D7).
   * Never contains raw API keys — ccs handles auth internally.
   */
  env?: Record<string, string>;

  /**
   * Optional seed prompt prepended to the initial prompt for handoff continuity.
   *
   * When set (Task 3.6 handoff flow), this text is prepended to `prompt` before
   * passing to `claude -p`. It carries the RenderedPrompt.text from the previous
   * session's HandoffContextBuilder.render() output, giving the successor session
   * its context (git diff, completed tasks, next pickup, decisions).
   *
   * I-1: pure text injection — no LLM call here; the builder that produced this
   * text is deterministic (decision 006).
   */
  seedPrompt?: string;

  /**
   * When true, the ClaudeCodeAdapter creates an isolated git worktree before
   * spawning the subprocess and prunes it on terminate().
   *
   * Phase 6.3 / Decision 018 — opt-in via profile.worktreeIsolation flag.
   * Default: false (backward-compatible with pre-6.3 single-branch sessions).
   */
  worktreeIsolation?: boolean;

  /**
   * The base branch from which the ephemeral worktree branch is forked.
   *
   * Phase 6.3 / Decision 018 — maps from profile.baseBranch.
   * Default: 'main' (adapter uses this value when the field is absent).
   */
  baseBranch?: string;
}

/**
 * Handle returned by `spawn` and `resume`.
 *
 * Callers use `abort()` for graceful cancellation; for hard kills, call `terminate`.
 * stdout/stderr are raw Readable streams from the child process so callers can
 * parse streaming JSON without buffering the whole response.
 */
export interface RuntimeHandle {
  /** Orch-internal session id (matches the DB Session.id). */
  sessionId: string;

  /** OS process id of the spawned `ccs` / `claude` process. */
  pid: number;

  /** Send SIGINT to the child (soft cancel). */
  abort(): void;

  /** Raw stdout stream — carries `--output-format stream-json` lines. */
  stdout: Readable;

  /** Raw stderr stream — carries diagnostics + rate-limit signals. */
  stderr: Readable;

  /**
   * Absolute path to the git worktree created for this session, when
   * `SpawnConfig.worktreeIsolation` is true.
   *
   * Phase 6.3 / Decision 018 — set by ClaudeCodeAdapter.spawn() and consumed by
   * ClaudeCodeAdapter.terminate() to prune the worktree after the process exits.
   * `undefined` when worktree isolation was not requested or after cleanup.
   *
   * Note: typed as `string | undefined` (not `string?`) so getters that return
   * `undefined` satisfy this field under `exactOptionalPropertyTypes`.
   */
  readonly worktreePath: string | undefined;
}

/**
 * IAgentRuntime — launched once per adapter type (ClaudeCode, Codex, …).
 *
 * spawn/resume/terminate map 1-to-1 to the `ccs` CLI surface.
 * Concrete adapters translate domain errors into DomainError subclasses (I-12).
 */
export interface IAgentRuntime {
  /**
   * Spawn a fresh Claude Code worker for the given profile and prompt.
   *
   * Equivalent to: `ccs <profile> -p <prompt> --output-format stream-json`
   */
  spawn(config: SpawnConfig): Promise<RuntimeHandle>;

  /**
   * Resume an existing Claude Code session with a follow-up prompt.
   *
   * Equivalent to: `ccs <profile> --resume <sessionId> -p <prompt>`
   */
  resume(sessionId: string, prompt: string): Promise<RuntimeHandle>;

  /**
   * Terminate a running handle, emitting the provided reason for logging/metrics.
   *
   * Implementations must await child process exit before resolving.
   */
  terminate(handle: RuntimeHandle, reason: TerminationReason): Promise<void>;

  /**
   * Await the child process associated with `handle` and classify any non-zero
   * exit into a typed DomainError subclass.
   *
   * Called by SessionManager after stream draining is complete.
   * Throws RateLimitError, ContextFullError, or RuntimeSpawnError on failure.
   * Returns void on clean exit (exitCode 0).
   */
  awaitAndClassify(handle: RuntimeHandle): Promise<void>;

  /**
   * Write text to the stdin of the subprocess associated with `handle`.
   *
   * Used by SessionManager (Task 3.3) to deliver a slash-command (e.g. `/session-end\n`)
   * for graceful context-full termination when `profile.commands.sessionEnd` is set.
   *
   * Implementations must use the underlying child process stdin stream.
   * Returns a Promise that resolves when the write is complete or the stdin is not writable
   * (no-op in that case — timeout fallback handles the rest).
   *
   * I-1: pure I/O, zero LLM calls.
   */
  writeStdin(handle: RuntimeHandle, text: string): Promise<void>;
}
