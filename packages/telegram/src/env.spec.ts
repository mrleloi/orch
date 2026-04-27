/**
 * env.spec.ts — Tests for the @orch/telegram env validation re-export.
 *
 * Verifies that the telegram package's env.ts correctly re-exports from @orch/shared
 * and that the schema behaves as expected (rejects/transforms).
 *
 * Tests 7 and 8 from the session plan:
 *  7. Env schema rejects missing TELEGRAM_BOT_TOKEN
 *  8. Env schema transforms ORCH_TG_ALLOWED_CHAT_IDS "1,2,3" → [1,2,3]
 */

import { describe, it, expect } from 'vitest';
import { validateTelegramEnv } from './env.js';

const VALID_ENV = {
  TELEGRAM_BOT_TOKEN: 'bot123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11',
  ORCH_TG_ALLOWED_CHAT_IDS: '1,2,3',
  ORCH_API_BEARER_TOKEN: 'test-bearer-token',
  ORCH_API_BASE_URL: 'http://127.0.0.1:4141',
};

describe('validateTelegramEnv (via env.ts re-export)', () => {
  it('rejects missing TELEGRAM_BOT_TOKEN', () => {
    const rest = {
      ORCH_TG_ALLOWED_CHAT_IDS: VALID_ENV.ORCH_TG_ALLOWED_CHAT_IDS,
      ORCH_API_BEARER_TOKEN: VALID_ENV.ORCH_API_BEARER_TOKEN,
      ORCH_API_BASE_URL: VALID_ENV.ORCH_API_BASE_URL,
    };
    expect(() => validateTelegramEnv(rest)).toThrow('Telegram env validation failed');
  });

  it('transforms ORCH_TG_ALLOWED_CHAT_IDS "1,2,3" → [1,2,3]', () => {
    const result = validateTelegramEnv(VALID_ENV);
    expect(result.ORCH_TG_ALLOWED_CHAT_IDS).toEqual([1, 2, 3]);
  });

  it('applies default ORCH_API_BASE_URL when not provided', () => {
    const rest = {
      TELEGRAM_BOT_TOKEN: VALID_ENV.TELEGRAM_BOT_TOKEN,
      ORCH_TG_ALLOWED_CHAT_IDS: VALID_ENV.ORCH_TG_ALLOWED_CHAT_IDS,
      ORCH_API_BEARER_TOKEN: VALID_ENV.ORCH_API_BEARER_TOKEN,
    };
    const result = validateTelegramEnv(rest);
    expect(result.ORCH_API_BASE_URL).toBe('http://127.0.0.1:4141');
  });

  it('throws on completely empty env', () => {
    expect(() => validateTelegramEnv({})).toThrow('Telegram env validation failed');
  });
});
