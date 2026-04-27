/**
 * Unit tests for the decideAction pure function.
 *
 * I-13: Fully deterministic — all time values are explicit inputs.
 *       No real timers, no wall-clock, no jest.useFakeTimers() needed
 *       (the function itself has no timers; just inject `now`).
 *
 * Coverage target: 100% branch on decideAction (5 decision branches).
 * Boundary cases cover the ≤ vs < semantics at each threshold.
 */

import { decideAction } from './decide-action.js';
import type { DecideActionInput, WatchdogAction } from './decide-action.js';
import { SessionState } from '../session.js';

// ── Shared fixtures ──────────────────────────────────────────────────────────

const START = 1_000_000; // epoch ms — arbitrary base
const HEARTBEAT_TIMEOUT = 180_000; // 3 min
const ABSOLUTE_CEILING = 1_800_000; // 30 min
const SOFT_WARN_GRACE = 60_000; // 1 min

function makeInput(
  overrides: Partial<DecideActionInput> & {
    session?: Partial<DecideActionInput['session']>;
  } = {},
): DecideActionInput {
  const sessionOverrides = overrides.session ?? {};
  return {
    session: {
      id: 'sess-1',
      state: SessionState.Running,
      startedAt: START,
      lastHeartbeatAt: null,
      ...sessionOverrides,
    },
    now: START + 1_000, // 1 second in — fresh by default
    heartbeatTimeoutMs: HEARTBEAT_TIMEOUT,
    absoluteCeilingMs: ABSOLUTE_CEILING,
    softWarnGraceMs: SOFT_WARN_GRACE,
    ...overrides,
    // session must not be spread again after overrides
    session: {
      id: 'sess-1',
      state: SessionState.Running,
      startedAt: START,
      lastHeartbeatAt: null,
      ...sessionOverrides,
    },
  };
}

// ── Table-driven cases ───────────────────────────────────────────────────────

interface TestRow {
  label: string;
  input: DecideActionInput;
  expected: WatchdogAction;
}

const TABLE: TestRow[] = [
  // ── ok cases ──────────────────────────────────────────────────────────────

  {
    label: 'ok: fresh session, no heartbeat yet, within timeout',
    input: makeInput({ now: START + 1_000 }),
    expected: 'ok',
  },
  {
    label: 'ok: session with recent heartbeat, well within timeout',
    input: makeInput({
      now: START + HEARTBEAT_TIMEOUT - 1,
      session: { lastHeartbeatAt: START + HEARTBEAT_TIMEOUT - 2 },
    }),
    expected: 'ok',
  },
  {
    label: 'ok: heartbeat age exactly at timeout (not > timeout, boundary)',
    input: makeInput({
      now: START + HEARTBEAT_TIMEOUT * 2,
      session: { lastHeartbeatAt: START + HEARTBEAT_TIMEOUT },
      // heartbeatAge = HEARTBEAT_TIMEOUT exactly — NOT > so still ok
    }),
    expected: 'ok',
  },
  {
    label: 'ok: no heartbeat, session age exactly at timeout (not > timeout)',
    input: makeInput({
      now: START + HEARTBEAT_TIMEOUT,
      // sessionAge = HEARTBEAT_TIMEOUT exactly — NOT > so still ok
    }),
    expected: 'ok',
  },

  // ── soft-warn: null heartbeat path ────────────────────────────────────────

  {
    label: 'soft-warn: no heartbeat ever, session age just past timeout',
    input: makeInput({ now: START + HEARTBEAT_TIMEOUT + 1 }),
    expected: 'soft-warn',
  },
  {
    label: 'soft-warn: no heartbeat, session age halfway to ceiling',
    input: makeInput({ now: START + ABSOLUTE_CEILING / 2 }),
    expected: 'soft-warn',
  },

  // ── soft-warn: non-null heartbeat path ───────────────────────────────────

  {
    label: 'soft-warn: heartbeat age just past timeout (within grace)',
    input: makeInput({
      now: START + HEARTBEAT_TIMEOUT * 2 + 1,
      session: { lastHeartbeatAt: START + HEARTBEAT_TIMEOUT },
      // heartbeatAge = HEARTBEAT_TIMEOUT + 1 > HEARTBEAT_TIMEOUT → soft-warn
      // but < HEARTBEAT_TIMEOUT + SOFT_WARN_GRACE → not hard-kill yet
    }),
    expected: 'soft-warn',
  },
  {
    label: 'soft-warn: heartbeat age = timeout + grace (boundary — not > sum)',
    input: makeInput({
      now: START + HEARTBEAT_TIMEOUT + SOFT_WARN_GRACE,
      session: { lastHeartbeatAt: START },
      // heartbeatAge = HEARTBEAT_TIMEOUT + SOFT_WARN_GRACE exactly — NOT > sum
    }),
    expected: 'soft-warn',
  },

  // ── hard-kill: absolute ceiling ───────────────────────────────────────────

  {
    label: 'hard-kill: session age just past absolute ceiling',
    input: makeInput({
      now: START + ABSOLUTE_CEILING + 1,
      session: { lastHeartbeatAt: START + ABSOLUTE_CEILING }, // recent heartbeat — ceiling still wins
    }),
    expected: 'hard-kill',
  },
  {
    label: 'hard-kill: ceiling exactly reached (not > so soft-warn applies)',
    // sessionAge = ABSOLUTE_CEILING exactly → NOT > ceiling, but no heartbeat → soft-warn
    input: makeInput({ now: START + ABSOLUTE_CEILING }),
    expected: 'soft-warn', // ceiling is > not >=, and timeout also triggers
  },
  {
    label: 'hard-kill: ceiling exceeded even with fresh heartbeat',
    input: makeInput({
      now: START + ABSOLUTE_CEILING + 10_000,
      session: {
        lastHeartbeatAt: START + ABSOLUTE_CEILING + 9_000, // 1 second ago
      },
    }),
    expected: 'hard-kill',
  },

  // ── hard-kill: stuck after warn ───────────────────────────────────────────

  {
    label: 'hard-kill: heartbeat age past timeout + grace',
    input: makeInput({
      now: START + HEARTBEAT_TIMEOUT + SOFT_WARN_GRACE + 1,
      session: { lastHeartbeatAt: START },
      // heartbeatAge = HEARTBEAT_TIMEOUT + SOFT_WARN_GRACE + 1 > sum → hard-kill
    }),
    expected: 'hard-kill',
  },
  {
    label: 'hard-kill: very old heartbeat, far past warn + grace',
    input: makeInput({
      now: START + HEARTBEAT_TIMEOUT * 3,
      session: { lastHeartbeatAt: START },
    }),
    expected: 'hard-kill',
  },
];

