/**
 * Unit tests for the pure session state machine.
 *
 * Key invariant under test: ONLY SessionEnd drives a session to Ended.
 *                           Stop does NOT end the session.
 *
 * Test coverage:
 * - All valid transitions in the normal path
 * - Error branches (RateLimitDetected, HeartbeatTimeout)
 * - Stop-is-not-SessionEnd invariant
 * - Transient events (PreCompact, PostCompact, PreToolUse, PostToolUse)
 * - tryTransition convenience helper
 * - Illegal transitions throw StateTransitionError
 */

import { SessionState } from './session';
import { transition, tryTransition } from './state-machine';
import { StateTransitionError } from './errors';
import type {
  SessionStartEvent,
  StopEvent,
  SessionEndEvent,
  PreCompactEvent,
  PostCompactEvent,
  PreToolUseEvent,
  PostToolUseEvent,
  SubagentStopEvent,
  NotificationEvent,
  ApiErrorEvent,
  RateLimitDetectedEvent,
  HeartbeatTimeoutEvent,
  UserPromptSubmitEvent,
} from './events';

// ── Helpers ───────────────────────────────────────────────────────────────────

const BASE = { sessionId: 'sess-1', recordedAt: new Date().toISOString() };

function sessionStart(): SessionStartEvent {
  return { ...BASE, kind: 'SessionStart', claudeSessionId: 'claude-abc' };
}

function stop(isError = false): StopEvent {
  return { ...BASE, kind: 'Stop', isError };
}

function sessionEnd(endReason?: string): SessionEndEvent {
  return { ...BASE, kind: 'SessionEnd', endReason };
}

function preCompact(): PreCompactEvent {
  return { ...BASE, kind: 'PreCompact', compactUuid: 'uuid-1' };
}

function postCompact(): PostCompactEvent {
  return { ...BASE, kind: 'PostCompact', compactUuid: 'uuid-1' };
}

function preToolUse(isAgent = false): PreToolUseEvent {
  return { ...BASE, kind: 'PreToolUse', toolName: 'Bash', isAgent };
}

function postToolUse(isAgent = false): PostToolUseEvent {
  return { ...BASE, kind: 'PostToolUse', toolName: 'Bash', isAgent };
}

function subagentStop(): SubagentStopEvent {
  return { ...BASE, kind: 'SubagentStop', subagentId: 'sub-1' };
}

function notification(): NotificationEvent {
  return { ...BASE, kind: 'Notification', message: 'compaction complete' };
}

function apiError(): ApiErrorEvent {
  return { ...BASE, kind: 'ApiError', errorType: 'overloaded_error', errorMessage: 'too busy' };
}

function rateLimitDetected(): RateLimitDetectedEvent {
  return { ...BASE, kind: 'RateLimitDetected', retryAfterSecs: 60 };
}

function heartbeatTimeout(): HeartbeatTimeoutEvent {
  return { ...BASE, kind: 'HeartbeatTimeout', heartbeatAgeMs: 120_000 };
}

function userPromptSubmit(): UserPromptSubmitEvent {
  return { ...BASE, kind: 'UserPromptSubmit', promptText: 'do the thing' };
}

// ── SessionStart ──────────────────────────────────────────────────────────────

describe('transition: SessionStart', () => {
  it('Idle → Running', () => {
    expect(transition(SessionState.Idle, sessionStart())).toBe(SessionState.Running);
  });

  it('Starting → Running', () => {
    expect(transition(SessionState.Starting, sessionStart())).toBe(SessionState.Running);
  });

  it('Running → Running (duplicate, idempotent)', () => {
    expect(transition(SessionState.Running, sessionStart())).toBe(SessionState.Running);
  });

  it('Ended → Running (reactivation)', () => {
    expect(transition(SessionState.Ended, sessionStart())).toBe(SessionState.Running);
  });

  it('Failed throws (no reactivation from Failed)', () => {
    expect(() => transition(SessionState.Failed, sessionStart())).toThrow(StateTransitionError);
  });

  it('throws from Stopping', () => {
    expect(() => transition(SessionState.Stopping, sessionStart())).toThrow(StateTransitionError);
  });
});

// ── Stop — CRITICAL: must NOT end the session ─────────────────────────────────

