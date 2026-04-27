/**
 * ISessionTerminator — DI port for session termination.
 *
 * AgentWatchdog depends on this interface rather than SessionManager directly,
 * keeping the watchdog decoupled from the orchestrator's internals.
 *
 * Concrete implementation will be provided by SessionManager (Task 1.9d).
 *
 * I-14: Pure TypeScript — zero @nestjs/* imports.
 */

/** Injection token for ISessionTerminator. */
export const SESSION_TERMINATOR = Symbol('ISessionTerminator');

/**
 * Minimal port for terminating an active Claude Code session.
 *
 * Implementors MUST:
 * - Kill the underlying subprocess gracefully (SIGTERM → SIGKILL).
 * - Transition session state to Failed with the supplied reason.
 * - Emit appropriate events (session.failed or session.ended).
 * - NOT throw if the session has already ended (idempotent).
 */
export interface ISessionTerminator {
  /**
   * Terminate the session identified by `sessionId`.
   *
   * @param sessionId  Orch-internal session ID (not the Claude session ID).
   * @param reason     Human-readable reason string — stored on the session record.
   */
  terminate(sessionId: string, reason: string): Promise<void>;
}
