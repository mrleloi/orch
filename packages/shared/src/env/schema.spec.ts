/**
 * schema.spec.ts — Smoke tests for env validation schemas in @orch/shared.
 *
 * Verifies:
 *  - telegramEnvSchema rejects missing required fields
 *  - telegramEnvSchema transforms chat IDs correctly
 *  - telegramEnvSchema rejects non-numeric chat IDs
 *  - sharedEnvSchema applies correct defaults
 *  - validateTelegramEnv throws on invalid input
 */

import { describe, it, expect } from 'vitest';
import { telegramEnvSchema, sharedEnvSchema, validateTelegramEnv } from './schema.js';

const VALID_TELEGRAM_ENV = {
  TELEGRAM_BOT_TOKEN: 'bot123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11',
  ORCH_TG_ALLOWED_CHAT_IDS: '123456789,987654321',
  ORCH_API_BEARER_TOKEN: 'test-bearer-token',
  ORCH_API_BASE_URL: 'http://127.0.0.1:4141',
};

/** Remove a key from an object (pure, no mutation). */
function omit<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  key: K,
): Omit<T, K> {
  const copy = { ...obj };
  delete copy[key];
  return copy as Omit<T, K>;
}

describe('telegramEnvSchema', () => {
  it('parses valid env with correct chat ID transformation', () => {
    const result = telegramEnvSchema.safeParse(VALID_TELEGRAM_ENV);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.ORCH_TG_ALLOWED_CHAT_IDS).toEqual([123456789, 987654321]);
    expect(result.data.TELEGRAM_BOT_TOKEN).toBe(VALID_TELEGRAM_ENV.TELEGRAM_BOT_TOKEN);
  });

  it('rejects missing TELEGRAM_BOT_TOKEN', () => {
    const result = telegramEnvSchema.safeParse(omit(VALID_TELEGRAM_ENV, 'TELEGRAM_BOT_TOKEN'));
    expect(result.success).toBe(false);
  });

  it('rejects empty TELEGRAM_BOT_TOKEN', () => {
    const result = telegramEnvSchema.safeParse({
      ...VALID_TELEGRAM_ENV,
      TELEGRAM_BOT_TOKEN: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing ORCH_TG_ALLOWED_CHAT_IDS', () => {
    const result = telegramEnvSchema.safeParse(
      omit(VALID_TELEGRAM_ENV, 'ORCH_TG_ALLOWED_CHAT_IDS'),
    );
    expect(result.success).toBe(false);
  });

  it('rejects non-numeric chat IDs', () => {
    const result = telegramEnvSchema.safeParse({
      ...VALID_TELEGRAM_ENV,
      ORCH_TG_ALLOWED_CHAT_IDS: '123,abc,456',
    });
    expect(result.success).toBe(false);
  });

  it('accepts single chat ID', () => {
    const result = telegramEnvSchema.safeParse({
      ...VALID_TELEGRAM_ENV,
      ORCH_TG_ALLOWED_CHAT_IDS: '42',
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.ORCH_TG_ALLOWED_CHAT_IDS).toEqual([42]);
  });

  it('applies default ORCH_API_BASE_URL when not provided', () => {
    const result = telegramEnvSchema.safeParse(omit(VALID_TELEGRAM_ENV, 'ORCH_API_BASE_URL'));
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.ORCH_API_BASE_URL).toBe('http://127.0.0.1:4141');
  });
});

describe('sharedEnvSchema', () => {
  it('applies default ORCH_API_BASE_URL', () => {
    const result = sharedEnvSchema.safeParse({
      ORCH_API_BEARER_TOKEN: 'token',
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.ORCH_API_BASE_URL).toBe('http://127.0.0.1:4141');
  });

  it('rejects missing ORCH_API_BEARER_TOKEN', () => {
    const result = sharedEnvSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('validateTelegramEnv', () => {
  it('returns parsed env on valid input', () => {
    const env = validateTelegramEnv(VALID_TELEGRAM_ENV);
    expect(env.ORCH_TG_ALLOWED_CHAT_IDS).toEqual([123456789, 987654321]);
  });

  it('throws on missing required fields', () => {
    expect(() => validateTelegramEnv({})).toThrow('Telegram env validation failed');
  });
});
