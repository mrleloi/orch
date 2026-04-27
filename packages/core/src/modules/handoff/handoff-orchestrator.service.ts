/**
 * HandoffOrchestrator — subscribes to session.ended events with CONTEXT_FULL reason,
 * builds + persists the handoff context, and enqueues/spawns the next session.
 *
 * Lifecycle:
 *  1. On `session.ended` with endReason CONTEXT_FULL or CONTEXT_FULL_FORCED:
 *     a. Resolve project profile from ProjectRegistryService.
 *     b. Invoke HandoffContextBuilder.build(input).
 *     c. Call render() on the built context.
 *     d. Persist a HandoffContext DB row with:
 *          - contextJson: full structured HandoffContext blob (NEVER mutated after create)
 *          - seedPrompt: RenderedPrompt.text (dedicated column — CRITICAL-2 fix)
 *          - status: 'READY_FOR_AUTO_SPAWN' | 'AWAITING_CONFIRM' based on profile flag
 *     e. Emit `session.handoffPrepared`.
 *     f. I-6 gate (CRITICAL-3 behavioral fix):
 *          auto_handoff=true  → status='READY_FOR_AUTO_SPAWN' → adapter.spawn() called HERE
 *                               with seedPrompt threaded into SpawnConfig.seedPrompt.
 *          auto_handoff=false → status='AWAITING_CONFIRM'  → emit `session.handoffPending`;
 *                               DOES NOT spawn. Operator must call confirmHandoff() to spawn.
 *     g. Emit `session.handoffApplied` with sessionKey of the new session (auto path)
 *        or without sessionKey (manual path — pending operator confirmation).
 *
 * Transaction ordering (decisions/007-handoff-tx-ordering.md — CRITICAL-5 Path B):
 *  The plan §3.6 risk note says "same $transaction block". In practice the session-end
 *  commit is performed inside SessionManager._handleGracefulEnd() / _handleSessionError()
 *  and session.ended is emitted AFTER that commit returns. By the time this handler fires
 *  the Session row is already committed; a second atomic transaction that inserts the
 *  HandoffContext row (FK to fromSessionId) is correct and safe. See decisions/007 for
 *  full rationale and documented recovery path if persistence fails.
 *
 * CRITICAL-1: Queue dispatcher integration — adapter.spawn() is called here (not in a
 *  separate watcher service) because the spawn decision belongs with the handoff context
 *  builder that has the seedPrompt. The 'queue dispatcher' concept maps to this service's
 *  auto-spawn path. A dedicated HandoffDispatcherService (future Task 3.7+) would query
 *  READY_FOR_AUTO_SPAWN rows on daemon restart for recovery.
 *
 * I-1:  ZERO LLM calls. HandoffContextBuilder is deterministic (decision 006).
 * I-2:  No project-specific names hardcoded.
 * I-6:  auto_handoff profile flag gates autonomous spawn (CRITICAL-3: behavioral, not cosmetic).
 * I-11: Every branch emits a log + OTEL span attribute.
 * I-14: No domain/ imports beyond the interface types.
 */

import {
  Injectable,
  Logger,
  Optional,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
} from '@nestjs/common';
import type { Session } from '../../domain/session.js';
import { EventBusService } from '../events/event-bus.service.js';
import { EVENT_CHANNELS } from '../events/event-channels.js';
import { TracingService } from '../tracing/tracing.service.js';
import { PrismaService } from '../db/prisma.service.js';
import { HandoffContextBuilder } from './handoff-context-builder.js';
import { ProjectRegistryService } from '../project-registry/project-registry.service.js';
import type { HandoffBuildInput } from './types.js';
import { EndedReason } from '@orch/shared';
import type { IAgentRuntime } from '../../domain/types/runtime.js';
import { IAGENT_RUNTIME } from '../sessions/agent-runtime.token.js';
import { GitDiffCollector } from './git-diff-collector.js';
import { SessionLogPathResolver } from './session-log-path-resolver.js';

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * endReason values that trigger handoff context building.
 * Matches the EndedReason constants from @orch/shared.
 */
const HANDOFF_TRIGGER_REASONS = new Set<string>([
  EndedReason.ContextFull,
  EndedReason.ContextFullForced,
]);

/** HandoffContext status values stored in DB (CRITICAL-2/3). */
export const HANDOFF_STATUS = {
  /** auto_handoff=true: dispatcher will spawn next session automatically. */
  READY_FOR_AUTO_SPAWN: 'READY_FOR_AUTO_SPAWN',
  /** auto_handoff=false: operator confirmation required before spawn. */
  AWAITING_CONFIRM: 'AWAITING_CONFIRM',
  /** seedPrompt was threaded into adapter.spawn() successfully. */
  APPLIED: 'APPLIED',
} as const;

