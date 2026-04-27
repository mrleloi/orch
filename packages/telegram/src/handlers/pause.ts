/**
 * handlers/pause.ts — /pause command handler for the Orch Telegram bot.
 *
 * Pauses queue processing globally by POSTing to /api/v1/queue/pause.
 * Passes X-Orch-Actor: telegram:<chatId> header for audit trail.
 *
 * Non-destructive: no confirmation required (pause can be easily reversed).
 *
 * I-4: no @orch/core imports.
 * H-1: ctx.reply failure is logged, never thrown.
 */

import type { Bot, Context } from 'grammy';
import type { Logger } from 'pino';
import type { RedactorFn } from '@orch/shared';
import type { CoreApiClient } from '../api/core-client.js';
import { withFloodControl } from '../middleware/flood-control.js';

/**
 * Register the /pause command on the given Grammy bot instance.
 *
 * @param bot      Grammy Bot instance (whitelist middleware already applied)
 * @param api      CoreApiClient
 * @param redactor RedactorFn for outbound text
 * @param logger   pino logger
 */
export function registerPauseHandler(
  bot: Bot,
  api: CoreApiClient,
  redactor: RedactorFn,
  logger: Logger,
): void {
  bot.command('pause', async (ctx: Context) => {
    const chatId = ctx.chat?.id;
    const actor = chatId != null ? `telegram:${chatId}` : 'telegram:unknown';

    let text: string;

    try {
      await api.pauseQueue(actor);
      text = 'Queue processing paused.';
    } catch (err: unknown) {
      logger.error({ err }, 'telegram:pause:api-error');
      text = `Error pausing queue: ${String(err)}`;
    }

    const safeText = redactor(text);

    try {
      await withFloodControl(() => ctx.reply(safeText), logger);
    } catch (replyErr: unknown) {
      // H-1: ctx.reply failure is logged, never thrown
      logger.error({ err: replyErr }, 'telegram:pause:reply-failed');
    }
  });
}