describe('transition: Stop (CRITICAL: not SessionEnd)', () => {
  it('Running → Stopping (NOT Ended)', () => {
    const next = transition(SessionState.Running, stop());
    expect(next).toBe(SessionState.Stopping);
    expect(next).not.toBe(SessionState.Ended);
  });

  it('Stopping → Stopping (already stopped, idempotent)', () => {
    expect(transition(SessionState.Stopping, stop())).toBe(SessionState.Stopping);
  });

  it('RateLimited → Stopping', () => {
    expect(transition(SessionState.RateLimited, stop())).toBe(SessionState.Stopping);
  });

  it('ContextFull → Stopping', () => {
    expect(transition(SessionState.ContextFull, stop())).toBe(SessionState.Stopping);
  });

  it('Starting → Stopping (spawn interrupted)', () => {
    expect(transition(SessionState.Starting, stop())).toBe(SessionState.Stopping);
  });

  it('Running + isError=true → Failed', () => {
    expect(transition(SessionState.Running, stop(true))).toBe(SessionState.Failed);
  });

  it('Idle throws (session was never started)', () => {
    expect(() => transition(SessionState.Idle, stop())).toThrow(StateTransitionError);
  });
});

// ── SessionEnd — the ONLY terminal driver ────────────────────────────────────

describe('transition: SessionEnd', () => {
  it('Running → Ended', () => {
    expect(transition(SessionState.Running, sessionEnd())).toBe(SessionState.Ended);
  });

  it('Stopping → Ended', () => {
    expect(transition(SessionState.Stopping, sessionEnd())).toBe(SessionState.Ended);
  });

  it('Starting → Ended (spawn never completed)', () => {
    expect(transition(SessionState.Starting, sessionEnd())).toBe(SessionState.Ended);
  });

  it('RateLimited → Ended', () => {
    expect(transition(SessionState.RateLimited, sessionEnd())).toBe(SessionState.Ended);
  });

  it('ContextFull → Ended', () => {
    expect(transition(SessionState.ContextFull, sessionEnd())).toBe(SessionState.Ended);
  });

  it('Idle → Ended (process exited before hooks arrived)', () => {
    expect(transition(SessionState.Idle, sessionEnd())).toBe(SessionState.Ended);
  });

  it('Ended → Ended (duplicate, idempotent)', () => {
    expect(transition(SessionState.Ended, sessionEnd())).toBe(SessionState.Ended);
  });

  it('Failed throws (already terminal via different path)', () => {
    expect(() => transition(SessionState.Failed, sessionEnd())).toThrow(StateTransitionError);
  });
});

// ── Transient events (no state change) ───────────────────────────────────────

describe('transition: PreCompact / PostCompact', () => {
  it('Running → Running (transient, no state change)', () => {
    expect(transition(SessionState.Running, preCompact())).toBe(SessionState.Running);
    expect(transition(SessionState.Running, postCompact())).toBe(SessionState.Running);
  });

  it('throws from Idle (not running)', () => {
    expect(() => transition(SessionState.Idle, preCompact())).toThrow(StateTransitionError);
    expect(() => transition(SessionState.Idle, postCompact())).toThrow(StateTransitionError);
  });

  it('throws from Stopping', () => {
    expect(() => transition(SessionState.Stopping, preCompact())).toThrow(StateTransitionError);
  });
});

describe('transition: PreToolUse / PostToolUse', () => {
  it('Running → Running', () => {
    expect(transition(SessionState.Running, preToolUse())).toBe(SessionState.Running);
    expect(transition(SessionState.Running, postToolUse())).toBe(SessionState.Running);
    expect(transition(SessionState.Running, preToolUse(true))).toBe(SessionState.Running);
    expect(transition(SessionState.Running, postToolUse(true))).toBe(SessionState.Running);
  });

  it('throws from Idle', () => {
    expect(() => transition(SessionState.Idle, preToolUse())).toThrow(StateTransitionError);
  });
});

describe('transition: SubagentStop', () => {
  it('Running → Running (subagent done, session continues)', () => {
    expect(transition(SessionState.Running, subagentStop())).toBe(SessionState.Running);
  });

  it('throws from Idle', () => {
    expect(() => transition(SessionState.Idle, subagentStop())).toThrow(StateTransitionError);
  });
});

describe('transition: Notification', () => {
  it('Running → Running', () => {
    expect(transition(SessionState.Running, notification())).toBe(SessionState.Running);
  });

  it('Stopping → Stopping', () => {
    expect(transition(SessionState.Stopping, notification())).toBe(SessionState.Stopping);
  });

  it('Starting → Starting', () => {
    expect(transition(SessionState.Starting, notification())).toBe(SessionState.Starting);
  });

  it('throws from Idle', () => {
    expect(() => transition(SessionState.Idle, notification())).toThrow(StateTransitionError);
  });
});

