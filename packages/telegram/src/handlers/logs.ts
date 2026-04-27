/**
 * handlers/logs.ts — /logs <session-id> command handler for the Orch Telegram bot.
 *
 * Usage: /logs <session-id>
 *
 * Fetches the full stdout ring-buffer transcript for the given session and sends it:
 *  - If ≤ 4096 chars: sends inline via ctx.reply
 *  - If > 4096 chars: attaches as a .txt file via ctx.replyWithDocument
 *
 * The 4096-char threshold matches Telegram's maximum message length.
 *
 * I-4: no @orch/core imports.
 * H-1 / agent-notes: ctx.reply / ctx.replyWithDocument failure is logged, never thrown.
 */

import { InputFile } from 'grammy';
import type { Bot, Context } from 'grammy';
import type { Logger } from 'pino';
import type { RedactorFn } from '@orch/shared';
import type { CoreApiClient } from '../api/core-client.js';

/** Telegram's maximum message length for text messages. */
const TELEGRAM_MAX_MSG_LENGTH = 4096;

// ── Handler ────────────────────────────────────────────────────────────────────

/**
 * Register the /logs command on the given Grammy bot instance.
 *
 * @param bot      - Grammy Bot instance (already has whitelist middleware applied)
 * @param api      - CoreApiClient for fetching daemon state
 * @param redactor - RedactorFn to sanitise outbound text
 * @param logger   - pino logger for errors
 */
export function registerLogsHandler(
  bot: Bot,
  api: CoreApiClient,
  redactor: RedactorFn,
  logger: Logger,
): void {
  bot.command('logs', async (ctx: Context) => {
    // Parse session-id argument from command text
    const raw = ctx.message?.text ?? '';
    const parts = raw.trim().split(/\s+/);
    const sessionId = parts[1]?.trim();

    if (!sessionId) {
      const helpText = 'Usage: /logs <session-id>';
      try {
        await ctx.reply(redactor(helpText));
      } catch (replyErr: unknown) {
        logger.error({ err: replyErr }, 'telegram:logs:reply-failed');
      }
      return;
    }

    let logContent: string;
    try {
      logContent = await api.getLogs(sessionId);
    } catch (err: unknown) {
      logger.error({ err }, 'telegram:logs:fetch-error');
      const errText = redactor(`Error fetching logs for session ${sessionId}: ${String(err)}`);
      try {
        await ctx.reply(errText);
      } catch (replyErr: unknown) {
        logger.error({ err: replyErr }, 'telegram:logs:reply-failed');
      }
      return;
    }

    const safeContent = redactor(logContent);

    if (safeContent.length === 0) {
      try {
        await ctx.reply(`Session ${sessionId}: no log output captured.`);
      } catch (replyErr: unknown) {
        logger.error({ err: replyErr }, 'telegram:logs:reply-failed');
      }
      return;
    }

    if (safeContent.length <= TELEGRAM_MAX_MSG_LENGTH) {
      // Short enough to send inline
      try {
        await ctx.reply(safeContent);
      } catch (replyErr: unknown) {
        logger.error({ err: replyErr }, 'telegram:logs:reply-failed');
      }
    } else {
      // Too long — attach as a .txt file
      const filename = `session-${sessionId}.txt`;
      const file = new InputFile(Buffer.from(safeContent, 'utf8'), filename);
      try {
        await ctx.replyWithDocument(file, {
          caption: `Logs for session ${sessionId} (${safeContent.length} chars)`,
        });
      } catch (replyErr: unknown) {
        logger.error({ err: replyErr }, 'telegram:logs:reply-with-document-failed');
      }
    }
  });
}
