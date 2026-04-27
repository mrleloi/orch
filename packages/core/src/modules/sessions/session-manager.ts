/**
 * SessionManager — composes ClaudeCodeAdapter + RequestQueue + IOrchStore
 * into the top-level session lifecycle orchestrator.
 *
 * Concurrency model (SYNTHESIS §D3 + Claude-to-IM §4 processWithSessionLock):
 *  - Layer 1 (in-process):  `wakeDedup` Map<sessionKey, Promise<SessionResult>>
 *    — duplicate runSession() calls for the same key return the existing promise.
 *  - Layer 2 (in-process):  RequestQueue serialises per-session work FIFO.
 *  - Layer 3 (cross-process): IOrchStore.acquireSessionLock() DB-backed TTL lock
 *    — if another daemon process holds the lock, throw SessionLockHeldError.
 *
 * Implements:
 *  - ISessionRegistry  (read-only view for AgentWatchdog)
 *  - ISessionTerminator (terminate-by-id for AgentWatchdog hard-kill)
 *
 * Invariants:
 *  I-1:  ZERO LLM calls. Pure orchestration — adapter handles the subprocess.
 *  I-3:  Adapter is the only path to Claude CLI. No Agent SDK imports.
 *  I-11: Every state transition emits an event (session.started / ended / failed
 *        / rate-limited / context-full).
 *  I-12: All caught errors are DomainError or wrapped in DomainError.
 *  I-13: Store, adapter, queue, events are injected — fully mockable in tests.
 *  I-14: SessionPlan/SessionResult/ActiveSession live in domain/session.ts.
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  ContextFullError,
  RateLimitError,
  RuntimeSpawnError,
  SessionLockHeldError,
} from '../../domain/errors.js';
import type {
  ActiveSession,
  SessionPlan,
  SessionResult,
} from '../../domain/session.js';
import { SessionState } from '../../domain/session.js';
import type { ISessionRegistry } from '../../domain/ports/session-registry.port.js';
import type { ISessionTerminator } from '../../domain/ports/session-terminator.port.js';
import type { WatchdogSession } from '../../domain/watchdog/decide-action.js';
import type {
  IAgentRuntime,
  RuntimeHandle,
} from '../../domain/types/runtime.js';
import { IAGENT_RUNTIME } from './agent-runtime.token.js';
import { OrchStoreService } from '../db/orch-store.service.js';
import { RequestQueue } from './request-queue.js';
import { EventBusService } from '../events/event-bus.service.js';
import { EVENT_CHANNELS } from '../events/event-channels.js';
import { TracingService } from '../tracing/tracing.service.js';
import { BoundedStdoutBuffer } from './claude-code-adapter.js';
import { redactSessionKey } from '../security/session-key-redactor.js';
import { ProjectRegistryService } from '../project-registry/project-registry.service.js';
import type { SessionForceHandoffPayload } from '../context-budget/context-budget.types.js';
import { EndedReason } from '@orch/shared';

// ── Internal types ─────────────────────────────────────────────────────────────

/**
 * Live in-process state for an active session.
 *
 * Populated when the subprocess is spawned, cleared when the session ends.
 */
interface ActiveSessionState {
  /** Orch-internal session ID (DB record). */
  id: string;
  /** Registry project identifier. */
  projectId: string;
  /** Per-session FIFO lock key. */
  sessionKey: string;
  /** When the subprocess was spawned (epoch ms). */
  startedAt: number;
  /**
   * Last hook-event timestamp (epoch ms).
   * Null until the first heartbeat / hook event arrives.
   */
  lastHeartbeatAt: number | null;
  /** Underlying adapter handle — used for abort() and stream access. */
  handle: RuntimeHandle;
  /**
   * True when _terminateInternal is in-progress.
   *
   * Prevents executeSession's normal-completion branch from emitting a second
   * session.ended event after _terminateInternal has already done so (Fix D).
   */
  terminating: boolean;
  /**
   * Ring-buffer capturing stdout lines (256 KiB cap — N6 / charter 72h stability).
   *
   * Used by GET /api/v1/sessions/:id/tail and /api/v1/sessions/:id/logs.
   * Lines are collected in _awaitHandleCompletion; after session ends the buffer
   * is removed with the active-map entry (so memory is released).
   */
  stdoutBuf: BoundedStdoutBuffer;
  /**
   * Resolver for the graceful-end synchronisation promise (Task 3.3).
   *
   * Set by `_handleGracefulEnd` before writing the slash-command. Resolved by
   * `_awaitHandleCompletion` when stdout drains (process exited naturally).
   * If the resolver is never called within `gracefulEndTimeoutMs`, the timeout
   * branch fires SIGTERM → SIGKILL.
   *
   * Null when no graceful-end is in progress.
   */
  gracefulEndResolve: (() => void) | null;
}

