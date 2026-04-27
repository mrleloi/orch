/**
 * confirm-flow.ts — I-6 per-operation confirmation via inline keyboard.
 *
 * Sends a message with [Yes, No] InlineKeyboard. Stores a pending-confirmation
 * entry (bounded at 100 — N6 invariant). On callback query:
 *   - Yes: invokes onConfirm(), edits reply to "confirmed"
 *   - No:  edits reply to "cancelled"
 *   - 60s timeout: edits reply to "cancelled"; evicts entry
 *
 * Every confirmation is per-operation (per-message): I-6 requires fresh
 * confirmation for EVERY destructive command. There is NO "session-level
 * trust" bypass.
 *
 * I-4: no @orch/core imports.
 * H-1: ctx.reply and editMessageText failures are caught + logged.
 * N6:  pending Map is capped at 100 entries; oldest is evicted when full.
 */

import type { Bot, Context } from 'grammy';
import { InlineKeyboard } from 'grammy';
import type { Logger } from 'pino';
import { withFloodControl } from '../middleware/flood-control.js';

// ── Pending-confirmation store ─────────────────────────────────────────────────

/** Bounded at 100 entries (N6 invariant). */
const MAX_PENDING = 100;

interface PendingEntry {
  onConfirm: () => Promise<void>;
  chatId: number;
  messageId: number;
  /** setTimeout handle for 60s timeout */
  timeoutHandle: ReturnType<typeof setTimeout>;
  logger: Logger;
}

/**
 * Insertion-ordered Map so we can evict the oldest entry (FIFO) when at capacity.
 */
const pendingConfirmations = new Map<string, PendingEntry>();

// ── Callback key helpers ───────────────────────────────────────────────────────

function makeCallbackData(chatId: number, messageId: number, answer: 'yes' | 'no'): string {
  return `confirm:${chatId}:${messageId}:${answer}`;
}

// ── Callback query dispatcher ──────────────────────────────────────────────────

/**
 * Register the global callback_query handler for confirmation buttons.
 * Call this ONCE during bot setup in main.ts, before any command handlers.
 */
