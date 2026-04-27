/**
 * PromptRenderer — Renders HandoffContext to a plain-text seed prompt.
 *
 * Pure function: no I/O, no DI dependencies that aren't constants.
 * Deterministic for a given (ctx, maxTokens) pair.
 *
 * Truncation order (per Part A.5):
 *  1. Header (sessionId, endedAt, endedReason) — never truncated.
 *  2. Next Session Pickup block — shortened last (most important).
 *  3. Pending tasks — never dropped.
 *  4. Decisions (oldest first) — droppable.
 *  5. Completed tasks (oldest first) — droppable.
 *  6. Git diff stat (top N files by insertions+deletions) — droppable.
 *
 * Token proxy: Math.ceil(text.length / HANDOFF_CHARS_PER_TOKEN).
 * No tiktoken or @anthropic-ai/tokenizer dependency (A.6).
 *
 * Decision 006 compliance: zero LLM calls, zero network I/O.
 * I-1 compliance: no Anthropic/OpenAI imports.
 */

import { Injectable } from '@nestjs/common';
import type {
  HandoffContext,
  RenderedPrompt,
  SessionDecisionRecord,
  SessionTaskRecord,
  FileDiffRecord,
  TruncationAction,
} from './types.js';
import {
  HANDOFF_MAX_TOKENS,
  HANDOFF_CHARS_PER_TOKEN,
  HANDOFF_MAX_CHARS,
} from './types.js';

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Renders the fixed header block (sessionId, endedAt, endedReason).
 * Never truncated — must always be present in output.
 */
function renderHeader(ctx: HandoffContext): string {
  return [
    '# Handoff Context',
    '',
    `Session: ${ctx.sessionId}`,
    `Project: ${ctx.projectId}`,
    `Ended At: ${ctx.endedAt}`,
    `End Reason: ${ctx.endedReason}`,
    '',
  ].join('\n');
}

/**
 * Renders the "Next Session Pickup" section from log summary.
 * Returns empty string if no pickup text is available.
 */
function renderPickup(pickup: string | null): string {
  if (!pickup) return '';
  return ['## Next Session Pickup', '', pickup, ''].join('\n');
}

/**
 * Renders the pending tasks section.
 * Never dropped — may be elided at char boundary in extreme cases.
 */