// ── Run table ────────────────────────────────────────────────────────────────

describe('decideAction — table-driven', () => {
  it.each(TABLE)('$label', ({ input, expected }) => {
    expect(decideAction(input)).toBe(expected);
  });
});

// ── Explicit boundary / edge tests ───────────────────────────────────────────

describe('decideAction — boundary cases', () => {
  it('returns ok when session is brand new (now === startedAt)', () => {
    const input = makeInput({ now: START });
    expect(decideAction(input)).toBe('ok');
  });

  it('hard-kill wins over soft-warn even when heartbeat just recovered', () => {
    // Session is past ceiling but has a heartbeat 1ms ago
    const input = makeInput({
      now: START + ABSOLUTE_CEILING + 500,
      session: { lastHeartbeatAt: START + ABSOLUTE_CEILING + 499 },
    });
    expect(decideAction(input)).toBe('hard-kill');
  });

  it('null lastHeartbeatAt: returns ok when sessionAge exactly equals timeout', () => {
    const input = makeInput({ now: START + HEARTBEAT_TIMEOUT });
    // sessionAge = HEARTBEAT_TIMEOUT, rule is >, not >= → ok
    expect(decideAction(input)).toBe('ok');
  });

  it('non-null lastHeartbeatAt: returns ok when heartbeatAge exactly equals timeout', () => {
    const input = makeInput({
      now: START + HEARTBEAT_TIMEOUT * 2,
      session: { lastHeartbeatAt: START + HEARTBEAT_TIMEOUT },
    });
    // heartbeatAge = HEARTBEAT_TIMEOUT exactly, rule is >, not >= → ok
    expect(decideAction(input)).toBe('ok');
  });

  it('hard-kill boundary: heartbeat age exactly at timeout + grace is soft-warn', () => {
    const input = makeInput({
      now: START + HEARTBEAT_TIMEOUT + SOFT_WARN_GRACE,
      session: { lastHeartbeatAt: START },
    });
    // heartbeatAge = timeout + grace exactly — NOT > sum → soft-warn not hard-kill
    expect(decideAction(input)).toBe('soft-warn');
  });

  it('hard-kill boundary: heartbeat age 1ms past timeout + grace is hard-kill', () => {
    const input = makeInput({
      now: START + HEARTBEAT_TIMEOUT + SOFT_WARN_GRACE + 1,
      session: { lastHeartbeatAt: START },
    });
    expect(decideAction(input)).toBe('hard-kill');
  });

  it('uses session state field without affecting decision (state is informational)', () => {
    // decideAction does not gate on state — that's the caller's responsibility
    const idleSession = makeInput({
      now: START + HEARTBEAT_TIMEOUT + 1,
      session: { state: SessionState.Idle },
    });
    const runningSession = makeInput({
      now: START + HEARTBEAT_TIMEOUT + 1,
      session: { state: SessionState.Running },
    });
    // Both should produce same result regardless of state
    expect(decideAction(idleSession)).toBe(decideAction(runningSession));
  });
});
