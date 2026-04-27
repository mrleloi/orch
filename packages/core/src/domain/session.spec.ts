/**
 * Unit tests for Session entity.
 */

import {
  SessionState,
  SESSION_TERMINAL_STATES,
  isSessionTerminal,
} from './session';

describe('SessionState', () => {
  it('defines all expected states', () => {
    expect(SessionState.Idle).toBe('Idle');
    expect(SessionState.Starting).toBe('Starting');
    expect(SessionState.Running).toBe('Running');
    expect(SessionState.Stopping).toBe('Stopping');
    expect(SessionState.Ended).toBe('Ended');
    expect(SessionState.Failed).toBe('Failed');
    expect(SessionState.RateLimited).toBe('RateLimited');
    expect(SessionState.ContextFull).toBe('ContextFull');
  });

  it('has exactly 9 states (Task 3.3 added Ending)', () => {
    // Task 3.3 added SessionState.Ending for graceful context-full termination.
    expect(SessionState.Ending).toBe('Ending');
    expect(Object.keys(SessionState)).toHaveLength(9);
  });
});

describe('SESSION_TERMINAL_STATES', () => {
  it('includes Ended', () => {
    expect(SESSION_TERMINAL_STATES.has(SessionState.Ended)).toBe(true);
  });

  it('includes Failed', () => {
    expect(SESSION_TERMINAL_STATES.has(SessionState.Failed)).toBe(true);
  });

  it('does not include Running', () => {
    expect(SESSION_TERMINAL_STATES.has(SessionState.Running)).toBe(false);
  });

  it('does not include RateLimited', () => {
    expect(SESSION_TERMINAL_STATES.has(SessionState.RateLimited)).toBe(false);
  });

  it('does not include Stopping', () => {
    expect(SESSION_TERMINAL_STATES.has(SessionState.Stopping)).toBe(false);
  });
});

describe('isSessionTerminal', () => {
  it('returns true for Ended', () => {
    expect(isSessionTerminal(SessionState.Ended)).toBe(true);
  });

  it('returns true for Failed', () => {
    expect(isSessionTerminal(SessionState.Failed)).toBe(true);
  });

  it('returns false for Idle', () => {
    expect(isSessionTerminal(SessionState.Idle)).toBe(false);
  });

  it('returns false for Starting', () => {
    expect(isSessionTerminal(SessionState.Starting)).toBe(false);
  });

  it('returns false for Running', () => {
    expect(isSessionTerminal(SessionState.Running)).toBe(false);
  });

  it('returns false for Stopping', () => {
    expect(isSessionTerminal(SessionState.Stopping)).toBe(false);
  });

  it('returns false for RateLimited', () => {
    expect(isSessionTerminal(SessionState.RateLimited)).toBe(false);
  });

  it('returns false for ContextFull', () => {
    expect(isSessionTerminal(SessionState.ContextFull)).toBe(false);
  });
});
