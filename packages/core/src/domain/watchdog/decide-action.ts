/**
 * decideAction — pure function for watchdog stuck-session detection.
 *
 * Two-tier decision tree ported from nanoclaw src/host-sweep.ts lines 70-106
 * (BORROW-2 / SYNTHESIS §D13).
 *
 * I-1:  Zero LLM calls. Deterministic pure function.
 * I-14: ZERO @nestjs/* imports. Lives under domain/watchdog/ to enforce this.
 *
 * Decision precedence (top wins):
 *  1. now - startedAt > absoluteCeiling         → hard-kill  (ceiling always wins)
 *  2. null heartbeat + now - startedAt > timeout → soft-warn  (never heartbeated)
 *  3. heartbeat age > timeout + softWarnGrace    → hard-kill  (warned, still stuck)
 *  4. heartbeat age > timeout                    → soft-warn
 *  5. otherwise                                  → ok
 */

import type { SessionState } from '../session.js';

// ── Public types ────────────────────────────────────────────────────────────────

export type WatchdogAction = 'ok' | 'soft-warn' | 'hard-kill';

export interface WatchdogSession {
  id: string;
  /** Current session lifecycle state (used by callers to skip terminal sessions). */
  state: SessionState;
  /** When the session was created / spawned — epoch ms. */
  startedAt: number;
  /**
   * Last hook-event / heartbeat timestamp — epoch ms.
   * Null when no heartbeat has ever been received for this session.
   */
  lastHeartbeatAt: number | null;
}

export interface DecideActionInput {
  session: WatchdogSession;
  /** Current wall-clock epoch ms — injected for testability (I-13). */
  now: number;
  /**
   * Inactivity threshold in ms.
   * If no heartbeat arrives within this window, emit a soft-warn.
   * Default suggestion: 180_000 (3 minutes).
   */
  heartbeatTimeoutMs: number;
  /**
   * Absolute session-age ceiling in ms.
   * Any session older than this is hard-killed regardless of heartbeat activity.
   * Default suggestion: 1_800_000 (30 minutes).
   */
  absoluteCeilingMs: number;
  /**
   * Grace period after a soft-warn before escalating to hard-kill (ms).
   * Session must recover (new heartbeat) within heartbeatTimeoutMs + softWarnGraceMs
   * from the last heartbeat to avoid hard-kill.
   * Default suggestion: 60_000 (1 minute).
   */
  softWarnGraceMs: number;
}

// ── Pure function ───────────────────────────────────────────────────────────────

/**
 * Decide what action the watchdog should take for a single session.
 *
 * Pure: no I/O, no side-effects, no `this`. Fully deterministic given inputs.
 * Testable without any framework or timer setup (pass `now` explicitly).
 */
export function decideAction(input: DecideActionInput): WatchdogAction {
  const {
    session,
    now,
    heartbeatTimeoutMs,
    absoluteCeilingMs,
    softWarnGraceMs,
  } = input;

  const sessionAge = now - session.startedAt;

  // Rule 1: Absolute ceiling always wins — no session may run forever.
  if (sessionAge > absoluteCeilingMs) {
    return 'hard-kill';
  }

  if (session.lastHeartbeatAt === null) {
    // Rule 2: Session has never heartbeated — soft-warn once timeout elapses.
    if (sessionAge > heartbeatTimeoutMs) {
      return 'soft-warn';
    }
    return 'ok';
  }

  // Rules 3 & 4: Session has heartbeated at some point.
  const heartbeatAge = now - session.lastHeartbeatAt;

  // Rule 3: Past warn threshold AND grace window — hard-kill (stuck after warn).
  if (heartbeatAge > heartbeatTimeoutMs + softWarnGraceMs) {
    return 'hard-kill';
  }

  // Rule 4: Past warn threshold but still inside grace window — soft-warn.
  if (heartbeatAge > heartbeatTimeoutMs) {
    return 'soft-warn';
  }

  // Rule 5: All thresholds satisfied — session is healthy.
  return 'ok';
}