function renderPending(pending: readonly SessionTaskRecord[]): string {
  if (pending.length === 0) return '';
  const lines = ['## Pending Tasks', ''];
  for (const task of pending) {
    lines.push(`- ${task.title}`);
    if (task.detail && task.detail !== task.title) {
      lines.push(`  ${task.detail}`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

/**
 * Renders the decisions section (newest-first slice).
 * Caller controls which slice of decisions is shown.
 */
function renderDecisions(decisions: readonly SessionDecisionRecord[]): string {
  if (decisions.length === 0) return '';
  const lines = ['## Decisions', ''];
  for (const dec of decisions) {
    const label = dec.id ? `Decision ${dec.id} — ${dec.title}` : dec.title;
    lines.push(`- ${label}`);
    if (dec.detail && dec.detail !== dec.title) {
      lines.push(`  ${dec.detail}`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

/**
 * Renders the completed tasks section (newest-first slice).
 * Caller controls which slice of completed tasks is shown.
 */
function renderCompleted(completed: readonly SessionTaskRecord[]): string {
  if (completed.length === 0) return '';
  const lines = ['## Completed Tasks', ''];
  for (const task of completed) {
    lines.push(`- ${task.title}`);
    if (task.detail && task.detail !== task.title) {
      lines.push(`  ${task.detail}`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

/**
 * Renders the git diff stat section (top N files by insertions+deletions).
 * Caller controls which slice of files is shown.
 */
function renderDiffStat(
  gitDiff: HandoffContext['gitDiff'],
  files: readonly FileDiffRecord[],
): string {
  if (gitDiff.degraded) {
    return `## Git Diff\n\n(git unavailable: ${gitDiff.degradedReason ?? 'unknown'})\n\n`;
  }
  if (files.length === 0) return '';
  const lines = ['## Git Diff Stat', ''];
  for (const file of files) {
    if (file.binary) {
      lines.push(`- ${file.path} (binary)`);
    } else {
      lines.push(`- ${file.path}: +${file.insertions} -${file.deletions}`);
    }
  }
  lines.push(
    `\n(${gitDiff.totalInsertions} insertions, ${gitDiff.totalDeletions} deletions total)`,
  );
  lines.push('');
  return lines.join('\n');
}

/**
 * Assembles all sections into a single text string.
 * Section order matches A.5.
 */
function assemble(
  header: string,
  pickup: string,
  pending: string,
  decisions: string,
  completed: string,
  diffStat: string,
): string {
  return [header, pickup, pending, decisions, completed, diffStat]
    .filter((s) => s.length > 0)
    .join('');
}

/**
 * Sort files by (insertions + deletions) descending — top contributors first.
 * Pure, no mutation of input.
 */
function sortFilesByActivity(
  files: readonly FileDiffRecord[],
): readonly FileDiffRecord[] {
  return [...files].sort(
    (a, b) => b.insertions + b.deletions - (a.insertions + a.deletions),
  );
}

/**
 * Calculates how many items to drop when applying a 25%-of-list increment.
 * Returns at least 1 to guarantee progress.
 */
function dropCount(listLength: number): number {
  return Math.max(1, Math.floor(listLength * 0.25));
}

// ── Public class ─────────────────────────────────────────────────────────────

@Injectable()
export class PromptRenderer {
  /**
   * Pure function. No I/O, no DI dependencies that aren't constants.
   * Deterministic for a given (ctx, maxTokens) pair.
   * Truncation order documented in A.5.
   *
   * @param ctx       Assembled HandoffContext from HandoffContextBuilder.build().
   * @param maxTokens Token cap (defaults to HANDOFF_MAX_TOKENS = 5000).
   */
  render(ctx: HandoffContext, maxTokens?: number): RenderedPrompt {
    const effectiveMaxTokens = maxTokens ?? HANDOFF_MAX_TOKENS;
    // Effective char ceiling derived from token cap proxy (A.6)
    const maxChars = effectiveMaxTokens * HANDOFF_CHARS_PER_TOKEN;

    const truncationActions: TruncationAction[] = [];

    // Defensive: cap maxChars to HANDOFF_MAX_CHARS absolute ceiling
    const hardCap = Math.min(maxChars, HANDOFF_MAX_CHARS);

    // Empty context: no log summary AND degraded git diff → minimal prompt
    const hasLogContent =
      ctx.logSummary !== null &&
      (ctx.logSummary.completed.length > 0 ||
        ctx.logSummary.pending.length > 0 ||
        ctx.logSummary.decisions.length > 0 ||
        ctx.logSummary.nextSessionPickup !== null);

    const hasGitContent = !ctx.gitDiff.degraded && ctx.gitDiff.files.length > 0;

    if (!hasLogContent && !hasGitContent) {
      const text = [
        renderHeader(ctx),
        'Previous session ended; no diff/log available.\n',
      ].join('');
      return {
        text,
        tokens: Math.ceil(text.length / HANDOFF_CHARS_PER_TOKEN),
        truncated: false,
        truncationActions: [],
      };
    }

    // Working mutable state (arrays only — deterministic iteration order)
    let decisions: readonly SessionDecisionRecord[] =
      ctx.logSummary?.decisions ?? [];
    let completed: readonly SessionTaskRecord[] =
      ctx.logSummary?.completed ?? [];
    let diffFiles: readonly FileDiffRecord[] = sortFilesByActivity(
      ctx.gitDiff.files,
    );
    let pickup: string | null = ctx.logSummary?.nextSessionPickup ?? null;
    let pickupShortened = false;

    // Fixed parts (never truncated)
    const header = renderHeader(ctx);
    const pending = renderPending(ctx.logSummary?.pending ?? []);

    // Assemble initial text and check if truncation is needed
    let text = assemble(
      header,
      renderPickup(pickup),
      pending,
      renderDecisions(decisions),
      renderCompleted(completed),
      renderDiffStat(ctx.gitDiff, diffFiles),
    );

    // Truncation loop — each outer iteration attempts ALL five steps in A.5 order.
    // The loop exits when one full pass leaves text.length <= hardCap, or when
    // Step 5 (hard-truncate) fires. Defensive cap at 50 iterations prevents
    // infinite loops on any pathological input combination.
    //
    // Invariant: after this loop, text.length <= hardCap (guaranteed by Step 5).
    let iteration = 0;
    const MAX_ITERATIONS = 50;

    while (text.length > hardCap && iteration < MAX_ITERATIONS) {
      iteration++;

      // Step 1: Drop oldest decisions in 25% increments (oldest-first means index 0 = oldest)
      if (decisions.length > 0) {
        const drop = dropCount(decisions.length);
        decisions = decisions.slice(drop);
        truncationActions.push({
          kind: 'dropped_oldest_decisions',
          count: drop,
        });
        text = assemble(
          header,
          renderPickup(pickup),
          pending,
          renderDecisions(decisions),
          renderCompleted(completed),
          renderDiffStat(ctx.gitDiff, diffFiles),
        );
        if (text.length <= hardCap) break;
      }

      // Step 2: Drop oldest completed tasks in 25% increments (oldest-first means index 0 = oldest)
      if (text.length > hardCap && completed.length > 0) {
        const drop = dropCount(completed.length);
        completed = completed.slice(drop);
        truncationActions.push({
          kind: 'dropped_oldest_completed',
          count: drop,
        });
        text = assemble(
          header,
          renderPickup(pickup),
          pending,
          renderDecisions(decisions),
          renderCompleted(completed),
          renderDiffStat(ctx.gitDiff, diffFiles),
        );
        if (text.length <= hardCap) break;
      }

      // Step 3: Drop tail of diff records in 25% increments (keep top contributors)
      if (text.length > hardCap && diffFiles.length > 0) {
        const drop = dropCount(diffFiles.length);
        // Keep top contributors (already sorted descending); drop from tail
        diffFiles = diffFiles.slice(0, diffFiles.length - drop);
        truncationActions.push({
          kind: 'dropped_diff_records',
          count: drop,
        });
        text = assemble(
          header,
          renderPickup(pickup),
          pending,
          renderDecisions(decisions),
          renderCompleted(completed),
          renderDiffStat(ctx.gitDiff, diffFiles),
        );
        if (text.length <= hardCap) break;
      }

      // Step 4: Shorten Next Session Pickup to 2000 chars + ellipsis
      if (text.length > hardCap && pickup !== null && !pickupShortened) {
        const PICKUP_LIMIT = 2000;
        if (pickup.length > PICKUP_LIMIT) {
          const originalLen = pickup.length;
          pickup = pickup.slice(0, PICKUP_LIMIT) + '…[truncated]';
          const charsRemoved = originalLen - PICKUP_LIMIT;
          truncationActions.push({
            kind: 'shortened_pickup',
            charsRemoved,
          });
          text = assemble(
            header,
            renderPickup(pickup),
            pending,
            renderDecisions(decisions),
            renderCompleted(completed),
            renderDiffStat(ctx.gitDiff, diffFiles),
          );
        }
        // Mark shortened regardless — pickup is now at its minimum; skip Step 4 on future passes
        pickupShortened = true;
        if (text.length <= hardCap) break;
      }

      // Step 5: Hard-truncate to hardCap (last resort — guarantees the invariant)
      // Fires when all droppable sections are exhausted and text still exceeds cap.
      // Covers pathological cases where pending tasks alone exceed hardCap.
      if (text.length > hardCap) {
        const charsRemoved = text.length - hardCap;
        text = text.slice(0, hardCap);
        truncationActions.push({
          kind: 'hard_truncated',
          charsRemoved,
        });
        // Log-at-WARN is deferred to caller (PromptRenderer is pure / no logger injected)
        break;
      }
    }

    return {
      text,
      tokens: Math.ceil(text.length / HANDOFF_CHARS_PER_TOKEN),
      truncated: truncationActions.length > 0,
      truncationActions,
    };
  }
}
