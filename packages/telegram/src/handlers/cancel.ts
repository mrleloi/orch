/**
 * handlers/cancel.ts — /cancel command handler for the Orch Telegram bot.
 *
 * Cancels the currently active session with I-6 confirmation gate.
 * Flow:
 *  1. Fetch active session from /api/v1/sessions/active
 *  2. If none: reply "No active session"
 *  3. If active: requestConfirmation(ctx, "Confirm cancel session <id>?")
 *     - Yes: POST /api/v1/sessions/<id>/stop?confirm=1
 *     - No / timeout: no API call
 *
 * I-6: NEVER called without confirmation. Every /cancel requires fresh Yes.
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
 * Register the /cancel command on the given Grammy bot instance.
 *
 * @param bot      Grammy Bot instance (whitelist middleware already applied)
 * @param api      CoreApiClient
 * @param redactor RedactorFn for outbound text
 * @param logger   pino logger
 */
export function registerCancelHandler(
  bot: Bot,
  api: CoreApiClient,
  redactor: RedactorFn,
  logger: Logger,
): void {
  bot.command('cancel', async (ctx: Context) => {
    const chatId = ctx.chat?.id;
    const actor = chatId != null ? `telegram:${chatId}` : 'telegram:unknown';

    let activeSession: Awaited<ReturnType<typeof api.getActiveSession>>;

    try {
      activeSession = await api.getActiveSession();
    } catch (err: unknown) {
      logger.error({ err }, 'telegram:cancel:fetch-session-error');
      const text = redactor(`Error fetching active session: ${String(err)}`);
      try {
        await withFloodControl(() => ctx.reply(text), logger);
      } catch (replyErr: unknown) {
        logger.error({ err: replyErr }, 'telegram:cancel:reply-failed');
      }
      return;
    }

    if (activeSession == null) {
      const text = redactor('No active session to cancel.');
      try {
        await withFloodControl(() => ctx.reply(text), logger);
      } catch (replyErr: unknown) {
        logger.error({ err: replyErr }, 'telegram:cancel:reply-failed');
      }
      return;
    }

    const sessionId = activeSession.id;
    const prompt = redactor(`Confirm cancel session ${sessionId}?`);

    await requestConfirmation(
      ctx,
      prompt,
      async () => {
        await api.stopSession(sessionId, true, actor);
        logger.info({
          msg: 'telegram:cancel:session-stopped',
          sessionId,
          actor,
        });
      },
      logger,
    );
  });
}
