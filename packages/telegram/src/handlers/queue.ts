/**
 * handlers/queue.ts — /queue command handler for the Orch Telegram bot.
 *
 * Fetches the current queue from the core daemon and formats a compact reply.
 * Outbound text passes redactSecrets() before being sent.
 *
 * I-4: no @orch/core imports.
 * H-1 / agent-notes: ctx.reply failure is logged, never thrown.
 */

import type { Bot, Context } from 'grammy';
import type { Logger } from 'pino';
import type { QueueItemDto } from '@orch/shared';
import type { RedactorFn } from '@orch/shared';
import type { CoreApiClient } from '../api/core-client.js';

// ── Formatting helpers ─────────────────────────────────────────────────────────

/**
 * Format a list of queue items into a compact Telegram message.
 *
 * Each item shows position, state, project, and plan-file basename.
 */
export function formatQueueItems(items: QueueItemDto[]): string {
  if (items.length === 0) {
    return 'Queue: empty';
  }

  const lines = [`Queue (${items.length} item${items.length === 1 ? '' : 's'}):`];
  items.forEach((item, idx) => {
    const planFile = item.planPath.split('/').pop() ?? item.planPath;
    lines.push(`  ${idx + 1}. [${item.state}] ${item.projectId} — ${planFile}`);
  });
  return lines.join('\n');
}

// ── Handler ────────────────────────────────────────────────────────────────────

/**
 * Register the /queue command on the given Grammy bot instance.
 *
 * @param bot      - Grammy Bot instance (already has whitelist middleware applied)
 * @param api      - CoreApiClient for fetching daemon state
 * @param redactor - RedactorFn to sanitise outbound text
 * @param logger   - pino logger for errors
 */
export function registerQueueHandler(
  bot: Bot,
  api: CoreApiClient,
  redactor: RedactorFn,
  logger: Logger,
): void {
  bot.command('queue', async (ctx: Context) => {
    let text: string;

    try {
      const items = await api.getQueue();
      text = formatQueueItems(items);
    } catch (err: unknown) {
      logger.error({ err }, 'telegram:queue:fetch-error');
      text = `Error fetching queue: ${String(err)}`;
    }

    const safeText = redactor(text);

    try {
      await ctx.reply(safeText);
    } catch (replyErr: unknown) {
      // H-1: ctx.reply failure is logged, never thrown
      logger.error({ err: replyErr }, 'telegram:queue:reply-failed');
    }
  });
}
