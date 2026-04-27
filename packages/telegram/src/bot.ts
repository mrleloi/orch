/**
 * bot.ts — Grammy bot factory for the Orch Telegram adapter.
 *
 * Phase 2.0: scaffold only — creates the bot instance, registers no handlers yet.
 * Phase 2.2: auth middleware + /status handler added.
 * Phase 2.3+: additional handlers registered here.
 *
 * Usage:
 *   const bot = createBot(env.TELEGRAM_BOT_TOKEN, logger);
 *   await bot.start();
 *
 * I-1: No LLM calls here — Telegram bot is a dumb notification + control interface.
 * I-4: Never imports @orch/core.
 */

import { Bot } from 'grammy';
import type { Logger } from 'pino';

/**
 * Create and configure the Grammy bot instance.
 *
 * @param token - Telegram bot token (TELEGRAM_BOT_TOKEN env var)
 * @param logger - pino logger instance for bot-level logging
 * @returns configured Grammy Bot (not yet started)
 */
export function createBot(token: string, logger: Logger): Bot {
  const bot = new Bot(token);

  // Log unhandled errors instead of crashing (H-1 candidate rule).
  bot.catch((err) => {
    logger.error({ err: err.error }, 'grammy:unhandled-error');
  });

  return bot;
}
