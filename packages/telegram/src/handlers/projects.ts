/**
 * handlers/projects.ts — /projects command handler for the Orch Telegram bot.
 *
 * Fetches the list of registered projects from the core daemon and formats
 * a compact reply showing each project's id and active session count.
 * Outbound text passes redactSecrets() before being sent.
 *
 * I-4: no @orch/core imports.
 * H-1 / agent-notes: ctx.reply failure is logged, never thrown.
 */

import type { Bot, Context } from 'grammy';
import type { Logger } from 'pino';
import type { ProjectDto } from '@orch/shared';
import type { RedactorFn } from '@orch/shared';
import type { CoreApiClient } from '../api/core-client.js';

// ── Formatting helpers ─────────────────────────────────────────────────────────

/**
 * Format a list of project DTOs into a compact Telegram message.
 *
 * Shows projectId (or name) and active session count for each project.
 */
export function formatProjects(projects: ProjectDto[]): string {
  if (projects.length === 0) {
    return 'Projects: none registered';
  }

  const lines = [`Projects (${projects.length}):`];
  for (const p of projects) {
    lines.push(`  ${p.projectId} — profile: ${p.ccsProfile} — root: ${p.rootPath}`);
  }
  return lines.join('\n');
}

// ── Handler ────────────────────────────────────────────────────────────────────

/**
 * Register the /projects command on the given Grammy bot instance.
 *
 * @param bot      - Grammy Bot instance (already has whitelist middleware applied)
 * @param api      - CoreApiClient for fetching daemon state
 * @param redactor - RedactorFn to sanitise outbound text
 * @param logger   - pino logger for errors
 */
export function registerProjectsHandler(
  bot: Bot,
  api: CoreApiClient,
  redactor: RedactorFn,
  logger: Logger,
): void {
  bot.command('projects', async (ctx: Context) => {
    let text: string;

    try {
      const projects = await api.getProjects();
      text = formatProjects(projects);
    } catch (err: unknown) {
      logger.error({ err }, 'telegram:projects:fetch-error');
      text = `Error fetching projects: ${String(err)}`;
    }

    const safeText = redactor(text);

    try {
      await ctx.reply(safeText);
    } catch (replyErr: unknown) {
      // H-1: ctx.reply failure is logged, never thrown
      logger.error({ err: replyErr }, 'telegram:projects:reply-failed');
    }
  });
}