// ── Error branches ────────────────────────────────────────────────────────────

describe('transition: ApiError', () => {
  it('Running → Running (recorded but no state change)', () => {
    expect(transition(SessionState.Running, apiError())).toBe(SessionState.Running);
  });

  it('RateLimited → RateLimited', () => {
    expect(transition(SessionState.RateLimited, apiError())).toBe(SessionState.RateLimited);
  });

  it('throws from Stopping', () => {
    expect(() => transition(SessionState.Stopping, apiError())).toThrow(StateTransitionError);
  });
});

describe('transition: RateLimitDetected', () => {
  it('Running → RateLimited', () => {
    expect(transition(SessionState.Running, rateLimitDetected())).toBe(SessionState.RateLimited);
  });

  it('Starting → RateLimited', () => {
    expect(transition(SessionState.Starting, rateLimitDetected())).toBe(SessionState.RateLimited);
  });

  it('RateLimited → RateLimited (idempotent)', () => {
    expect(transition(SessionState.RateLimited, rateLimitDetected())).toBe(SessionState.RateLimited);
  });

  it('throws from Stopping', () => {
    expect(() => transition(SessionState.Stopping, rateLimitDetected())).toThrow(StateTransitionError);
  });
});

describe('transition: HeartbeatTimeout', () => {
  it('Running → Failed', () => {
    expect(transition(SessionState.Running, heartbeatTimeout())).toBe(SessionState.Failed);
  });

  it('Starting → Failed', () => {
    expect(transition(SessionState.Starting, heartbeatTimeout())).toBe(SessionState.Failed);
  });

  it('RateLimited → Failed', () => {
    expect(transition(SessionState.RateLimited, heartbeatTimeout())).toBe(SessionState.Failed);
  });

  it('throws from Stopping', () => {
    expect(() => transition(SessionState.Stopping, heartbeatTimeout())).toThrow(StateTransitionError);
  });

  it('throws from Idle', () => {
    expect(() => transition(SessionState.Idle, heartbeatTimeout())).toThrow(StateTransitionError);
  });
});

describe('transition: UserPromptSubmit', () => {
  it('Running → Running (audit only)', () => {
    expect(transition(SessionState.Running, userPromptSubmit())).toBe(SessionState.Running);
  });

  it('Idle → Idle', () => {
    expect(transition(SessionState.Idle, userPromptSubmit())).toBe(SessionState.Idle);
  });

  it('throws from RateLimited', () => {
    expect(() => transition(SessionState.RateLimited, userPromptSubmit())).toThrow(StateTransitionError);
  });
});

// ── tryTransition ─────────────────────────────────────────────────────────────

describe('tryTransition', () => {
  it('returns { transitioned: true, nextState } on valid transition', () => {
    const result = tryTransition(SessionState.Running, sessionEnd());
    expect(result.transitioned).toBe(true);
    if (!result.transitioned) return;
    expect(result.nextState).toBe(SessionState.Ended);
  });

  it('returns { transitioned: false, reason } on invalid transition', () => {
    const result = tryTransition(SessionState.Idle, stop());
    expect(result.transitioned).toBe(false);
    if (result.transitioned) return;
    expect(typeof result.reason).toBe('string');
    expect(result.reason.length).toBeGreaterThan(0);
  });

  it('does not throw', () => {
    expect(() => tryTransition(SessionState.Idle, stop())).not.toThrow();
  });

  it('reason mentions the state and event', () => {
    const result = tryTransition(SessionState.Idle, stop());
    if (result.transitioned) return;
    expect(result.reason).toMatch(/Idle/);
    expect(result.reason).toMatch(/Stop/);
  });
});

// ── Critical invariant: Stop ≠ SessionEnd ────────────────────────────────────

describe('INVARIANT: Stop does not end the session', () => {
  it('Stop from Running results in Stopping, not Ended', () => {
    const next = transition(SessionState.Running, stop());
    expect(next).toBe(SessionState.Stopping);
    expect(next).not.toBe(SessionState.Ended);
    expect(next).not.toBe(SessionState.Failed);
  });

  it('SessionEnd from Running results in Ended', () => {
    const next = transition(SessionState.Running, sessionEnd());
    expect(next).toBe(SessionState.Ended);
  });

  it('Stop then SessionEnd correctly goes Stopping → Ended', () => {
    const afterStop = transition(SessionState.Running, stop());
    expect(afterStop).toBe(SessionState.Stopping);

    const afterEnd = transition(afterStop, sessionEnd());
    expect(afterEnd).toBe(SessionState.Ended);
  });
});