export function registerConfirmationCallbackHandler(bot: Bot): void {
  bot.on('callback_query:data', async (ctx) => {
    const data = ctx.callbackQuery?.data;
    if (data == null || !data.startsWith('confirm:')) {
      return;
    }

    const parts = data.split(':');
    // format: confirm:<chatId>:<messageId>:<yes|no>
    if (parts.length !== 4) return;

    const chatId = parseInt(parts[1] ?? '', 10);
    const messageId = parseInt(parts[2] ?? '', 10);
    const answer = parts[3] as 'yes' | 'no';

    const key = `${chatId}:${messageId}`;
    const entry = pendingConfirmations.get(key);

    if (entry == null) {
      // Already resolved (timeout or double-click)
      try {
        await ctx.answerCallbackQuery();
      } catch {
        /* ignore */
      }
      return;
    }

    clearTimeout(entry.timeoutHandle);
    pendingConfirmations.delete(key);

    try {
      await ctx.answerCallbackQuery();
    } catch {
      /* ignore stale callback */
    }

    if (answer === 'yes') {
      try {
        await entry.onConfirm();
        await ctx.editMessageText('confirmed');
      } catch (err: unknown) {
        entry.logger.error({ err }, 'telegram:confirm-flow:onConfirm-error');
        try {
          await ctx.editMessageText('Error executing action');
        } catch {
          /* ignore */
        }
      }
    } else {
      try {
        await ctx.editMessageText('cancelled');
      } catch (err: unknown) {
        entry.logger.error({ err }, 'telegram:confirm-flow:edit-cancelled-error');
      }
    }
  });
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Send a confirmation prompt with [Yes, No] inline keyboard.
 *
 * On Yes: calls onConfirm() then edits reply to "confirmed".
 * On No or 60s timeout: edits reply to "cancelled"; never calls onConfirm().
 *
 * I-6: per-operation; never remembers confirmation across calls.
 * N6:  pending Map bounded at 100; oldest evicted when at capacity.
 *
 * @param ctx        Grammy context
 * @param promptText Message to send before the keyboard
 * @param onConfirm  Async callback to execute on Yes
 * @param logger     pino logger
 */
export async function requestConfirmation(
  ctx: Context,
  promptText: string,
  onConfirm: () => Promise<void>,
  logger: Logger,
): Promise<void> {
  const chatId = ctx.chat?.id;
  if (chatId == null) {
    logger.error({ msg: 'telegram:confirm-flow:no-chat-id' });
    return;
  }

  // Send the confirmation prompt with inline keyboard
  const keyboard = new InlineKeyboard()
    .text('Yes', 'PLACEHOLDER_YES')
    .text('No', 'PLACEHOLDER_NO');

  let sentMessage: { message_id: number } | undefined;
  try {
    sentMessage = await withFloodControl(
      () => ctx.reply(promptText, { reply_markup: keyboard }),
      logger,
    ) ?? undefined;
  } catch (err: unknown) {
    logger.error({ err }, 'telegram:confirm-flow:reply-error');
    return;
  }

  if (sentMessage == null) {
    logger.warn({ msg: 'telegram:confirm-flow:reply-dropped-flood-control' });
    return;
  }

  const messageId = sentMessage.message_id;

  // Now that we have the messageId, we can build stable callback_data and edit
  // the message to use real callback data (Grammy doesn't allow dynamic data
  // generation before the message is sent, so we edit immediately after sending).
  const yesData = makeCallbackData(chatId, messageId, 'yes');
  const noData = makeCallbackData(chatId, messageId, 'no');

  const realKeyboard = new InlineKeyboard()
    .text('Yes', yesData)
    .text('No', noData);

  try {
    await ctx.api.editMessageReplyMarkup(chatId, messageId, {
      reply_markup: realKeyboard,
    });
  } catch (err: unknown) {
    logger.error({ err }, 'telegram:confirm-flow:edit-markup-error');
    // Continue — worst case the placeholder buttons appear, but we proceed
  }

  const key = `${chatId}:${messageId}`;

  // N6: evict oldest if at capacity
  if (pendingConfirmations.size >= MAX_PENDING) {
    const oldestKey = pendingConfirmations.keys().next().value;
    if (oldestKey != null) {
      const oldest = pendingConfirmations.get(oldestKey);
      if (oldest != null) {
        clearTimeout(oldest.timeoutHandle);
      }
      pendingConfirmations.delete(oldestKey);
      logger.warn({ msg: 'telegram:confirm-flow:evicted-oldest', key: oldestKey });
    }
  }

  // 60s timeout
  const timeoutHandle = setTimeout(() => {
    const expired = pendingConfirmations.get(key);
    if (expired == null) return; // already resolved

    pendingConfirmations.delete(key);
    logger.info({ msg: 'telegram:confirm-flow:timeout-expired', key });

    // Edit the message to show cancelled (best-effort)
    ctx.api
      .editMessageText(chatId, messageId, 'cancelled (timed out)')
      .catch((err: unknown) => {
        logger.error({ err }, 'telegram:confirm-flow:timeout-edit-error');
      });
  }, 60_000);

  pendingConfirmations.set(key, {
    onConfirm,
    chatId,
    messageId,
    timeoutHandle,
    logger,
  });
}

// ── Test helpers (exported for unit tests only) ───────────────────────────────

/** Returns current size of pendingConfirmations (for N6 cap tests). */
export function getPendingCount(): number {
  return pendingConfirmations.size;
}

/** Clears all pending confirmations (for test isolation). */
export function clearPendingConfirmations(): void {
  for (const entry of pendingConfirmations.values()) {
    clearTimeout(entry.timeoutHandle);
  }
  pendingConfirmations.clear();
}
