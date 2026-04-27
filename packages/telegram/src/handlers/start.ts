/**
 * handlers/start.ts — /start <project> <plan-path> command handler.
 *
 * Enqueues a plan for execution by POSTing to /api/v1/queue.
 * Passes X-Orch-Actor: telegram:<chatId> header for audit trail.
 *
 * Non-destructive: no confirmation required (enqueue is reversible).
 *
 * Flow:
 *  1. Parse <project> and <plan-path> from args
 *  2. If missing args: reply "Usage: /start <project> <plan-path>"
 *  3. POST /api/v1/queue with { projectId, planPath }
 *  4. 404-equivalent (CoreApiError): polite message; NO crash
 *
 * I-4: no @orch/core imports.
 * H-1: ctx.reply failure is logged, never thrown.
 */

import type { Bot, Context } from 'grammy';
import type { Logger } from 'pino';
import type { RedactorFn } from '@orch/shared';
import type { CoreApiClient } from '../api/core-client.js';
import { CoreApiError } from '../api/core-client.js';
import { withFloodControl } from '../middleware/flood-control.js';

/**
 * Register the /start command on the given Grammy bot instance.
 *
 * NOTE: Telegram reserves /start for bot introduction; we register it here
 * because the plan mandates it. In practice, operators may prefer /enqueue.
 *
 * @param bot      Grammy Bot instance (whitelist middleware already applied)
 * @param api      CoreApiClient
 * @param redactor RedactorFn for outbound text
 * @param logger   pino logger
 */
export function registerStartHandler(
  bot: Bot,
  api: CoreApiClient,
  redactor: RedactorFn,
  logger: Logger,
): void {
  bot.command('start', async (ctx: Context) => {
    const chatId = ctx.chat?.id;
    const actor = chatId != null ? `telegram:${chatId}` : 'telegram:unknown';

    // Parse args: "/start <project> <plan-path>"
    // ctx.match is string | RegExpMatchArray; coerce to string
    const rawArgs = (typeof ctx.match === 'string' ? ctx.match : (ctx.match?.[0] ?? '')).trim();
    const parts = rawArgs.split(/\s+/);

    if (parts.length < 2 || parts[0] === '' || parts[1] === '') {
      const text = redactor('Usage: /start <project-id> <plan-path>');
      try {
        await withFloodControl(() => ctx.reply(text), logger);
      } catch (replyErr: unknown) {
        logger.error({ err: replyErr }, 'telegram:start:reply-failed');
      }
      return;
    }

    // parts.length >= 2 guaranteed by the guard above, so parts[0] is defined
    const projectId = parts[0] as string;
    const planPath = parts.slice(1).join(' ');

    let text: string;

    try {
      const item = await api.enqueue(projectId, planPath, actor);
      text = `Enqueued: [${item.state}] ${projectId} — ${planPath} (id: ${item.id})`;
    } catch (err: unknown) {
      if (err instanceof CoreApiError && err.status === 404) {
        text = `Project not found: ${projectId}`;
      } else {
        logger.error({ err }, 'telegram:start:api-error');
        text = `Error enqueuing: ${String(err)}`;
      }
    }

    const safeText = redactor(text);

    try {
      await withFloodControl(() => ctx.reply(safeText), logger);
    } catch (replyErr: unknown) {
      // H-1: ctx.reply failure is logged, never thrown
      logger.error({ err: replyErr }, 'telegram:start:reply-failed');
    }
  });
}
