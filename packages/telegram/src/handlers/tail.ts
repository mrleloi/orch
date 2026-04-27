/**
 * handlers/tail.ts — /tail [N] command handler for the Orch Telegram bot.
 *
 * Usage: /tail [N]
 *   N — number of lines to tail (default 20; max 100 client-side clamp).
 *
 * Flow:
 *  1. GET /api/v1/sessions/active — resolve the active session id.
 *  2. GET /api/v1/sessions/:id/tail?lines=N — fetch the tail.
 *  3. Format and reply.
 *
 * I-4: no @orch/core imports.
 * H-1 / agent-notes: ctx.reply failure is logged, never thrown.
 */

import type { Bot, Context } from 'grammy';
import type { Logger } from 'pino';
import type { RedactorFn } from '@orch/shared';
import type { CoreApiClient } from '../api/core-client.js';

/** Default number of lines to tail when no argument is given. */
const DEFAULT_LINES = 20;

/** Maximum lines the client will request — server also enforces this. */
const MAX_LINES = 100;

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Parse the /tail argument into a clamped line count.
 *
 * @param arg - raw text argument from command (may be undefined or empty)
 * @returns line count, clamped to [1, MAX_LINES]
 */
export function parseTailArg(arg: string | undefined): number {
  if (arg === undefined || arg.trim() === '') return DEFAULT_LINES;
  const n = parseInt(arg.trim(), 10);
  if (isNaN(n) || n <= 0) return DEFAULT_LINES;
  return Math.min(n, MAX_LINES); // client-side clamp
}

// ── Handler ────────────────────────────────────────────────────────────────────

/**
 * Register the /tail command on the given Grammy bot instance.
 *
 * @param bot      - Grammy Bot instance (already has whitelist middleware applied)
 * @param api      - CoreApiClient for fetching daemon state
 * @param redactor - RedactorFn to sanitise outbound text
 * @param logger   - pino logger for errors
 */
export function registerTailHandler(
  bot: Bot,
  api: CoreApiClient,
  redactor: RedactorFn,
  logger: Logger,
): void {
  bot.command('tail', async (ctx: Context) => {
    let text: string;

    try {
      // Parse argument from command text (everything after "/tail ")
      const raw = ctx.message?.text ?? '';
      const parts = raw.trim().split(/\s+/);
      const arg = parts[1]; // e.g. "50" or undefined
      const lines = parseTailArg(arg);

      // Step 1: resolve active session
      const session = await api.getActiveSession();
      if (session === null) {
        text = 'No session running.';
      } else {
        // Step 2: fetch tail
        const tail = await api.getTail(session.id, lines);
        if (tail.lines.length === 0) {
          text = `Session ${session.id}: no output captured yet.`;
        } else {
          const header = `Tail (last ${tail.lines.length} line${tail.lines.length === 1 ? '' : 's'}${tail.truncated ? ', truncated' : ''}) of session ${session.id}:`;
          text = [header, ...tail.lines].join('\n');
        }
      }
    } catch (err: unknown) {
      logger.error({ err }, 'telegram:tail:fetch-error');
      text = `Error fetching tail: ${String(err)}`;
    }

    const safeText = redactor(text);

    try {
      await ctx.reply(safeText);
    } catch (replyErr: unknown) {
      // H-1: ctx.reply failure is logged, never thrown
      logger.error({ err: replyErr }, 'telegram:tail:reply-failed');
    }
  });
}
