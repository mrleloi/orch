/**
 * Pure session state machine for Orch.
 *
 * `transition(state, event) => SessionState` is the heart of the hooks receiver (Task 1.10).
 * Being a pure function makes it trivially testable and provably deterministic — no
 * side effects, no async, no dependency injection required.
 *
 * Design source: Claude-Code-Agent-Monitor.md §3-4 + SYNTHESIS §D2.
 *
 * Critical invariant: ONLY `SessionEnd` drives a session to `Ended`.
 *                     `Stop` signals turn-end only; the session remains resumable.
 *
 * All invalid transitions throw `StateTransitionError` so callers can catch and log
 * without masking the bug (I-11 — no silent transitions).
 *
 * Dedup note (per I-8 + SYNTHESIS §D2):
 *   - Compaction entries: deterministic id `{sessionId}-compact-{uuid}` (handled upstream)
 *   - API error events: content-hash `type+message` dedup (handled upstream)
 *   - General events: 60s sliding window dedup (handled in HooksService)
 * The state machine itself does NOT dedup — it only transitions. Dedup lives in HooksService.
 */

import { SessionState } from './session.js';
import type { DomainEvent } from './events.js';
import { StateTransitionError } from './errors.js';

/**
 * Transition the session state based on an incoming domain event.
 *
 * Returns the new state (which may equal the current state for transient events
 * like PreCompact/PostCompact that do not change session state).
 *
 * Throws `StateTransitionError` for illegal transitions — never silently swallows them.
 *
 * @param state  Current session state
 * @param event  Incoming domain event (discriminated by `event.kind`)
 * @returns      Next session state
 */
