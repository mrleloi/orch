/**
 * Unit tests for domain error hierarchy.
 *
 * Validates:
 * - `instanceof` checks (prototype chain restored after `extends Error`)
 * - `code` discriminant
 * - typed subclass fields
 * - `cause` chain
 */

import {
  DomainError,
  ProfileValidationError,
  StateTransitionError,
  RuntimeSpawnError,
  RateLimitError,
  ContextFullError,
  HookAuthError,
  QuarantineError,
} from './errors';

describe('DomainError', () => {
  it('is an instance of Error', () => {
    const err = new DomainError('TEST_CODE', 'test message');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(DomainError);
  });

  it('sets code and message', () => {
    const err = new DomainError('MY_CODE', 'my message');
    expect(err.code).toBe('MY_CODE');
    expect(err.message).toBe('my message');
  });

  it('stores the cause', () => {
    const cause = new Error('root cause');
    const err = new DomainError('CODE', 'wrapped', { cause });
    expect(err.cause).toBe(cause);
  });

  it('sets name to the class name', () => {
    const err = new DomainError('X', 'y');
    expect(err.name).toBe('DomainError');
  });
});

describe('ProfileValidationError', () => {
  const issues = [{ path: ['projectId'], message: 'Required' }];

  it('is instanceof DomainError and ProfileValidationError', () => {
    const err = new ProfileValidationError('invalid profile', issues);
    expect(err).toBeInstanceOf(DomainError);
    expect(err).toBeInstanceOf(ProfileValidationError);
  });

  it('has code PROFILE_VALIDATION_ERROR', () => {
    const err = new ProfileValidationError('msg', issues);
    expect(err.code).toBe('PROFILE_VALIDATION_ERROR');
  });

  it('stores issues array', () => {
    const err = new ProfileValidationError('msg', issues);
    expect(err.issues).toEqual(issues);
  });

  it('issues array is readonly', () => {
    const err = new ProfileValidationError('msg', issues);
    // issues is ReadonlyArray — TypeScript would catch a mutation attempt;
    // runtime check verifies the reference is stored correctly.
    expect(err.issues).toBe(issues);
  });
});

describe('StateTransitionError', () => {
  it('is instanceof DomainError', () => {
    const err = new StateTransitionError('Running', 'SessionStart');
    expect(err).toBeInstanceOf(DomainError);
  });

  it('has code STATE_TRANSITION_ERROR', () => {
    const err = new StateTransitionError('Running', 'SessionStart');
    expect(err.code).toBe('STATE_TRANSITION_ERROR');
  });

  it('stores fromState and event', () => {
    const err = new StateTransitionError('Idle', 'Stop');
    expect(err.fromState).toBe('Idle');
    expect(err.event).toBe('Stop');
  });

  it('message describes the illegal transition', () => {
    const err = new StateTransitionError('Idle', 'Stop');
    expect(err.message).toMatch(/Idle/);
    expect(err.message).toMatch(/Stop/);
  });
});

describe('RuntimeSpawnError', () => {
  it('is instanceof DomainError', () => {
    const err = new RuntimeSpawnError('ccs not found');
    expect(err).toBeInstanceOf(DomainError);
  });

  it('has code RUNTIME_SPAWN_ERROR', () => {
    const err = new RuntimeSpawnError('ccs not found');
    expect(err.code).toBe('RUNTIME_SPAWN_ERROR');
  });

  it('preserves cause', () => {
    const cause = new Error('ENOENT');
    const err = new RuntimeSpawnError('spawn failed', { cause });
    expect(err.cause).toBe(cause);
  });
});

describe('RateLimitError', () => {
  it('is instanceof DomainError', () => {
    const err = new RateLimitError('rate limited');
    expect(err).toBeInstanceOf(DomainError);
  });

  it('has code RATE_LIMIT_ERROR', () => {
    const err = new RateLimitError('rate limited');
    expect(err.code).toBe('RATE_LIMIT_ERROR');
  });

  it('stores retryAfterSecs when provided', () => {
    const err = new RateLimitError('rate limited', { retryAfterSecs: 60 });
    expect(err.retryAfterSecs).toBe(60);
  });

  it('retryAfterSecs is undefined when not provided', () => {
    const err = new RateLimitError('rate limited');
    expect(err.retryAfterSecs).toBeUndefined();
  });
});

describe('ContextFullError', () => {
  it('is instanceof DomainError', () => {
    const err = new ContextFullError('context full');
    expect(err).toBeInstanceOf(DomainError);
  });

  it('has code CONTEXT_FULL_ERROR', () => {
    const err = new ContextFullError('context full');
    expect(err.code).toBe('CONTEXT_FULL_ERROR');
  });
});

describe('HookAuthError', () => {
  it('is instanceof DomainError', () => {
    const err = new HookAuthError();
    expect(err).toBeInstanceOf(DomainError);
  });

  it('has code HOOK_AUTH_ERROR', () => {
    const err = new HookAuthError();
    expect(err.code).toBe('HOOK_AUTH_ERROR');
  });

  it('uses default message when none provided', () => {
    const err = new HookAuthError();
    expect(err.message).toMatch(/authentication/i);
  });

  it('accepts custom message', () => {
    const err = new HookAuthError('wrong secret');
    expect(err.message).toBe('wrong secret');
  });
});