export type HandoffStatus =
  (typeof HANDOFF_STATUS)[keyof typeof HANDOFF_STATUS];

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class HandoffOrchestratorService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(HandoffOrchestratorService.name);

  /** Unsubscribe functions for EventBus subscriptions */
  private readonly unsubscribers: Array<() => void> = [];

  constructor(
    private readonly events: EventBusService,
    private readonly tracing: TracingService,
    private readonly prisma: PrismaService,
    private readonly builder: HandoffContextBuilder,
    private readonly registry: ProjectRegistryService,
    private readonly gitDiff: GitDiffCollector,
    private readonly sessionLogResolver: SessionLogPathResolver,
    @Optional()
    @Inject(IAGENT_RUNTIME)
    private readonly runtime: IAgentRuntime | null,
  ) {}

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  onModuleInit(): void {
    const unsub = this.events.on(
      EVENT_CHANNELS.session.ended,
      (payload: { session: Session; endReason?: string }) => {
        const { session, endReason } = payload;
        if (endReason && HANDOFF_TRIGGER_REASONS.has(endReason)) {
          void this._handleContextFullEnd(session, endReason);
        }
      },
    );
    this.unsubscribers.push(unsub);
    this.logger.log({
      msg: 'handoff-orchestrator:subscribed:session.ended',
    });
  }

  onModuleDestroy(): void {
    for (const unsub of this.unsubscribers) {
      unsub();
    }
    this.unsubscribers.length = 0;
  }

  // ── Operator confirmation ──────────────────────────────────────────────────

  /**
   * Confirm a pending handoff and spawn the successor session.
   *
   * Called by operator (Telegram button, Web UI, CLI) after receiving
   * `session.handoffPending` event. Transitions HandoffContext from
   * AWAITING_CONFIRM → APPLIED and spawns the successor session.
   *
   * I-6: this is the required explicit confirmation gate for auto_handoff=false paths.
   *
   * @returns sessionKey of the spawned successor session, or null if handoff not found.
   */
  async confirmHandoff(
    handoffId: string,
    projectId: string,
  ): Promise<string | null> {
    const row = await this.prisma.handoffContext.findUnique({
      where: { id: handoffId },
    });

    if (!row || row.status !== HANDOFF_STATUS.AWAITING_CONFIRM) {
      this.logger.warn({
        msg: 'handoff-orchestrator:confirm:not-found-or-wrong-status',
        handoffId,
        status: row?.status ?? 'not_found',
      });
      return null;
    }

    const profile = await this.registry.getProject(projectId);
    if (!profile) {
      this.logger.warn({
        msg: 'handoff-orchestrator:confirm:project-not-found',
        handoffId,
        projectId,
      });
      return null;
    }

    return this._spawnSuccessor(handoffId, projectId, profile, row.seedPrompt);
  }

  // ── Core logic ─────────────────────────────────────────────────────────────

  /**
   * Handle a session that ended due to context full.
   *
   * Steps:
   *  1. Resolve profile (for repoPath, ccsProfile, autoHandoff flag).
   *  2. Build + render handoff context.
   *  3. Persist HandoffContext row with seedPrompt + status.
   *  4. Emit session.handoffPrepared.
   *  5. I-6 behavioral gate:
   *       auto_handoff=true  → _spawnSuccessor() → emit handoffApplied
   *       auto_handoff=false → emit handoffPending + handoffApplied(autoHandoff=false)
   */
  private async _handleContextFullEnd(
    session: Session,
    endReason: string,
  ): Promise<void> {
    const { id: sessionId, projectId } = session;

    this.logger.log({
      msg: 'handoff-orchestrator:context-full-end',
      sessionId,
      projectId,
      endReason,
    });

    await this.tracing.withSpan('handoff.orchestrate', async (span) => {
      span.setAttribute('session.id', sessionId);
      span.setAttribute('session.projectId', projectId);
      span.setAttribute('session.endReason', endReason);

      // ── 1. Resolve profile ────────────────────────────────────────────────
      const profile = await this.registry.getProject(projectId);
      if (!profile) {
        this.logger.warn({
          msg: 'handoff-orchestrator:project-not-found',
          sessionId,
          projectId,
        });
        span.setStatus('error');
        return;
      }

      const autoHandoff = profile.autoHandoff;
      const repoPath = profile.rootPath;

      // ── 2a. Capture real git HEAD commit SHA ──────────────────────────────
      // Task 4.1: real git rev-parse HEAD (replaces the previous literal 'HEAD' constant).
      // Falls back to 'HEAD' if the repo is not a git repository (GitDiffCollector
      // degrades gracefully in that case — the handoff context still builds).
      const endedAt = (session.endedAt ?? new Date()).toISOString();
      let headCommitSha = 'HEAD';
      try {
        headCommitSha = await this.gitDiff.getHeadCommit(repoPath);
      } catch (err) {
        this.logger.warn({
          msg: 'handoff-orchestrator:head-commit:fallback-to-HEAD',
          sessionId,
          projectId,
          error: String(err),
        });
      }

      // ── 2b. Resolve session log path ──────────────────────────────────────
      // Task 4.1: replace null with the expected session log path.
      // SessionLogPathResolver.resolve() always returns a path string; the file
      // may not yet exist (it is written at session-end by the session writer).
      const sessionLogPath = this.sessionLogResolver.resolve(endedAt);

      // ── 2. Build handoff context ──────────────────────────────────────────
      const buildInput: HandoffBuildInput = {
        sessionId,
        projectId,
        repoPath,
        sessionStartCommit: headCommitSha,
        sessionEndCommit: headCommitSha,
        sessionLogPath,
        endedAt,
        endedReason: this._mapEndReason(endReason),
      };

      let handoffId: string;
      let seedPromptText: string;

      try {
        const ctx = await this.builder.build(buildInput);
        const rendered = this.builder.render(ctx);
        seedPromptText = rendered.text;

        // ── 3. Persist HandoffContext row ─────────────────────────────────
        // CRITICAL-2: contextJson stores the FULL structured blob, NEVER mutated.
        // CRITICAL-3: status encodes the behavioral gate (not just a metadata field).
        const status: HandoffStatus = autoHandoff
          ? HANDOFF_STATUS.READY_FOR_AUTO_SPAWN
          : HANDOFF_STATUS.AWAITING_CONFIRM;

        handoffId = await this.prisma.$transaction(async (tx) => {
          const row = await tx.handoffContext.create({
            data: {
              fromSessionId: sessionId,
              contextJson: JSON.stringify(ctx),
              seedPrompt: seedPromptText, // dedicated column — never overwrites contextJson
              status,
              commit_sha: headCommitSha !== 'HEAD' ? headCommitSha : null,
              session_log_path: sessionLogPath,
            },
          });
          return row.id;
        });

        span.setAttribute('handoff.id', handoffId);
        span.setAttribute('handoff.tokenCount', rendered.tokens);
        span.setAttribute('handoff.truncated', rendered.truncated);
        span.setAttribute('handoff.autoHandoff', autoHandoff);
        span.setAttribute('handoff.status', status);

        this.logger.log({
          msg: 'handoff-orchestrator:persisted',
          handoffId,
          sessionId,
          projectId,
          tokens: rendered.tokens,
          truncated: rendered.truncated,
          status,
        });

        // ── 4. Emit handoffPrepared ─────────────────────────────────────────
        this.events.emit(EVENT_CHANNELS.session.handoffPrepared, {
          handoffId,
          sessionId,
          projectId,
          context: ctx,
          rendered,
        });
      } catch (err) {
        this.logger.error({
          msg: 'handoff-orchestrator:build-or-persist-failed',
          sessionId,
          projectId,
          error: String(err),
        });
        span.setStatus('error');
        span.setAttribute('handoff.error', String(err));
        return;
      }

      // ── 5. I-6 behavioral gate ─────────────────────────────────────────────
      if (autoHandoff) {
        // CRITICAL-3/CRITICAL-1: auto_handoff=true → spawn successor NOW.
        // adapter.spawn() is called with seedPrompt threaded into SpawnConfig.
        this.logger.log({
          msg: 'handoff-orchestrator:auto-handoff:spawning',
          handoffId,
          sessionId,
          projectId,
          seedPromptLength: seedPromptText.length,
        });

        try {
          const newSessionKey = await this._spawnSuccessor(
            handoffId,
            projectId,
            profile,
            seedPromptText,
          );

          // handoffApplied emitted by _spawnSuccessor on success
          this.logger.log({
            msg: 'handoff-orchestrator:auto-handoff:spawned',
            handoffId,
            sessionId,
            projectId,
            newSessionKey,
          });
        } catch (err) {
          this.logger.error({
            msg: 'handoff-orchestrator:auto-handoff:spawn-failed',
            handoffId,
            sessionId,
            projectId,
            error: String(err),
          });
          span.setStatus('error');
          span.setAttribute('handoff.spawnError', String(err));
        }
      } else {
        // CRITICAL-3: auto_handoff=false → DOES NOT spawn. Emit handoffPending so
        // operator can confirm. Queue dispatcher SKIPS AWAITING_CONFIRM rows.
        this.logger.log({
          msg: 'handoff-orchestrator:manual-handoff:awaiting-operator',
          handoffId,
          sessionId,
          projectId,
          seedPromptLength: seedPromptText.length,
        });

        // Emit handoffPending so Telegram/Web UI can prompt operator for confirmation.
        this.events.emit(EVENT_CHANNELS.session.handoffPending, {
          sessionKey: `${projectId}:handoff:${handoffId}`,
          sessionId,
          projectId,
          currentTokens: 0, // not tracked at this stage
          handoffId,
          seedPromptLength: seedPromptText.length,
        });

        // handoffApplied with autoHandoff=false signals "enqueued, awaiting confirm"
        this.events.emit(EVENT_CHANNELS.session.handoffApplied, {
          handoffId,
          sessionId,
          projectId,
          autoHandoff: false,
          seedPromptLength: seedPromptText.length,
        });
      }
    });
  }

  // ── Spawn successor session ────────────────────────────────────────────────

  /**
   * Spawn the successor session with the handoff seedPrompt.
   *
   * Called by:
   *  - _handleContextFullEnd (auto_handoff=true path)
   *  - confirmHandoff() (manual operator confirmation path)
   *
   * CRITICAL-1: adapter.spawn() is called here with seedPrompt in SpawnConfig.
   * Marks HandoffContext status as APPLIED on success.
   * Emits session.handoffApplied with autoHandoff=true and the new sessionKey.
   *
   * @returns sessionKey of the spawned successor session
   */
  private async _spawnSuccessor(
    handoffId: string,
    projectId: string,
    profile: Awaited<ReturnType<ProjectRegistryService['getProject']>>,
    seedPromptText: string,
  ): Promise<string> {
    if (!profile) {
      throw new Error(`Profile not found for project ${projectId}`);
    }

    if (!this.runtime) {
      // IAGENT_RUNTIME not provided in this DI context (e.g., isolated module tests).
      // Log and skip spawn; this is a misconfiguration in production — AppModule must
      // provide IAGENT_RUNTIME to the HandoffModule scope.
      this.logger.warn({
        msg: 'handoff-orchestrator:spawn-successor:no-runtime',
        handoffId,
        projectId,
        note: 'IAGENT_RUNTIME not injected; spawn skipped. Ensure AppModule provides IAGENT_RUNTIME for HandoffModule.',
      });
      throw new Error(
        'IAgentRuntime not available — cannot spawn successor session',
      );
    }

    const sessionKey = `${projectId}:handoff-successor:${handoffId}`;

    // CRITICAL-1: spawn the successor with seedPrompt threaded into SpawnConfig
    // Use conditional spread for optional fields (exactOptionalPropertyTypes: true)
    const spawnConfig: import('../../domain/types/runtime.js').SpawnConfig = {
      profile: profile.ccsProfile,
      prompt: `Continue the work. Pickup from where the previous session left off.`,
      workdir: profile.rootPath,
      ...(seedPromptText ? { seedPrompt: seedPromptText } : {}),
    };
    const handle = await this.runtime.spawn(spawnConfig);

    // Mark HandoffContext as APPLIED
    await this.prisma.handoffContext.update({
      where: { id: handoffId },
      data: { status: HANDOFF_STATUS.APPLIED },
    });

    // Emit handoffApplied with the new session's handle info
    this.events.emit(EVENT_CHANNELS.session.handoffApplied, {
      handoffId,
      sessionId: handle.sessionId || sessionKey,
      projectId,
      autoHandoff: true,
      seedPromptLength: seedPromptText.length,
    });

    return sessionKey;
  }

  /**
   * Map session endReason string to HandoffBuildInput endedReason discriminant.
   */
  private _mapEndReason(reason: string): HandoffBuildInput['endedReason'] {
    if (reason === EndedReason.ContextFullForced) return 'CONTEXT_FULL_FORCED';
    if (reason === EndedReason.ContextFull) return 'CONTEXT_FULL';
    return 'CONTEXT_FULL';
  }
}