export function transition(
  state: SessionState,
  event: DomainEvent,
): SessionState {
  switch (event.kind) {
    // ── SessionStart ──────────────────────────────────────────────────────
    case 'SessionStart': {
      // Reactivation: non-terminal event on a completed/ended session reactivates it.
      // Handles the case where a session record was marked completed but Claude Code
      // sent another hook (e.g. after import / session restore).
      if (state === SessionState.Ended || state === SessionState.Failed) {
        // Reactivation is only allowed from non-terminal-error states.
        // Ended (clean exit) can be reactivated; Failed cannot.
        if (state === SessionState.Failed) {
          throw new StateTransitionError(state, event.kind);
        }
        return SessionState.Running;
      }

      if (state === SessionState.Idle || state === SessionState.Starting) {
        return SessionState.Running;
      }

      if (state === SessionState.Running) {
        // Duplicate SessionStart — idempotent, stay Running.
        return SessionState.Running;
      }

      throw new StateTransitionError(state, event.kind);
    }

    // ── Stop ──────────────────────────────────────────────────────────────
    case 'Stop': {
      // Stop = user pressed Esc; turn ended but session is NOT terminated.
      // From Running or Stopping → Stopping (resumable).
      // From RateLimited → Stopping (user cancelled during rate-limit wait).
      if (
        state === SessionState.Running ||
        state === SessionState.Stopping ||
        state === SessionState.RateLimited ||
        state === SessionState.ContextFull
      ) {
        if (event.isError) {
          // Error stop from terminal-ish state — transition to Failed.
          return SessionState.Failed;
        }
        return SessionState.Stopping;
      }

      // Stop on Starting → return to Stopping (spawn was interrupted before first hook).
      if (state === SessionState.Starting) {
        return SessionState.Stopping;
      }

      throw new StateTransitionError(state, event.kind);
    }

    // ── SessionEnd ────────────────────────────────────────────────────────
    case 'SessionEnd': {
      // ONLY SessionEnd drives a session to Ended.
      // Any active or intermediate state can receive SessionEnd (process exited).
      if (
        state === SessionState.Running ||
        state === SessionState.Stopping ||
        state === SessionState.Starting ||
        state === SessionState.RateLimited ||
        state === SessionState.ContextFull ||
        state === SessionState.Idle
      ) {
        return SessionState.Ended;
      }

      if (state === SessionState.Ended) {
        // Duplicate SessionEnd — idempotent.
        return SessionState.Ended;
      }

      throw new StateTransitionError(state, event.kind);
    }

    // ── PreCompact / PostCompact ───────────────────────────────────────────
    case 'PreCompact':
    case 'PostCompact': {
      // Transient signal — no session state change (per Agent-Monitor §2).
      // Valid only while the session is Running (compaction requires active context).
      if (state === SessionState.Running) {
        return SessionState.Running;
      }

      throw new StateTransitionError(state, event.kind);
    }

    // ── PreToolUse / PostToolUse ───────────────────────────────────────────
    case 'PreToolUse':
    case 'PostToolUse': {
      // Tool events are valid while Running — agent state tracking lives in HooksService.
      if (state === SessionState.Running) {
        return SessionState.Running;
      }

      throw new StateTransitionError(state, event.kind);
    }

    // ── SubagentStop ──────────────────────────────────────────────────────
    case 'SubagentStop': {
      // Subagent completion — session stays active; only the subagent slot closes.
      if (state === SessionState.Running) {
        return SessionState.Running;
      }

      throw new StateTransitionError(state, event.kind);
    }

    // ── Notification ──────────────────────────────────────────────────────
    case 'Notification': {
      // Notifications are informational — no state change.
      if (
        state === SessionState.Running ||
        state === SessionState.Stopping ||
        state === SessionState.Starting
      ) {
        return state;
      }

      throw new StateTransitionError(state, event.kind);
    }

    // ── ApiError ──────────────────────────────────────────────────────────
    case 'ApiError': {
      // API errors are recorded for diagnostics — session stays in current state.
      // RateLimitDetected is the specific event that actually changes state.
      if (
        state === SessionState.Running ||
        state === SessionState.Starting ||
        state === SessionState.RateLimited
      ) {
        return state;
      }

      throw new StateTransitionError(state, event.kind);
    }

    // ── RateLimitDetected ─────────────────────────────────────────────────
    case 'RateLimitDetected': {
      // Running → RateLimited. Adapter handles ccs failover externally.
      if (state === SessionState.Running || state === SessionState.Starting) {
        return SessionState.RateLimited;
      }

      if (state === SessionState.RateLimited) {
        // Already rate-limited — idempotent.
        return SessionState.RateLimited;
      }

      throw new StateTransitionError(state, event.kind);
    }

    // ── HeartbeatTimeout ─────────────────────────────────────────────────
    case 'HeartbeatTimeout': {
      // Watchdog detected a hung process — transition to Failed.
      // Only applies while session is expected to be active.
      if (
        state === SessionState.Running ||
        state === SessionState.Starting ||
        state === SessionState.RateLimited
      ) {
        return SessionState.Failed;
      }

      throw new StateTransitionError(state, event.kind);
    }

    // ── UserPromptSubmit ──────────────────────────────────────────────────
    case 'UserPromptSubmit': {
      // Audit event — no state change. Valid in any active state.
      if (
        state === SessionState.Running ||
        state === SessionState.Stopping ||
        state === SessionState.Starting ||
        state === SessionState.Idle
      ) {
        return state;
      }

      throw new StateTransitionError(state, event.kind);
    }

    // ── ToolDenied ────────────────────────────────────────────────────────
    case 'ToolDenied': {
      // Phase 5.3.5 — SC-12. Hook permission gate denied a tool before it ran.
      // Transient event — no session state change. The denial is recorded in the
      // session log and emitted on tool.denied channel (SessionManager subscriber).
      if (state === SessionState.Running || state === SessionState.Starting) {
        return state;
      }

      throw new StateTransitionError(state, event.kind);
    }
  }
}

/**
 * Apply an event only if it would produce a valid transition.
 *
 * Returns `{ transitioned: true, nextState }` on success,
 * or `{ transitioned: false, reason }` when the transition is not valid
 * (instead of throwing — useful for swallowing out-of-order hook events gracefully).
 */
export function tryTransition(
  state: SessionState,
  event: DomainEvent,
):
  | { transitioned: true; nextState: SessionState }
  | { transitioned: false; reason: string } {
  try {
    const nextState = transition(state, event);
    return { transitioned: true, nextState };
  } catch (err) {
    const reason =
      err instanceof StateTransitionError
        ? err.message
        : `Unexpected error during transition: ${String(err)}`;
    return { transitioned: false, reason };
  }
}
