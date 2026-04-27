/**
 * whitelist.middleware.ts — Grammy middleware for chat ID whitelisting.
 *
 * Only allows updates from chat IDs in the provided `allowedIds` set.
 * Unknown chats receive a polite refusal message; the update is NOT passed to
 * subsequent handlers.
 *
 * Usage:
 *   bot.use(whitelistMiddleware(new Set(env.ORCH_TG_ALLOWED_CHAT_IDS)));
 *
 * I-4: no @orch/core imports.
 * H-1: ctx.reply failure is logged, never thrown.
 */

import type { Context, MiddlewareFn } from 'grammy';
import type { Logger } from 'pino';

/**
 * Build a Grammy middleware that enforces a chat ID whitelist.
 *
 * @param allowedIds - Set of numeric chat IDs that are permitted.
 * @param logger     - pino logger for denial events (warn level).
 * @returns Grammy MiddlewareFn<Context>
 */
export function whitelistMiddleware(
  allowedIds: Set<number>,
  logger: Logger,
): MiddlewareFn<Context> {
  return async (ctx, next) => {
    const chatId = ctx.chat?.id;

    if (chatId == null || !allowedIds.has(chatId)) {
      logger.warn({
        msg: 'telegram:whitelist:denied',
        chatId: chatId ?? 'unknown',
      });

      // Polite refusal — failure is caught and logged (H-1 / agent-notes rule)
      try {
        await ctx.reply(
          'Sorry, you are not authorised to use this bot. Contact the operator to be added to the allow-list.',
        );
      } catch (replyErr: unknown) {
        logger.error({ err: replyErr }, 'telegram:whitelist:reply-failed');
      }

      // Do NOT call next() — block processing for this update
      return;
    }

    await next();
  };
}
