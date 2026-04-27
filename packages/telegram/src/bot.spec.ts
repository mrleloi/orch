/**
 * bot.spec.ts — Smoke tests for the Grammy bot factory.
 *
 * Verifies:
 *  - createBot returns a Grammy Bot instance
 *  - Bot is not started on creation
 *  - Bot error handler is registered (doesn't crash on error)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import pino from 'pino';

// Grammy makes a real HTTP call during Bot construction to validate the token.
// We mock it to avoid needing a real token in unit tests.
vi.mock('grammy', () => {
  return {
    Bot: vi.fn().mockImplementation(() => ({
      catch: vi.fn(),
      stop: vi.fn().mockResolvedValue(undefined),
      start: vi.fn().mockResolvedValue(undefined),
    })),
  };
});

describe('createBot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a bot instance without starting it', async () => {
    const { createBot } = await import('./bot.js');
    const { Bot } = await import('grammy');
    const logger = pino({ level: 'silent' });

    const bot = createBot('test-token', logger);

    expect(Bot).toHaveBeenCalledWith('test-token');
    expect(bot).toBeDefined();
    // Bot.start() should NOT have been called — this is a scaffold, not production
    expect(bot.start).not.toHaveBeenCalled();
  });

  it('registers a catch handler on the bot', async () => {
    const { createBot } = await import('./bot.js');
    const logger = pino({ level: 'silent' });

    const bot = createBot('test-token-2', logger);

    // The mock `bot.catch` should have been called exactly once (in createBot)
    expect(bot.catch).toHaveBeenCalledTimes(1);
  });

  it('does not crash when the bot error handler is invoked', async () => {
    const { createBot } = await import('./bot.js');
    const logger = pino({ level: 'silent' });

    const bot = createBot('test-token-3', logger);

    // Get the error handler that was registered and call it
    const catchCall = vi.mocked(bot.catch).mock.calls[0];
    expect(catchCall).toBeDefined();

    // The handler should not throw
    const handler = catchCall?.[0] as (err: { error: Error }) => void;
    expect(() => handler({ error: new Error('test error') })).not.toThrow();
  });
});