describe('QuarantineError', () => {
  it('is instanceof DomainError', () => {
    const err = new QuarantineError('item-1', 3);
    expect(err).toBeInstanceOf(DomainError);
  });

  it('has code QUARANTINE_ERROR', () => {
    const err = new QuarantineError('item-1', 3);
    expect(err.code).toBe('QUARANTINE_ERROR');
  });

  it('stores queueItemId and attempts', () => {
    const err = new QuarantineError('item-42', 5);
    expect(err.queueItemId).toBe('item-42');
    expect(err.attempts).toBe(5);
  });

  it('message references item id and attempt count', () => {
    const err = new QuarantineError('item-42', 5);
    expect(err.message).toMatch(/item-42/);
    expect(err.message).toMatch(/5/);
  });
});

// ── Task 2.10.a — structured fields: details, retryable, toJSON ───────────────

describe('DomainError structured fields (Task 2.10.a)', () => {
  it('details defaults to {} and retryable defaults to false', () => {
    const err = new DomainError('CODE', 'message');
    expect(err.details).toEqual({});
    expect(err.retryable).toBe(false);
  });

  it('redacts secrets inside details string leaves', () => {
    // Use a 32+ char sk- key so the OpenAI-style pattern fires
    const secret = 'sk-' + 'a'.repeat(32);
    const err = new DomainError('CODE', 'msg', { details: { apiKey: secret } });
    expect(err.details.apiKey).toBe('[REDACTED]');
  });

  it('RateLimitError: retryable is true and details.retryAfterSecs round-trips', () => {
    const err = new RateLimitError('too many requests', { retryAfterSecs: 42 });
    expect(err.retryable).toBe(true);
    expect(err.details.retryAfterSecs).toBe(42);
    expect(err.retryAfterSecs).toBe(42);
  });

  it('ContextFullError: retryable is false', () => {
    const err = new ContextFullError('context window full');
    expect(err.retryable).toBe(false);
  });

  it('StateTransitionError.details carries fromState and event', () => {
    const err = new StateTransitionError('Running', 'SessionStart');
    expect(err.details).toMatchObject({ fromState: 'Running', event: 'SessionStart' });
  });

  it('toJSON() returns structured shape and excludes raw stack from cause', () => {
    const cause = new Error('root cause');
    // Verify cause has a stack before we test exclusion
    expect(cause.stack).toBeDefined();

    const err = new DomainError('TEST', 'wrapped error', {
      cause,
      details: { info: 'value' },
      retryable: true,
    });
    const json = err.toJSON();

    expect(json).toMatchObject({
      name: 'DomainError',
      code: 'TEST',
      message: 'wrapped error',
      retryable: true,
      details: { info: 'value' },
    });
    // cause must be serialised without stack
    expect(json.cause).toEqual({ name: 'Error', message: 'root cause' });
    expect((json.cause as Record<string, unknown>).stack).toBeUndefined();
  });

  // ── Task 3.0 — Carryover #1: toJSON cause-chain recursion ────────────────────

  it('toJSON() recurses fully when cause is a 3-level DomainError chain', () => {
    // Level 3 (innermost)
    const inner = new DomainError('INNER_CODE', 'inner message', {
      details: { innerKey: 'innerVal' },
      retryable: false,
    });
    // Level 2
    const middle = new RateLimitError('middle rate-limit', {
      cause: inner,
      retryAfterSecs: 30,
      details: { middleKey: 'middleVal' },
    });
    // Level 1 (outermost)
    const outer = new DomainError('OUTER_CODE', 'outer message', {
      cause: middle,
      details: { outerKey: 'outerVal' },
      retryable: true,
    });

    const json = outer.toJSON();

    // Outer shape
    expect(json.code).toBe('OUTER_CODE');
    expect(json.retryable).toBe(true);
    expect(json.details).toMatchObject({ outerKey: 'outerVal' });

    // Middle shape (cause of outer)
    const middleJson = json.cause as ReturnType<typeof middle.toJSON>;
    expect(middleJson.code).toBe('RATE_LIMIT_ERROR');
    expect(middleJson.retryable).toBe(true);
    expect(middleJson.details).toMatchObject({ middleKey: 'middleVal' });

    // Inner shape (cause of middle)
    const innerJson = middleJson.cause as ReturnType<typeof inner.toJSON>;
    expect(innerJson.code).toBe('INNER_CODE');
    expect(innerJson.retryable).toBe(false);
    expect(innerJson.details).toMatchObject({ innerKey: 'innerVal' });
  });

  it('toJSON() keeps minimal {name, message} shape for non-DomainError cause (no recursion)', () => {
    const plainError = new TypeError('plain type error');
    // Assign a stack so we can verify it is NOT included
    expect(plainError.stack).toBeDefined();

    const err = new DomainError('WRAP', 'wrapping a plain error', {
      cause: plainError,
    });
    const json = err.toJSON();

    // Cause must be minimal — name + message only
    expect(json.cause).toEqual({
      name: 'TypeError',
      message: 'plain type error',
    });
    // No stack, no code, no details, no retryable
    const causeObj = json.cause as Record<string, unknown>;
    expect(causeObj.stack).toBeUndefined();
    expect(causeObj.code).toBeUndefined();
    expect(causeObj.details).toBeUndefined();
    expect(causeObj.retryable).toBeUndefined();
  });
});
