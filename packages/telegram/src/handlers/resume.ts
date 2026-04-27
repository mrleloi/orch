/**
 * handlers/resume.ts — /resume command handler for the Orch Telegram bot.
 *
 * Resumes queue processing by POSTing to /api/v1/queue/resume.
 * Passes X-Orch-Actor: telegram:<chatId> header for audit trail.
 *
 * Non-destructive: no confirmation required.
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
 * Register the /resume command on the given Grammy bot instance.
 *
 * @param bot      Grammy Bot instance (whitelist middleware already applied)
 * @param api      CoreApiClient
 * @param redactor RedactorFn for outbound text
 * @param logger   pino logger
 */
export function registerResumeHandler(
  bot: Bot,
  api: CoreApiClient,
  redactor: RedactorFn,
  logger: Logger,
): void {
  bot.command('resume', async (ctx: Context) => {
    const chatId = ctx.chat?.id;
    const actor = chatId != null ? `telegram:${chatId}` : 'telegram:unknown';

    let text: string;

    try {
      await api.resumeQueue(actor);
      text = 'Queue processing resumed.';
    } catch (err: unknown) {
      logger.error({ err }, 'telegram:resume:api-error');
      text = `Error resuming queue: ${String(err)}`;
    }

    const safeText = redactor(text);

    try {
      await withFloodControl(() => ctx.reply(safeText), logger);
    } catch (replyErr: unknown) {
      // H-1: ctx.reply failure is logged, never thrown
      logger.error({ err: replyErr }, 'telegram:resume:reply-failed');
    }
  });
}