/** DB lock TTL in seconds — renewed as needed during long sessions. */
const LOCK_TTL_SECS = 60;

/** Identifies this daemon process in DB lock ownership (stable per-process). */
const LOCK_OWNER = `orch-${process.pid}`;

// ── SessionManager ────────────────────────────────────────────────────────────

@Injectable()
export class SessionManager
  implements ISessionTerminator, ISessionRegistry, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(SessionManager.name);

  /**
   * Wake-dedup map (nanoclaw pattern — SYNTHESIS §D3).
   *
   * Maps sessionKey → in-flight runSession promise.
   * A second runSession() call for the same key returns the existing promise
   * rather than enqueueing duplicate work.
   */
  private readonly wakeDedup = new Map<string, Promise<SessionResult>>();

  /**
   * In-process active session state map.
   *
   * Keyed by sessionKey. Populated on spawn, removed on termination/error.
   */
  private readonly active = new Map<string, ActiveSessionState>();

  constructor(
    @Inject(IAGENT_RUNTIME) private readonly adapter: IAgentRuntime,
    private readonly queue: RequestQueue,
    private readonly store: OrchStoreService,
    private readonly events: EventBusService,
    private readonly tracing: TracingService,
    private readonly registry: ProjectRegistryService,
  ) {}

  // ── OnModuleInit ───────────────────────────────────────────────────────────

  /**
   * Subscribe to `session.forceHandoff` EventBus events.
   *
   * Wired at module-init time (not in constructor) to guarantee that all
   * injected dependencies are fully initialised before we start handling events.
   *
   * I-11: every event subscription emits a log line at subscribe time.
   */
  onModuleInit(): void {
    this.events.on(
      EVENT_CHANNELS.session.forceHandoff,
      (payload: SessionForceHandoffPayload) => {
        void this._handleForceHandoff(payload);
      },
    );
    this.logger.log({
      msg: 'session-manager:subscribed:force-handoff',
    });

    // Phase 5.3.5 — SC-12: subscribe to tool.denied to gate writeStdin (I-11).
    this.events.on(
      EVENT_CHANNELS.tool.denied,
      (payload: {
        sessionId: string;
        toolName: string;
        message: string | undefined;
      }) => {
        this._handleToolDenied(payload);
      },
    );
    this.logger.log({
      msg: 'session-manager:subscribed:tool-denied',
    });
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Count the number of currently active (in-process) sessions for a project.
   *
   * Used by the SC-8 concurrency cap check in runSession().
   * I-1: pure in-memory computation — no LLM calls, no DB queries.
   */
  countActiveForProject(projectId: string): number {
    let count = 0;
    for (const state of this.active.values()) {
      if (state.projectId === projectId) {
        count++;
      }
    }
    return count;
  }

  /**
   * Spawn or resume a Claude Code session for the given plan.
   *
   * Wake-dedup: if this sessionKey is already in-flight, the existing promise
   * is returned immediately — no duplicate work is enqueued.
   *
   * SC-8 concurrency cap: checked inside executeSession before spawning. If
   * `countActiveForProject(projectId) >= profile.maxConcurrentSessions`, a
   * `queue.dispatch.deferred` event is emitted and the result box is populated
   * with `{ status: 'failed' }`. The caller (dispatcher loop) should retry
   * after one of the active sessions ends.
   *
   * @throws SessionLockHeldError if the DB lock is held by another process.
   * @throws QueueCancelledError  if the session's queue was cancelled before
   *                              this call got to execute.
   */
  runSession(projectId: string, plan: SessionPlan): Promise<SessionResult> {
    const sessionKey = `${projectId}:${plan.profile}:${plan.prompt.slice(0, 32)}`;

    // Wake-dedup: return existing promise for this key if already in-flight
    const existing = this.wakeDedup.get(sessionKey);
    if (existing !== undefined) {
      this.logger.debug({
        msg: 'session-manager:wake-dedup',
        sessionKey: redactSessionKey(sessionKey),
      });
      return existing;
    }

    const promise = this.queue
      .enqueue(sessionKey, () =>
        this.executeSession(sessionKey, projectId, plan),
      )
      .then(() => {
        // Retrieve result from in-process state after queue task completes.
        // The executeSession() resolves via the resultBox below.
        return (
          this._resultBoxes.get(sessionKey) ?? {
            sessionId: '',
            status: 'ended' as const,
          }
        );
      })
      .catch((err: unknown) => {
        // SessionLockHeldError must propagate to the caller — it is not a
        // session result; it means the session could not be started at all.
        if (err instanceof SessionLockHeldError) {
          throw err;
        }
        const error =
          err instanceof Error
            ? err
            : new RuntimeSpawnError(`Unexpected queue error: ${String(err)}`);
        return {
          sessionId: '',
          status: 'failed' as const,
          error,
        };
      })
      .finally(() => {
        this.wakeDedup.delete(sessionKey);
        this._resultBoxes.delete(sessionKey);
      });

    this.wakeDedup.set(sessionKey, promise);
    return promise;
  }

  /**
   * Cancel all pending and in-flight work for a session identified by its key.
   *
   * Equivalent to terminate() but keyed by sessionKey rather than sessionId.
   * Called by Phase 2's /cancel command.
   */
  async cancelSession(sessionKey: string): Promise<void> {
    const state = this.active.get(sessionKey);
    if (!state) {
      this.logger.debug({
        msg: 'session-manager:cancel:not-found',
        sessionKey: redactSessionKey(sessionKey),
      });
      return;
    }
    await this._terminateInternal(sessionKey, state, 'user_cancel');
  }

  /**
   * Returns a snapshot of all currently active (non-terminal) sessions.
   *
   * Typed for external callers (REST API, telemetry).
   */
  getActiveSessions(): readonly ActiveSession[] {
    const result: ActiveSession[] = [];
    for (const [, state] of this.active) {
      result.push({
        id: state.id,
        projectId: state.projectId,
        sessionKey: state.sessionKey,
        startedAt: state.startedAt,
        lastHeartbeatAt: state.lastHeartbeatAt,
      });
    }
    return result;
  }

  /**
   * Update the last heartbeat timestamp for a session.
   *
   * Called by HooksReceiver (Task 1.10) when a hook event arrives for a session.
   * The timestamp drives the AgentWatchdog liveness check.
   */
  recordHeartbeat(sessionKey: string, at: number): void {
    const state = this.active.get(sessionKey);
    if (state) {
      state.lastHeartbeatAt = at;
      this.logger.debug({
        msg: 'session-manager:heartbeat',
        sessionKey: redactSessionKey(sessionKey),
        at,
      });
    }
  }

  // ── Stdout tail / logs access ──────────────────────────────────────────────

  /**
   * Returns the last `lines` lines of stdout from the active session identified
   * by its Orch-internal session ID.
   *
   * Returns null when no active session with that id exists.
   * `lines` is expected to be already clamped (1-100) by the caller.
   *
   * The `truncated` flag is true when the ring buffer dropped data (i.e. the
   * raw stdout exceeded 256 KiB) — approximated by checking whether the total
   * captured content has more lines than requested.
   */
  getSessionTail(
    sessionId: string,
    lines: number,
  ): { lines: string[]; truncated: boolean } | null {
    let found: ActiveSessionState | undefined;
    for (const state of this.active.values()) {
      if (state.id === sessionId) {
        found = state;
        break;
      }
    }
    if (!found) return null;

    const raw = found.stdoutBuf.getTail().toString('utf8');
    const allLines = raw.split('\n').filter((l) => l.length > 0);
    const truncated = allLines.length > lines;
    const tail = allLines.slice(-lines);
    return { lines: tail, truncated };
  }

  /**
   * Returns the full stdout ring-buffer content as a string for the active session.
   *
   * Returns null when no active session with that id exists.
   * Used by GET /api/v1/sessions/:id/logs.
   */
  getSessionLogs(sessionId: string): string | null {
    let found: ActiveSessionState | undefined;
    for (const state of this.active.values()) {
      if (state.id === sessionId) {
        found = state;
        break;
      }
    }
    if (!found) return null;

    return found.stdoutBuf.getTail().toString('utf8');
  }

  // ── ISessionRegistry ───────────────────────────────────────────────────────

  /**
   * Return a snapshot of active sessions for the AgentWatchdog.
   *
   * Maps in-process `active` Map to `WatchdogSession[]`.
   * Applies the `Date → number` conversion contract: startedAt is already
   * stored as epoch ms in ActiveSessionState.
   */
  getActive(): readonly WatchdogSession[] {
    const result: WatchdogSession[] = [];
    for (const [, state] of this.active) {
      result.push({
        id: state.id,
        state: SessionState.Running,
        startedAt: state.startedAt,
        lastHeartbeatAt: state.lastHeartbeatAt,
      });
    }
    return result;
  }

  // ── ISessionTerminator ─────────────────────────────────────────────────────

  /**
   * Terminate a session identified by its Orch-internal session ID.
   *
   * Idempotent: if the session is not found (already ended), logs and returns
   * without throwing (per ISessionTerminator contract).
   */
  async terminate(sessionId: string, reason: string): Promise<void> {
    // Resolve sessionId → sessionKey by searching the active map.
    let found: [string, ActiveSessionState] | undefined;
    for (const entry of this.active) {
      if (entry[1].id === sessionId) {
        found = entry;
        break;
      }
    }

    if (!found) {
      this.logger.debug({
        msg: 'session-manager:terminate:not-found',
        sessionId,
        reason,
      });
      return; // idempotent
    }

    const [sessionKey, state] = found;
    await this._terminateInternal(sessionKey, state, reason);
  }

  // ── OnModuleDestroy ────────────────────────────────────────────────────────

  /**
   * Graceful shutdown: abort all active child processes, update DB state to
   * Failed, release DB locks, and clear the active map.
   *
   * Called by NestJS when the application begins shutting down (e.g. SIGTERM).
   * Uses Promise.allSettled so one failed cleanup never blocks others.
   */
  async onModuleDestroy(): Promise<void> {
    const active = [...this.active.entries()];
    this.logger.log(
      `Graceful shutdown: terminating ${active.length} active sessions`,
    );
    await Promise.allSettled(
      active.map(async ([, state]) => {
        try {
          // Mark terminating so executeSession's normal-completion branch is skipped
          state.terminating = true;
          state.handle.abort(); // SIGINT to child process
          await this.store.updateSession(state.id, {
            state: SessionState.Failed,
            endedAt: new Date(),
            endReason: 'daemon_shutdown',
          });
          await this.store.releaseSessionLock(state.sessionKey, LOCK_OWNER);
        } catch (err) {
          this.logger.warn(
            `Shutdown cleanup failed for ${state.id}: ${String(err)}`,
          );
        }
      }),
    );
    this.active.clear();
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Result boxes — keyed by sessionKey.
   *
   * executeSession() writes the result here before resolving the queue task.
   * runSession() reads from here in the `.then()` callback.
   *
   * This decouples the session result from the queue's void-typed task return.
   */
  private readonly _resultBoxes = new Map<string, SessionResult>();

  /**
   * Core execution logic run inside RequestQueue.enqueue().
   *
   * Acquires the DB lock, spawns/resumes the adapter, awaits completion,
   * releases lock in finally.
   *
   * SC-8 concurrency cap check (I-1 daemon-dumb): before acquiring the lock,
   * count in-process active sessions for this project. If count ≥ cap, emit
   * `queue.dispatch.deferred` and return a failed result — no spawn occurs.
   */
  private async executeSession(
    sessionKey: string,
    projectId: string,
    plan: SessionPlan,
  ): Promise<void> {
    // ── SC-8: per-project concurrency cap (I-1, I-2) ─────────────────────────
    // getProjectSync() reads the in-memory cache directly — no microtask delay,
    // so no extra await is introduced to the executeSession chain.
    const profile = this.registry.getProjectSync(projectId);
    const cap = profile?.maxConcurrentSessions ?? 1;
    const activeCount = this.countActiveForProject(projectId);
    if (activeCount >= cap) {
      this.logger.debug({
        msg: 'session-manager:dispatch-deferred',
        projectId,
        activeCount,
        cap,
      });
      this.events.emit(EVENT_CHANNELS.queue.dispatchDeferred, {
        projectId,
        activeCount,
        cap,
      });
      // Write to result box so runSession's .then() callback returns the result
      this._resultBoxes.set(sessionKey, {
        sessionId: '',
        status: 'failed' as const,
        error: new RuntimeSpawnError(
          `Concurrency cap reached for project "${projectId}": ` +
            `${activeCount}/${cap} sessions active`,
        ),
      });
      return; // return without acquiring lock or spawning
    }

    // ── Layer 3: DB-backed cross-process lock ────────────────────────────────
    const locked = await this.store.acquireSessionLock(
      sessionKey,
      LOCK_OWNER,
      LOCK_TTL_SECS,
    );
    if (!locked) {
      throw new SessionLockHeldError(sessionKey);
    }

    this.logger.log({
      msg: 'session-manager:lock-acquired',
      sessionKey: redactSessionKey(sessionKey),
      owner: LOCK_OWNER,
    });

    let handle: RuntimeHandle | undefined;
    let sessionId = '';

    try {
      // Create a DB session record — inside try so lock is released on DB failure
      const sessionRecord = await this.store.createSession({
        projectId,
        sessionKey,
      });
      sessionId = sessionRecord.id;
      // ── Spawn or resume ────────────────────────────────────────────────────
      const spawnResult = await this.tracing.withSpan(
        plan.resumeSessionId ? 'session.resume' : 'session.spawn',
        async () => {
          if (plan.resumeSessionId) {
            return this.adapter.resume(plan.resumeSessionId, plan.prompt);
          }
          const spawnConfig: import('../../domain/types/runtime.js').SpawnConfig =
            {
              profile: plan.profile,
              prompt: plan.prompt,
              worktreeIsolation: profile?.worktreeIsolation ?? false,
              baseBranch: profile?.baseBranch ?? 'main',
              ...(plan.workdir !== undefined ? { workdir: plan.workdir } : {}),
              ...(plan.seedPrompt !== undefined
                ? { seedPrompt: plan.seedPrompt }
                : {}),
            };
          return this.adapter.spawn(spawnConfig);
        },
        {
          'session.key': redactSessionKey(sessionKey),
          'project.id': projectId,
        },
      );

      handle = spawnResult;

      // Phase 6.3 — persist worktreePath when the adapter created an isolated worktree.
      // Only called when worktreeIsolation=true and the adapter populated the field.
      if (handle.worktreePath) {
        await this.store.updateSession(sessionId, {
          worktreePath: handle.worktreePath,
        });
      }

      // Create a bounded stdout ring buffer for this session (256 KiB cap — N6).
      // Populated in _awaitHandleCompletion; readable via getSessionTail/getSessionLogs.
      const stdoutBuf = new BoundedStdoutBuffer();

      // ── Register in active map ─────────────────────────────────────────────
      const activeState: ActiveSessionState = {
        id: sessionId,
        projectId,
        sessionKey,
        startedAt: Date.now(),
        lastHeartbeatAt: null,
        handle,
        terminating: false,
        stdoutBuf,
        gracefulEndResolve: null,
      };
      this.active.set(sessionKey, activeState);

      // Update DB session to Starting state
      await this.store.updateSession(sessionId, {
        state: SessionState.Starting,
        startedAt: new Date(activeState.startedAt),
      });

      // Emit session.started (I-11)
      const updatedSession = await this.store.getSession(sessionId);
      if (updatedSession) {
        this.events.emit(EVENT_CHANNELS.session.started, {
          session: updatedSession,
        });
      }

      this.logger.log({
        msg: 'session-manager:spawned',
        sessionKey: redactSessionKey(sessionKey),
        sessionId,
        pid: handle.pid,
      });

      // ── Await subprocess completion ────────────────────────────────────────
      await this._awaitHandleCompletion(sessionKey, sessionId, handle);

      // Normal completion — but skip if _terminateInternal already handled it.
      // When abort() is called (cancel/watchdog-kill), the streams drain and
      // _awaitHandleCompletion returns, but _terminateInternal has already
      // emitted session.ended. Checking `terminating` prevents a double-emit.
      const currentState = this.active.get(sessionKey);
      if (currentState?.terminating) {
        // _terminateInternal is in-progress or complete; nothing more to do here.
        return;
      }

      const endedSession = await this.store.updateSession(sessionId, {
        state: SessionState.Ended,
        endedAt: new Date(),
        endReason: 'process_exit',
      });

      this.events.emit(EVENT_CHANNELS.session.ended, {
        session: endedSession,
        endReason: 'process_exit',
      });

      this._resultBoxes.set(sessionKey, {
        sessionId,
        status: 'ended',
      });
    } catch (err: unknown) {
      await this._handleSessionError(sessionKey, sessionId, err);
    } finally {
      this.active.delete(sessionKey);
      await this.store.releaseSessionLock(sessionKey, LOCK_OWNER);
      this.logger.log({
        msg: 'session-manager:lock-released',
        sessionKey: redactSessionKey(sessionKey),
      });
    }
  }

  /**
   * Await the adapter handle's stdout/stderr to drain, then classify the exit.
   *
   * Drains stdout so the child process doesn't block on a full pipe buffer.
   * After both streams end the child has exited; calls adapter.awaitAndClassify
   * which inspects the exit code + collected stderr and throws a typed DomainError
   * on non-zero exit (RateLimitError, ContextFullError, RuntimeSpawnError).
   *
   * The adapter's wireSessionIdExtraction already collects stderr bytes into
   * stderrChunks — we do NOT drain stderr here to avoid double-consuming the
   * stream. The adapter owns stderr collection; we only drain stdout.
   */
  private async _awaitHandleCompletion(
    sessionKey: string,
    _sessionId: string,
    handle: RuntimeHandle,
  ): Promise<void> {
    // Collect stdout into the bounded ring buffer (N6 — 256 KiB cap).
    // Hook receiver still processes events; we duplicate the data into the buffer
    // via a 'data' listener so /tail and /logs can serve recent output.
    await new Promise<void>((resolve, reject) => {
      const stdout = handle.stdout;
      if (!stdout) {
        resolve();
        return;
      }
      const state = this.active.get(sessionKey);
      if (state) {
        stdout.on('data', (chunk: Buffer | string) => {
          const buf = Buffer.isBuffer(chunk)
            ? chunk
            : Buffer.from(chunk, 'utf8');
          state.stdoutBuf.push(buf);
        });
      } else {
        stdout.resume(); // No active state yet — discard (safe fallback)
      }
      stdout.on('end', () => {
        // Signal graceful-end watcher if one is waiting (Task 3.3).
        // The watcher sets gracefulEndResolve before writing the slash-command;
        // resolving here means the process exited naturally within the timeout.
        const s = this.active.get(sessionKey);
        if (s?.gracefulEndResolve) {
          s.gracefulEndResolve();
          s.gracefulEndResolve = null;
        }
        resolve();
      });
      stdout.on('error', reject);
    });

    // Drain stderr so the child process doesn't block
    const stderr = handle.stderr;
    if (stderr) {
      await new Promise<void>((resolve) => {
        stderr.resume(); // discard data — adapter's wireSessionIdExtraction already collected it
        stderr.on('end', resolve);
        stderr.on('error', resolve); // swallow stderr errors
      });
    }

    // Classify the exit: throws RateLimitError / ContextFullError / RuntimeSpawnError
    // on non-zero exit code. Uses the stderr bytes collected by the adapter's stream
    // listener (not re-draining the stream).
    await this.adapter.awaitAndClassify(handle);

    this.logger.debug({
      msg: 'session-manager:handle-completed',
      sessionKey: redactSessionKey(sessionKey),
    });
  }

  /**
   * Classify the error and update the session state accordingly.
   *
   * Emits the appropriate event (rate-limited, context-full, failed).
   */
  private async _handleSessionError(
    sessionKey: string,
    sessionId: string,
    err: unknown,
  ): Promise<void> {
    const error =
      err instanceof Error
        ? err
        : new RuntimeSpawnError(`Unexpected session error: ${String(err)}`);

    this.logger.error({
      msg: 'session-manager:session-error',
      sessionKey: redactSessionKey(sessionKey),
      sessionId,
      error: error.message,
    });

    if (err instanceof RateLimitError) {
      const rateLimitedSession = await this.store.updateSession(sessionId, {
        state: SessionState.RateLimited,
        endReason: 'rate_limit',
        endedAt: new Date(),
      });
      const rateLimitedPayload =
        err.retryAfterSecs !== undefined
          ? { session: rateLimitedSession, retryAfterSecs: err.retryAfterSecs }
          : { session: rateLimitedSession };
      this.events.emit(EVENT_CHANNELS.session.rateLimited, rateLimitedPayload);
      this._resultBoxes.set(sessionKey, {
        sessionId,
        status: 'rate-limited',
        error,
      });
      return;
    }

    if (err instanceof ContextFullError) {
      const contextFullSession = await this.store.updateSession(sessionId, {
        state: SessionState.ContextFull,
        endReason: 'context_full',
        endedAt: new Date(),
      });
      this.events.emit(EVENT_CHANNELS.session.contextFull, {
        session: contextFullSession,
      });
      this._resultBoxes.set(sessionKey, {
        sessionId,
        status: 'context-full',
        error,
      });
      return;
    }

    // General failure
    try {
      const failedSession = await this.store.updateSession(sessionId, {
        state: SessionState.Failed,
        endReason: error.message.slice(0, 200),
        endedAt: new Date(),
      });
      this.events.emit(EVENT_CHANNELS.session.failed, {
        session: failedSession,
        error,
      });
    } catch (updateErr) {
      // If DB update fails, still emit failed event with partial data
      this.logger.error({
        msg: 'session-manager:update-failed',
        sessionId,
        error: String(updateErr),
      });
    }

    this._resultBoxes.set(sessionKey, {
      sessionId,
      status: 'failed',
      error,
    });
  }

  /**
   * Internal terminate implementation shared by terminate() and cancelSession().
   *
   * Aborts the handle, cancels the queue, releases the DB lock, removes from
   * the active map, and emits session.ended.
   */
  private async _terminateInternal(
    sessionKey: string,
    state: ActiveSessionState,
    reason: string,
  ): Promise<void> {
    // Mark as terminating BEFORE abort() so executeSession's normal-completion
    // branch skips its session.ended emit if the streams drain before we finish.
    state.terminating = true;

    this.logger.log({
      msg: 'session-manager:terminate',
      sessionKey: redactSessionKey(sessionKey),
      sessionId: state.id,
      reason,
    });

    // Abort the subprocess
    state.handle.abort();

    // Cancel pending queue work for this session
    await this.queue.cancel(sessionKey);

    // Note: do NOT delete from active map here. The `terminating` flag prevents
    // the normal-completion branch from re-emitting session.ended after the abort
    // causes the streams to drain. The `finally` block in executeSession handles
    // the actual active.delete() and final lock release.

    // Release DB lock eagerly so other processes can acquire it.
    await this.store.releaseSessionLock(sessionKey, LOCK_OWNER);

    // Update DB record and emit event
    try {
      const endedSession = await this.store.updateSession(state.id, {
        state: SessionState.Ended,
        endReason: reason,
        endedAt: new Date(),
        // Phase 6.3 — clear worktreePath so sweep hook knows the path was pruned.
        // Only set when the session had an isolated worktree (adapter populated it).
        ...(state.handle.worktreePath !== undefined
          ? { worktreePath: null }
          : {}),
      });
      this.events.emit(EVENT_CHANNELS.session.ended, {
        session: endedSession,
        endReason: reason,
      });
    } catch (err) {
      // If DB update fails, still emit with what we have
      this.logger.error({
        msg: 'session-manager:terminate-db-failed',
        sessionId: state.id,
        error: String(err),
      });
    }

    this._resultBoxes.set(sessionKey, {
      sessionId: state.id,
      status: 'cancelled',
    });
  }

  /**
   * Handle a `session.forceHandoff` event emitted by ContextBudgetService.
   *
   * I-6 gate: if `profile.autoHandoff = false` (default), emit `session.handoffPending`
   * and return — operator must confirm via Telegram/Web UI.
   * If `profile.autoHandoff = true`, proceed with graceful session end.
   *
   * I-1: ZERO LLM calls. Pure deterministic orchestration.
   * I-11: Every branch emits a log + (for the graceful path) an OTEL span event.
   */
  private async _handleForceHandoff(
    payload: SessionForceHandoffPayload,
  ): Promise<void> {
    const { sessionKey, projectId, currentTokens } = payload;

    // Find the active session entry for this sessionKey
    const state = this.active.get(sessionKey);
    if (!state) {
      this.logger.debug({
        msg: 'session-manager:force-handoff:session-not-active',
        sessionKey: redactSessionKey(sessionKey),
      });
      return;
    }

    // Resolve profile config — needed for autoHandoff flag + graceful-end settings
    const profile = projectId
      ? await this.registry.getProject(projectId)
      : undefined;
    const autoHandoff = profile?.autoHandoff ?? false;
    const gracefulEndTimeoutMs = profile?.gracefulEndTimeoutMs ?? 30_000;
    const sessionEndCommand = profile?.commands?.sessionEnd;

    // ── I-6 gate ────────────────────────────────────────────────────────────
    if (!autoHandoff) {
      // Notify operator; pause. No autonomous termination.
      this.logger.log({
        msg: 'session-manager:force-handoff:pending-operator-confirm',
        sessionKey: redactSessionKey(sessionKey),
        sessionId: state.id,
        currentTokens,
      });
      this.events.emit(EVENT_CHANNELS.session.handoffPending, {
        sessionKey,
        sessionId: state.id,
        projectId,
        currentTokens,
      });
      return;
    }

    // ── Autonomous graceful end (autoHandoff = true) ─────────────────────────
    await this._handleGracefulEnd(
      sessionKey,
      state,
      sessionEndCommand,
      gracefulEndTimeoutMs,
    );
  }

  /**
   * Handle a `tool.denied` event emitted by HooksService (Phase 5.3.5 — SC-12).
   *
   * I-11: records a log entry + OTEL span event (no silent state transitions).
   * Karpathy P3: minimum subscriber pattern — does NOT refactor session lifecycle.
   *
   * The actual gate (suppressing writeStdin) is enforced by the hook deny path:
   * when the Claude Code CLI's permission model returns `decision=deny`, the
   * hook fires BEFORE the tool executes, so the tool never runs. The daemon's
   * role here is to record the denial (log + span) so it is observable in
   * telemetry and session logs — not to add a parallel stdin-suppression gate.
   *
   * I-8 (idempotent): uses existing dedup in HooksService — this handler is
   * only called after a deduplicated ToolDenied event, never for duplicates.
   */
  private _handleToolDenied(payload: {
    sessionId: string;
    toolName: string;
    message: string | undefined;
  }): void {
    const { sessionId, toolName, message } = payload;

    this.logger.log({
      msg: '[hook-deny] tool denied by hook permission gate',
      sessionId,
      tool: toolName,
      ...(message !== undefined ? { hookMessage: message } : {}),
    });

    // I-11: OTEL span event for observability (no state transition needed).
    void this.tracing.withSpan('session.tool.denied', (span) => {
      span.setAttribute('session.id', sessionId);
      span.setAttribute('tool.name', toolName);
      if (message !== undefined) {
        span.setAttribute('tool.deny_message', message);
      }
      span.addEvent('session.tool.denied', {
        sessionId,
        toolName,
        ...(message !== undefined ? { message } : {}),
      });
      return Promise.resolve();
    });
  }

  /**
   * Perform the graceful session end sequence (Task 3.3).
   *
   * 1. Transition DB state to `Ending` (I-11: log + OTEL span).
   * 2. Write slash-command to stdin if `sessionEndCommand` is configured.
   * 3. Wait up to `gracefulEndTimeoutMs` for process to exit (stdout drain).
   * 4. On natural exit → state `Ended` with reason `CONTEXT_FULL`.
   * 5. On timeout → `adapter.terminate()` (SIGTERM → 5s → SIGKILL) → state `Ended`
   *    with reason `CONTEXT_FULL_FORCED`.
   * 6. Emit `session.ended` SSE event with `reason` field.
   *
   * I-11: both ENDING entry and terminal-state exit emit log + OTEL span attribute.
   * I-1:  no LLM calls.
   */
  private async _handleGracefulEnd(
    sessionKey: string,
    state: ActiveSessionState,
    sessionEndCommand: string | undefined,
    gracefulEndTimeoutMs: number,
  ): Promise<void> {
    // Guard against double-invocation (e.g. two force-handoff events).
    if (state.terminating) {
      this.logger.debug({
        msg: 'session-manager:graceful-end:already-terminating',
        sessionKey: redactSessionKey(sessionKey),
      });
      return;
    }
    // Mark as terminating immediately to prevent double-emit from normal completion.
    state.terminating = true;

    // ── Transition to Ending ──────────────────────────────────────────────────
    // I-11: state transition emits log + updates DB. OTEL span attribute added below.
    this.logger.log({
      msg: 'transition:ENDING',
      sessionKey: redactSessionKey(sessionKey),
      sessionId: state.id,
    });

    await this.tracing.withSpan('session.graceful-end', async (span) => {
      // I-11: record session key on span (redacted per Task 3.0 carryover fix)
      span.setAttribute('session.key', redactSessionKey(sessionKey));

      // Update DB to Ending state (I-11)
      try {
        await this.store.updateSession(state.id, {
          state: SessionState.Ending,
          endReason: 'graceful_end_in_progress',
        });
      } catch (dbErr) {
        // Non-fatal — continue with graceful end even if DB update fails
        this.logger.warn({
          msg: 'session-manager:graceful-end:db-update-failed',
          sessionId: state.id,
          error: String(dbErr),
        });
      }

      // ── Write slash-command if configured ─────────────────────────────────
      if (sessionEndCommand) {
        this.logger.log({
          msg: 'session-manager:graceful-end:writing-command',
          sessionKey: redactSessionKey(sessionKey),
          command: sessionEndCommand,
        });
        await this.adapter.writeStdin(state.handle, sessionEndCommand + '\n');
      } else {
        this.logger.debug({
          msg: 'session-manager:graceful-end:no-command-configured',
          sessionKey: redactSessionKey(sessionKey),
        });
      }

      // ── Wait for natural exit or timeout ──────────────────────────────────
      let timedOut = false;
      const exitPromise = new Promise<void>((resolve) => {
        state.gracefulEndResolve = resolve;
      });

      await Promise.race([
        exitPromise,
        new Promise<void>((resolve) => {
          setTimeout(() => {
            timedOut = true;
            resolve();
          }, gracefulEndTimeoutMs);
        }),
      ]);

      // Clear the resolver reference (may have already been cleared by drain handler)
      state.gracefulEndResolve = null;

      // ── Determine outcome ─────────────────────────────────────────────────
      const reason: string = timedOut
        ? EndedReason.ContextFullForced
        : EndedReason.ContextFull;

      // I-11: record outcome on OTEL span
      span.setAttribute('session.graceful_end_reason', reason);

      if (timedOut) {
        this.logger.warn({
          msg: 'transition:graceful-end:timeout-escalate',
          sessionKey: redactSessionKey(sessionKey),
          gracefulEndTimeoutMs,
        });
        // SIGTERM → 5s → SIGKILL (adapter.terminate handles the escalation)
        await this.adapter.terminate(state.handle, 'context_full');
      } else {
        this.logger.log({
          msg: 'transition:graceful-end:hook-fired',
          sessionKey: redactSessionKey(sessionKey),
        });
      }

      // ── Final state update + event emission (I-11) ───────────────────────
      await this.store.releaseSessionLock(sessionKey, LOCK_OWNER);

      try {
        const endedSession = await this.store.updateSession(state.id, {
          state: SessionState.Ended,
          endedAt: new Date(),
          endReason: reason,
        });
        // Emit session.ended SSE with reason field (spec requirement)
        this.events.emit(EVENT_CHANNELS.session.ended, {
          session: endedSession,
          endReason: reason,
        });
        this.logger.log({
          msg: `transition:ENDED`,
          sessionKey: redactSessionKey(sessionKey),
          sessionId: state.id,
          reason,
        });
      } catch (err) {
        this.logger.error({
          msg: 'session-manager:graceful-end:final-update-failed',
          sessionId: state.id,
          error: String(err),
        });
      }

      this._resultBoxes.set(sessionKey, {
        sessionId: state.id,
        status: 'ended',
      });

      // Remove from active map
      this.active.delete(sessionKey);
    });
  }
}
