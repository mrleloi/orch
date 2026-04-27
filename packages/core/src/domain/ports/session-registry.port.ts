/**
 * ISessionRegistry — DI port for reading active sessions.
 *
 * AgentWatchdog reads the minimal watchdog view of active sessions through this
 * interface rather than depending on SessionManager directly, enforcing a
 * read-only, narrow contract.
 *
 * Concrete implementation will be provided by SessionManager (Task 1.9d).
 *
 * I-14: Pure TypeScript — zero @nestjs/* imports.
 */

import type { WatchdogSession } from '../watchdog/decide-action.js';

/** Injection token for ISessionRegistry. */
export const SESSION_REGISTRY = Symbol('ISessionRegistry');

/**
 * Read-only view of active (non-terminal) sessions for watchdog use.
 *
 * Implementors MUST:
 * - Return only sessions in non-terminal states.
 * - Return a snapshot that is safe to iterate (won't change mid-loop).
 * - Exclude sessions that have already been terminated.
 *
 * Time-field conversion (critical for SessionManager implementors):
 * - `WatchdogSession.startedAt` is `number` (epoch milliseconds), while the
 *   domain `Session.startedAt` is `Date | undefined`. Implementors MUST
 *   convert via `session.startedAt.getTime()`.
 * - When `Session.startedAt` is `undefined` (session has not yet transitioned
 *   out of the initial Created state), fall back to `session.createdAt.getTime()`.
 *   Never pass `undefined.getTime()` — it throws at runtime.
 * - `WatchdogSession.lastHeartbeatAt` is `number | null`; derive from the most
 *   recent hook-event timestamp for the session, or `null` if none received yet.
 */
export interface ISessionRegistry {
  /**
   * Return a snapshot of all currently active (non-terminal) sessions.
   *
   * The returned array is a read-only view — callers MUST NOT mutate it.
   * Modifications are a no-op at the type level and may cause undefined
   * behaviour at runtime if the implementor returns a live array.
   *
   * See the interface-level docstring for the `Date → number` conversion
   * contract that all implementors must honour.
   */
  getActive(): readonly WatchdogSession[];
}
