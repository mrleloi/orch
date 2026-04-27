/**
 * redact-log-object.spec.ts
 *
 * Coverage:
 * - Flat object: string values redacted
 * - Nested object: recursive redaction
 * - Array: each element redacted
 * - Non-string primitives: pass through unchanged
 * - Idempotency: double-redact == single-redact
 * - Empty object
 */

import { redactLogObject } from './redact-log-object.js';

describe('redactLogObject', () => {
  // ── Basic string values ────────────────────────────────────────────────────

  it('redacts secret string values in a flat object', () => {
    const input = {
      msg: 'hello',
      token: 'sk-ant-api03-ABCDEFGHIJ1234567890abcdefghijklmnopqrstuv',
    };
    const result = redactLogObject(input);
    expect(result['msg']).toBe('hello');
    expect(result['token']).toContain('[REDACTED]');
    expect(result['token']).not.toContain('sk-ant-api03');
  });

  it('passes through plain string values unchanged', () => {
    const input = { level: 'info', msg: 'all quiet on the western front' };
    const result = redactLogObject(input);
    expect(result).toEqual(input);
  });

  // ── Nested objects ─────────────────────────────────────────────────────────

  it('recursively redacts string values in nested objects', () => {
    const input = {
      outer: 'safe text',
      inner: {
        secret: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig',
        safe: 'nothing here',
      },
    };
    const result = redactLogObject(input);
    const inner = result['inner'] as Record<string, unknown>;
    expect(inner['secret']).toContain('[REDACTED]');
    expect(inner['secret']).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    expect(inner['safe']).toBe('nothing here');
  });

  it('handles deeply nested objects', () => {
    const input = {
      a: {
        b: {
          c: {
            secret: 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ab',
          },
        },
      },
    };
    const result = redactLogObject(input);
    const c = (result['a'] as Record<string, unknown>)['b'] as Record<string, unknown>;
    const inner = c['c'] as Record<string, unknown>;
    expect(inner['secret']).toContain('[REDACTED]');
  });

  // ── Arrays ─────────────────────────────────────────────────────────────────

  it('recursively redacts string elements in arrays', () => {
    const input = {
      tokens: [
        'safe',
        'sk-ant-api03-ABCDEFGHIJ1234567890abcdefghijklmnopqrstuv',
        'also-safe',
      ],
    };
    const result = redactLogObject(input);
    const tokens = result['tokens'] as string[];
    expect(tokens[0]).toBe('safe');
    expect(tokens[1]).toContain('[REDACTED]');
    expect(tokens[2]).toBe('also-safe');
  });

  it('handles arrays of objects', () => {
    const input = {
      items: [
        { id: 1, secret: 'AKIAIOSFODNN7EXAMPLE' },
        { id: 2, safe: 'nothing' },
      ],
    };
    const result = redactLogObject(input);
    const items = result['items'] as Array<Record<string, unknown>>;
    expect(items[0]!['secret']).toContain('[REDACTED]');
    expect(items[0]!['id']).toBe(1);
    expect(items[1]!['safe']).toBe('nothing');
  });

  // ── Non-string primitives pass through ─────────────────────────────────────

  it('passes numbers, booleans, null through unchanged', () => {
    const input = {
      count: 42,
      active: true,
      nothing: null,
      msg: 'plain text',
    };
    const result = redactLogObject(input);
    expect(result['count']).toBe(42);
    expect(result['active']).toBe(true);
    expect(result['nothing']).toBeNull();
    expect(result['msg']).toBe('plain text');
  });

  // ── Idempotency ────────────────────────────────────────────────────────────

  it('is idempotent: redactLogObject(redactLogObject(x)) deep-equals redactLogObject(x)', () => {
    const input = {
      token: 'sk-ant-api03-ABCDEFGHIJ1234567890abcdefghijklmnopqrstuv',
      msg: 'log line',
      nested: {
        key: 'Bearer sometoken123456789012345678901234567890',
      },
    };
    const once = redactLogObject(input);
    const twice = redactLogObject(once);
    expect(twice).toEqual(once);
  });

  it('is idempotent for Date values: double-redact preserves instanceof Date and ISO equality', () => {
    const d = new Date('2026-04-26T00:00:00Z');
    const once = redactLogObject({ ts: d });
    const twice = redactLogObject(once);
    expect(twice['ts']).toBeInstanceOf(Date);
    expect((twice['ts'] as Date).toISOString()).toBe(d.toISOString());
  });

  // ── Edge cases ─────────────────────────────────────────────────────────────

  it('returns empty object for empty input', () => {
    expect(redactLogObject({})).toEqual({});
  });

  it('does not mutate the input object', () => {
    const input = {
      secret: 'sk-ant-api03-ABCDEFGHIJ1234567890abcdefghijklmnopqrstuv',
    };
    const original = { ...input };
    redactLogObject(input);
    expect(input).toEqual(original);
  });

  // ── Date passthrough (P0 production fix — Task 3.11.1) ────────────────────

  it('passes Date instances through unchanged (flat)', () => {
    const d = new Date('2026-01-01T00:00:00Z');
    const result = redactLogObject({ x: d });
    expect(result['x']).toBeInstanceOf(Date);
    expect((result['x'] as Date).toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('passes Date instances through in nested objects', () => {
    const d = new Date('2026-06-15T12:30:00Z');
    const result = redactLogObject({ a: { b: d } });
    const inner = result['a'] as Record<string, unknown>;
    expect(inner['b']).toBeInstanceOf(Date);
    expect((inner['b'] as Date).toISOString()).toBe('2026-06-15T12:30:00.000Z');
  });

  it('passes Date instances through inside arrays', () => {
    const d = new Date('2026-03-10T08:00:00Z');
    const result = redactLogObject({ list: [d] });
    const list = result['list'] as unknown[];
    expect(list[0]).toBeInstanceOf(Date);
    expect((list[0] as Date).toISOString()).toBe('2026-03-10T08:00:00.000Z');
  });

  it('redacts secret-keyed sibling while preserving Date sibling', () => {
    const d = new Date('2026-01-01T00:00:00Z');
    const result = redactLogObject({
      apiKey: 'sk-ant-api03-ABCDEFGHIJ1234567890abcdefghijklmnopqrstuv',
      endedAt: d,
    });
    expect(result['apiKey']).toContain('[REDACTED]');
    expect(result['endedAt']).toBeInstanceOf(Date);
    expect((result['endedAt'] as Date).toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('does not stack-overflow on deeply nested objects beyond MAX_DEPTH', () => {
    // Build a 15-level deep object (exceeds the 10-level MAX_DEPTH guard)
    let deep: Record<string, unknown> = { secret: 'sk-ant-api03-ABCDEFGHIJ1234567890abcdefghijklmnopqrstuv' };
    for (let i = 0; i < 15; i++) {
      deep = { level: i, child: deep };
    }
    // Must not throw (stack overflow), must return an object
    expect(() => redactLogObject(deep)).not.toThrow();
    const result = redactLogObject(deep);
    expect(typeof result).toBe('object');
  });
});
