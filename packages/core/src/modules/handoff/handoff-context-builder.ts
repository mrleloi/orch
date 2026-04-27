/**
 * HandoffContextBuilder — orchestrates L0 (git diff) + L1 (log parse) + render.
 *
 * Implements IHandoffBuilder. Validates input with zod (I-10), calls
 * GitDiffCollector and SessionLogParser in parallel (Promise.allSettled),
 * aggregates degraded flags, and emits an OTEL span (I-11).
 *
 * Decision 006 (binding): ZERO LLM calls. No Anthropic SDK. No network I/O
 * beyond the git subprocess.
 * See agent-workspace/memory/decisions/006-handoff-no-llm.md.
 *
 * I-1: No Anthropic SDK / OpenAI / claude-agent-sdk imports.
 * I-10: Zod validation at build() entry.
 * I-11: OTEL span 'handoff.build' emitted with sessionId, degraded, gitDegraded, logDegraded.
 * I-12: Zero `any`.
 */

import { Injectable, Inject, Optional } from '@nestjs/common';
import type {
  HandoffContext,
  RenderedPrompt,
  HandoffBuildInput,
  IHandoffBuilder,
  ILogger,
  ITracer,
  GitDiffSummary,
  SessionLogSummary,
} from './types.js';
import {
  LOGGER_TOKEN,
  TRACER_TOKEN,
  HandoffBuilderError,
  HandoffBuildInputSchema,
  HANDOFF_MAX_TOKENS,
} from './types.js';
import { GitDiffCollector } from './git-diff-collector.js';
import { SessionLogParser } from './session-log-parser.js';
import { PromptRenderer } from './prompt-renderer.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Checks if an unknown error (or its cause chain) is an ENOENT (file not found) error.
 * SessionLogParser wraps the raw Node ENOENT as HandoffBuilderError(LOG_READ_FAILED, ..., cause).
 * We walk up one level of cause to detect the underlying ENOENT.
 */
function isEnoentError(err: unknown): boolean {
  const checkOne = (e: unknown): boolean => {
    if (!(e instanceof Error)) return false;
    const nodeErr = e as NodeJS.ErrnoException;
    if (nodeErr.code === 'ENOENT') return true;
    const msgLower = e.message.toLowerCase();
    if (msgLower.includes('enoent') || msgLower.includes('no such file'))
      return true;
    return false;
  };

  if (checkOne(err)) return true;
  // Walk cause chain (HandoffBuilderError wraps the raw Node error)
  if (err instanceof Error && 'cause' in err) {
    return checkOne(err.cause);
  }
  return false;
}

@Injectable()
export class HandoffContextBuilder implements IHandoffBuilder {
  constructor(
    private readonly diffCollector: GitDiffCollector,
    private readonly logParser: SessionLogParser,
    private readonly renderer: PromptRenderer,
    @Inject(LOGGER_TOKEN) private readonly log: ILogger,
    @Optional() @Inject(TRACER_TOKEN) private readonly tracer: ITracer | null,
  ) {
    // tracer is optional: null in test environments without TracingModule.
  }

