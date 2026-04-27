/**
 * Unit tests for token budget calculation functions.
 */

import {
  TOKEN_SOFT_THRESHOLD,
  TOKEN_HARD_THRESHOLD,
  TOKEN_ABSOLUTE_CAP,
  getDefaultThresholds,
  estimateTokens,
  shouldTriggerHandoff,
  isOverAbsoluteCap,
} from './budget';

describe('budget constants', () => {
  it('soft threshold is 200K', () => {
    expect(TOKEN_SOFT_THRESHOLD).toBe(200_000);
  });

  it('hard threshold is 230K', () => {
    expect(TOKEN_HARD_THRESHOLD).toBe(230_000);
  });

  it('absolute cap is 250K', () => {
    expect(TOKEN_ABSOLUTE_CAP).toBe(250_000);
  });

  it('soft < hard < absoluteCap', () => {
    expect(TOKEN_SOFT_THRESHOLD).toBeLessThan(TOKEN_HARD_THRESHOLD);
    expect(TOKEN_HARD_THRESHOLD).toBeLessThan(TOKEN_ABSOLUTE_CAP);
  });
});

describe('getDefaultThresholds', () => {
  it('returns an object with soft, hard, absoluteCap', () => {
    const t = getDefaultThresholds();
    expect(t.soft).toBe(TOKEN_SOFT_THRESHOLD);
    expect(t.hard).toBe(TOKEN_HARD_THRESHOLD);
    expect(t.absoluteCap).toBe(TOKEN_ABSOLUTE_CAP);
  });

  it('each call returns a fresh object', () => {
    const a = getDefaultThresholds();
    const b = getDefaultThresholds();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

describe('estimateTokens', () => {
  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('returns at least 1 for non-empty input', () => {
    expect(estimateTokens('a')).toBeGreaterThanOrEqual(1);
  });

  it('estimates ~4 chars per token', () => {
    // 40 characters ≈ 10 tokens
    expect(estimateTokens('a'.repeat(40))).toBe(10);
  });

  it('rounds up for partial tokens', () => {
    // 5 characters → ceil(5/4) = 2
    expect(estimateTokens('hello')).toBe(2);
  });

  it('scales linearly with text length', () => {
    const short = estimateTokens('a'.repeat(100));
    const long = estimateTokens('a'.repeat(1000));
    expect(long).toBe(short * 10);
  });

  it('handles whitespace-only strings', () => {
    expect(estimateTokens('   ')).toBeGreaterThan(0);
  });
});

describe('shouldTriggerHandoff', () => {
  const thresholds = getDefaultThresholds();

  it('returns ok below soft threshold', () => {
    expect(shouldTriggerHandoff(0, thresholds)).toBe('ok');
    expect(shouldTriggerHandoff(100_000, thresholds)).toBe('ok');
    expect(shouldTriggerHandoff(TOKEN_SOFT_THRESHOLD - 1, thresholds)).toBe('ok');
  });

  it('returns soft-warn at soft threshold', () => {
    expect(shouldTriggerHandoff(TOKEN_SOFT_THRESHOLD, thresholds)).toBe('soft-warn');
  });

  it('returns soft-warn between soft and hard thresholds', () => {
    expect(shouldTriggerHandoff(TOKEN_SOFT_THRESHOLD + 1000, thresholds)).toBe('soft-warn');
    expect(shouldTriggerHandoff(TOKEN_HARD_THRESHOLD - 1, thresholds)).toBe('soft-warn');
  });

  it('returns hard-stop at hard threshold', () => {
    expect(shouldTriggerHandoff(TOKEN_HARD_THRESHOLD, thresholds)).toBe('hard-stop');
  });

  it('returns hard-stop above hard threshold', () => {
    expect(shouldTriggerHandoff(TOKEN_HARD_THRESHOLD + 1, thresholds)).toBe('hard-stop');
    expect(shouldTriggerHandoff(TOKEN_ABSOLUTE_CAP, thresholds)).toBe('hard-stop');
  });

  it('uses default thresholds when not provided', () => {
    expect(shouldTriggerHandoff(0)).toBe('ok');
    expect(shouldTriggerHandoff(TOKEN_SOFT_THRESHOLD)).toBe('soft-warn');
    expect(shouldTriggerHandoff(TOKEN_HARD_THRESHOLD)).toBe('hard-stop');
  });

  it('works with custom thresholds', () => {
    const custom = { soft: 1000, hard: 2000, absoluteCap: 3000 };
    expect(shouldTriggerHandoff(500, custom)).toBe('ok');
    expect(shouldTriggerHandoff(1500, custom)).toBe('soft-warn');
    expect(shouldTriggerHandoff(2500, custom)).toBe('hard-stop');
  });
});

describe('isOverAbsoluteCap', () => {
  it('returns false below absolute cap', () => {
    expect(isOverAbsoluteCap(TOKEN_ABSOLUTE_CAP - 1)).toBe(false);
    expect(isOverAbsoluteCap(TOKEN_ABSOLUTE_CAP)).toBe(false);
  });

  it('returns true above absolute cap', () => {
    expect(isOverAbsoluteCap(TOKEN_ABSOLUTE_CAP + 1)).toBe(true);
    expect(isOverAbsoluteCap(TOKEN_ABSOLUTE_CAP + 10_000)).toBe(true);
  });

  it('works with custom thresholds', () => {
    const custom = { soft: 1000, hard: 2000, absoluteCap: 3000 };
    expect(isOverAbsoluteCap(3000, custom)).toBe(false);
    expect(isOverAbsoluteCap(3001, custom)).toBe(true);
  });
});
