/**
 * handlers/status.ts — /status command handler for the Orch Telegram bot.
 *
 * Fetches the active session and queue from the core daemon via CoreApiClient
 * and formats a single reply message. Outbound text passes redactSecrets()
 * before being sent (agent-notes: "wire security primitives at boundaries").
 *
 * I-4: no @orch/core imports.
 * H-1 / agent-notes: ctx.reply failure is logged, never thrown.
 */

import type { Bot, Context } from 'grammy';
import type { Logger } from 'pino';
import type { ActiveSessionDto, QueueItemDto } from '@orch/shared';
import type { RedactorFn } from '@orch/shared';
import type { CoreApiClient } from '../api/core-client.js';

// ── Formatting helpers ─────────────────────────────────────────────────────────

function formatSession(session: ActiveSessionDto | null): string {
  if (session == null) {
    return 'Active session: none';
  }
  const started = session.startedAt
    ? new Date(session.startedAt).toISOString()
    : 'unknown';
  return [
    `Active session: ${session.id}`,
    `  Project:  ${session.projectId}`,
    `  Plan:     ${session.planPath}`,
    `  State:    ${session.state}`,
    `  Started:  ${started}`,
    `  Tokens:   in=${session.inputTokens} out=${session.outputTokens}`,
    `  Cost:     $${session.costUsd.toFixed(4)}`,
  ].join('\n');
}

function formatQueue(items: QueueItemDto[]): string {
  if (items.length === 0) {
    return 'Queue: empty';
  }
  const lines = [`Queue (${items.length} item${items.length === 1 ? '' : 's'}):`];
  for (const item of items) {
    lines.push(`  [${item.state}] ${item.projectId} — ${item.planPath}`);
  }
  return lines.join('\n');
}

function buildStatusMessage(
  session: ActiveSessionDto | null,
  queue: QueueItemDto[],
): string {
  return [
    '=== Orch Status ===',
    formatSession(session),
    '',
    formatQueue(queue),
  ].join('\n');
}

// ── Handler ────────────────────────────────────────────────────────────────────

/**
 * Register the /status command on the given Grammy bot instance.
 *
 * @param bot      - Grammy Bot instance (already has whitelist middleware applied)
 * @param api      - CoreApiClient for fetching daemon state
 * @param redactor - RedactorFn to sanitise outbound text (I-16 wiring rule)
 * @param logger   - pino logger for errors
 */
export function registerStatusHandler(
  bot: Bot,
  api: CoreApiClient,
  redactor: RedactorFn,
  logger: Logger,
): void {
  bot.command('status', async (ctx: Context) => {
    let text: string;

    try {
      const [session, queue] = await Promise.all([
        api.getActiveSession(),
        api.getQueue(),
      ]);
      text = buildStatusMessage(session, queue);
    } catch (err: unknown) {
      logger.error({ err }, 'telegram:status:fetch-error');
      text = `Error fetching status: ${String(err)}`;
    }

    // Apply redactor before sending (agent-notes: wire at outbound boundary)
    const safeText = redactor(text);

    try {
      await ctx.reply(safeText);
    } catch (replyErr: unknown) {
      // H-1 / agent-notes: ctx.reply failure is logged, never thrown
      logger.error({ err: replyErr }, 'telegram:status:reply-failed');
    }
  });
}

// ── Exports for tests ──────────────────────────────────────────────────────────

export { buildStatusMessage, formatSession, formatQueue };
