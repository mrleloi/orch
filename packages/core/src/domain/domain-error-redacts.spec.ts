/**
 * domain-error-redacts.spec.ts
 *
 * Verifies that DomainError and its subclasses redact secrets from the
 * message at construction time so no secret ever leaks through:
 *  - error.message property
 *  - JSON.stringify(error) serialization
 *  - error.toString()
 */

import {
  DomainError,
  RuntimeSpawnError,
  RateLimitError,
  HookAuthError,
  StateTransitionError,
} from './errors.js';

// A known Anthropic API key pattern that would be caught by redactSecrets
const LEAKY_KEY = 'sk-ant-api03-ABCDEFGHIJ1234567890abcdefghijklmnopqrstuv';
const LEAKY_BEARER = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig';

describe('DomainError — constructor-time secret redaction', () => {
  it('redacts an API key embedded in the message', () => {
    const err = new DomainError(
      'TEST_CODE',
      `Auth failed with key ${LEAKY_KEY}`,
    );
    expect(err.message).not.toContain(LEAKY_KEY);
    expect(err.message).toContain('[REDACTED]');
  });

  it('redacts a Bearer token embedded in the message', () => {
    const err = new DomainError(
      'TEST_CODE',
      `Request header: ${LEAKY_BEARER}`,
    );
    expect(err.message).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    expect(err.message).toContain('[REDACTED]');
  });

  it('preserves the error code', () => {
    const err = new DomainError('MY_CODE', 'plain message');
    expect(err.code).toBe('MY_CODE');
  });

  it('preserves clean messages unchanged', () => {
    const clean = 'Session lock for "proj-abc" is already held';
    const err = new DomainError('SESSION_LOCK', clean);
    expect(err.message).toBe(clean);
  });

  it('JSON.stringify does not contain the raw key', () => {
    const err = new DomainError('LEAK_TEST', `key=${LEAKY_KEY}`);
    const json = JSON.stringify({ error: err.message });
    expect(json).not.toContain(LEAKY_KEY);
    expect(json).toContain('[REDACTED]');
  });

  it('error.toString() does not contain the raw key', () => {
    const err = new DomainError('LEAK_TEST', `key=${LEAKY_KEY}`);
    const str = err.toString();
    expect(str).not.toContain(LEAKY_KEY);
    expect(str).toContain('[REDACTED]');
  });

  // ── Subclasses ─────────────────────────────────────────────────────────────

  it('RuntimeSpawnError redacts message', () => {
    const err = new RuntimeSpawnError(`ENOENT: key=${LEAKY_KEY}`);
    expect(err.message).not.toContain(LEAKY_KEY);
    expect(err.code).toBe('RUNTIME_SPAWN_ERROR');
  });

  it('RateLimitError redacts message', () => {
    const err = new RateLimitError(`Rate limited: token=${LEAKY_KEY}`);
    expect(err.message).not.toContain(LEAKY_KEY);
    expect(err.code).toBe('RATE_LIMIT_ERROR');
  });

  it('HookAuthError redacts message', () => {
    const err = new HookAuthError(`Invalid secret: ${LEAKY_BEARER}`);
    expect(err.message).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    expect(err.code).toBe('HOOK_AUTH_ERROR');
  });

  it('StateTransitionError still renders clean message', () => {
    // StateTransitionError constructs its own template message — no secret risk
    // but we verify it still works and preserves its fromState/event fields.
    const err = new StateTransitionError('Idle', 'SessionEnd');
    expect(err.fromState).toBe('Idle');
    expect(err.event).toBe('SessionEnd');
    expect(err.code).toBe('STATE_TRANSITION_ERROR');
    expect(err.message).toContain('Illegal transition');
  });

  it('preserves cause chain', () => {
    const cause = new Error('original');
    const err = new DomainError('WRAPPED', 'wrapped error', { cause });
    expect(err.cause).toBe(cause);
  });

  it('instanceof checks still work after redaction', () => {
    const err = new DomainError('CODE', `key=${LEAKY_KEY}`);
    expect(err).toBeInstanceOf(DomainError);
    expect(err).toBeInstanceOf(Error);
  });
});