  /**
   * Build a HandoffContext from a completed session.
   *
   * I-10: Validates input with zod at entry — throws HandoffBuilderError on failure.
   * I-11: Emits OTEL span 'handoff.build' with sessionId, degraded, gitDegraded, logDegraded.
   *
   * Steps:
   *  1. Validate input (zod, I-10).
   *  2. Run diffCollector + logParser in parallel (Promise.allSettled).
   *  3. Aggregate degraded flag + reasons.
   *  4. Return HandoffContext.
   *  5. Emit OTEL span wrapping all the above (I-11).
   */
  async build(input: HandoffBuildInput): Promise<HandoffContext> {
    // I-10: Validate input with zod before touching filesystem or git.
    const parseResult = HandoffBuildInputSchema.safeParse(input);
    if (!parseResult.success) {
      const msg = parseResult.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ');
      throw new HandoffBuilderError(
        'VALIDATION_FAILED',
        `HandoffBuildInput validation failed: ${msg}`,
      );
    }

    const doBuild = async (): Promise<HandoffContext> => {
      const degradedReasons: string[] = [];

      // Step 2: Run L0 (git diff) and L1 (log parse) in parallel.
      // Promise.allSettled: failure of either is DEGRADED, not fatal.
      const [diffResult, logResult] = await Promise.allSettled([
        this.diffCollector.collect(
          input.repoPath,
          input.sessionStartCommit,
          input.sessionEndCommit,
        ),
        input.sessionLogPath !== null
          ? this.logParser.parse(input.sessionLogPath)
          : Promise.resolve(null as SessionLogSummary | null),
      ]);

      // Resolve L0 (git diff)
      let gitDiff: GitDiffSummary;
      let gitDegraded = false;
      if (diffResult.status === 'fulfilled') {
        gitDiff = diffResult.value;
        if (gitDiff.degraded) {
          gitDegraded = true;
          degradedReasons.push(
            `git_degraded: ${gitDiff.degradedReason ?? 'unknown'}`,
          );
        }
      } else {
        // diffCollector itself threw (unexpected — it should never throw, but belt+suspenders)
        const diffErr: unknown = diffResult.reason;
        const msg =
          diffErr instanceof Error ? diffErr.message : String(diffErr);
        gitDegraded = true;
        degradedReasons.push(`git_degraded: ${msg}`);
        gitDiff = {
          fromRef: input.sessionStartCommit,
          toRef: input.sessionEndCommit,
          files: [],
          totalInsertions: 0,
          totalDeletions: 0,
          degraded: true,
          degradedReason: msg,
        };
        this.log.warn(
          'GitDiffCollector threw unexpectedly (builder fallback)',
          {
            sessionId: input.sessionId,
            error: msg,
          },
        );
      }

      // Resolve L1 (session log)
      let logSummary: SessionLogSummary | null = null;
      let logDegraded = false;
      if (logResult.status === 'fulfilled') {
        logSummary = logResult.value;
      } else {
        // logParser threw (e.g., file missing, too large, parse error)
        const err: unknown = logResult.reason;
        const msg = err instanceof Error ? err.message : String(err);
        logDegraded = true;
        // Distinguish "file missing" from other parse failures.
        // SessionLogParser wraps ENOENT as HandoffBuilderError(LOG_READ_FAILED, ..., cause=ErrnoException).
        // Check the cause chain for ENOENT to produce the 'log_missing' degraded reason.
        const isEnoent = isEnoentError(err);
        degradedReasons.push(isEnoent ? 'log_missing' : `log_degraded: ${msg}`);
        this.log.warn('SessionLogParser failed (builder fallback)', {
          sessionId: input.sessionId,
          sessionLogPath: input.sessionLogPath,
          error: msg,
        });
      }

      // Also degrade if sessionLogPath was null (no log to parse)
      if (input.sessionLogPath === null && logResult.status === 'fulfilled') {
        // logParser was skipped (we passed null → resolved to null). Not degraded — expected.
        logSummary = null;
      }

      const degraded = gitDegraded || logDegraded;

      const ctx: HandoffContext = {
        sessionId: input.sessionId,
        projectId: input.projectId,
        endedAt: input.endedAt,
        endedReason: input.endedReason,
        gitDiff,
        logSummary,
        degraded,
        degradedReasons,
      };

      return ctx;
    };

    // I-11: Emit OTEL span 'handoff.build'.
    // @Optional() injects undefined (not null) when no provider exists; guard both.
    if (this.tracer != null) {
      return this.tracer.withSpan('handoff.build', async (span) => {
        const ctx = await doBuild();
        // Attach attrs after build so degraded flags are known
        span.setAttribute('sessionId', ctx.sessionId);
        span.setAttribute('degraded', ctx.degraded);
        span.setAttribute('gitDegraded', ctx.gitDiff.degraded);
        span.setAttribute(
          'logDegraded',
          ctx.logSummary === null && input.sessionLogPath !== null
            ? true
            : false,
        );
        return ctx;
      });
    }

    // No tracer (test environment or unregistered) — build without span.
    return doBuild();
  }

  /**
   * Render a HandoffContext to a plain-text seed prompt.
   * Delegates to PromptRenderer with the HANDOFF_MAX_TOKENS cap.
   */
  render(ctx: HandoffContext): RenderedPrompt {
    return this.renderer.render(ctx, HANDOFF_MAX_TOKENS);
  }
}
