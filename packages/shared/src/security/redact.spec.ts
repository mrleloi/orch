/**
 * redact.spec.ts — Tests for clipPlanPath (Task 2.5 A4) and existing redactSecrets.
 *
 * Tests 17-18 (clipPlanPath):
 *  17. clipPlanPath('/home/user/private/secret-plan.md') → 'secret-plan.md#<8hex>'
 *  18. clipPlanPath is deterministic (same input → same output)
 *
 * Additional smoke tests for redactSecrets (already covered in other suites).
 */

import { describe, it, expect } from 'vitest';
import { clipPlanPath, redactSecrets } from './redact.js';

describe('clipPlanPath', () => {
  // Test 17: basic clipping with hash suffix
  it('test-17: clips to basename and appends 8-char hex hash', () => {
    const result = clipPlanPath('/home/user/private/secret-plan.md');
    // Must start with basename
    expect(result.startsWith('secret-plan.md#')).toBe(true);
    // Hash must be exactly 8 lowercase hex chars
    const hashPart = result.split('#')[1];
    expect(hashPart).toBeDefined();
    expect(hashPart).toMatch(/^[0-9a-f]{8}$/);
  });

  // Test 18: deterministic
  it('test-18: same input always produces same output', () => {
    const path = '/home/user/private/secret-plan.md';
    const r1 = clipPlanPath(path);
    const r2 = clipPlanPath(path);
    expect(r1).toBe(r2);
  });

  it('different paths with same basename produce different hashes', () => {
    const r1 = clipPlanPath('/home/alice/private/plan.md');
    const r2 = clipPlanPath('/home/bob/other/plan.md');
    // Both basenames are 'plan.md' but hashes differ
    expect(r1.startsWith('plan.md#')).toBe(true);
    expect(r2.startsWith('plan.md#')).toBe(true);
    expect(r1).not.toBe(r2);
  });

  it('handles Windows-style paths with backslashes', () => {
    const result = clipPlanPath('C:\\Users\\user\\plans\\my-plan.md');
    expect(result.startsWith('my-plan.md#')).toBe(true);
    const hashPart = result.split('#')[1];
    expect(hashPart).toMatch(/^[0-9a-f]{8}$/);
  });

  it('handles a path with no directory separator (filename only)', () => {
    const result = clipPlanPath('standalone.md');
    expect(result.startsWith('standalone.md#')).toBe(true);
  });
});

describe('redactSecrets', () => {
  it('redacts Anthropic API key', () => {
    const input = 'Key: sk-ant-api03-ABCDEFGHIJ1234567890abcdefghijklmnopqrstuv';
    const result = redactSecrets(input);
    expect(result).not.toContain('sk-ant-api03');
    expect(result).toContain('[REDACTED]');
  });

  it('is idempotent', () => {
    const input = 'token=sk-ant-api03-ABCDEFGHIJ1234567890abcdefghijklmnopqrstuv';
    const once = redactSecrets(input);
    const twice = redactSecrets(once);
    expect(once).toBe(twice);
  });
});
