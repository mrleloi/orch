/**
 * handlers/stop.ts — /stop <session-id> command handler for the Orch Telegram bot.
 *
 * Stops a specific session by ID with I-6 confirmation gate.
 * Flow:
 *  1. Parse session-id from command args
 *  2. If missing: reply "Usage: /stop <session-id>"
 *  3. requestConfirmation(ctx, "Confirm stop session <id>?")
 *     - Yes: POST /api/v1/sessions/<id>/stop?confirm=1
 *     - No / timeout: no API call
 *
 * I-6: NEVER stops a session without confirmation. Every /stop requires fresh Yes.
 * I-4: no @orch/core imports.
 * H-1: ctx.reply failure is logged, never thrown.
 */

import type { Bot, Context } from 'grammy';
import type { Logger } from 'pino';
import type { RedactorFn } from '@orch/shared';
import type { CoreApiClient } from '../api/core-client.js';
import { requestConfirmation } from './confirm-flow.js';
import { withFloodControl } from '../middleware/flood-control.js';

/**
 * Register the /stop command on the given Grammy bot instance.
 *
 * @param bot      Grammy Bot instance (whitelist middleware already applied)
 * @param api      CoreApiClient
 * @param redactor RedactorFn for outbound text
 * @param logger   pino logger
 */
export function registerStopHandler(
  bot: Bot,
  api: CoreApiClient,
  redactor: RedactorFn,
  logger: Logger,
): void {
  bot.command('stop', async (ctx: Context) => {
    const chatId = ctx.chat?.id;
    const actor = chatId != null ? `telegram:${chatId}` : 'telegram:unknown';

    // Parse session ID from command argument
    // ctx.match is string | RegExpMatchArray; coerce to string
    const rawMatch = typeof ctx.match === 'string' ? ctx.match : (ctx.match?.[0] ?? '');
    const args = rawMatch.trim();
    if (!args || args.length === 0) {
      const text = redactor('Usage: /stop <session-id>');
      try {
        await withFloodControl(() => ctx.reply(text), logger);
      } catch (replyErr: unknown) {
        logger.error({ err: replyErr }, 'telegram:stop:reply-failed');
      }
      return;
    }

    const sessionId = args;
    const prompt = redactor(`Confirm stop session ${sessionId}?`);

    await requestConfirmation(
      ctx,
      prompt,
      async () => {
        await api.stopSession(sessionId, true, actor);
        logger.info({
          msg: 'telegram:stop:session-stopped',
          sessionId,
          actor,
        });
      },
      logger,
    );
  });
}
