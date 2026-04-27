/**
 * AgentWatchdog — setInterval-based liveness monitor for active Claude Code sessions.
 *
 * Ported and adapted from claudegram src/claude/agent-watchdog.ts (BORROW-2)
 * with the nanoclaw two-tier decision tree (SYNTHESIS §D13).
 *
 * Architecture:
 *  - setInterval(check, 30_000) on onModuleInit, cleared on onModuleDestroy.
 *  - check() reads active sessions via ISessionRegistry (port — 1.9d implements).
 *  - For each session, calls the pure decideAction() function (zero I/O).
 *  - Dispatches actions: soft-warn → EventBus; hard-kill → EventBus + ISessionTerminator.
 *  - Errors in terminator are caught, logged, and swallowed — one bad kill must not
 *    stop the watchdog tick from processing other sessions.
 *
 * I-1:  decideAction is deterministic pure function — zero LLM calls.
 * I-3:  No Agent SDK imports.
 * I-11: Emits session.warned and session.killed on every non-ok action.
 * I-12: Errors wrapped/logged at the boundary; watchdog never re-throws.
 * I-13: Interval is injectable for testing (overridable via constructor).
 * I-14: Domain types live in domain/; only NestJS wiring lives here.
 */

import {
  Injectable,
  Inject,
  Optional,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  decideAction,
  type WatchdogSession,
} from '../../domain/watchdog/decide-action.js';
import { SESSION_REGISTRY } from '../../domain/ports/session-registry.port.js';
import { SESSION_TERMINATOR } from '../../domain/ports/session-terminator.port.js';
import type { ISessionRegistry } from '../../domain/ports/session-registry.port.js';
import type { ISessionTerminator } from '../../domain/ports/session-terminator.port.js';
import { EventBusService } from '../events/event-bus.service.js';
import { EVENT_CHANNELS } from '../events/event-channels.js';
import { isSessionTerminal } from '../../domain/session.js';
import {
  DEFAULT_HEARTBEAT_TIMEOUT_MS,
  DEFAULT_ABSOLUTE_CEILING_MS,
  DEFAULT_SOFT_WARN_GRACE_MS,
  DEFAULT_WATCHDOG_INTERVAL_MS,
} from '../../config/defaults.js';

// re-export for backwards-compat with spec file imports — migrate next cycle
export {
  DEFAULT_HEARTBEAT_TIMEOUT_MS,
  DEFAULT_ABSOLUTE_CEILING_MS,
  DEFAULT_SOFT_WARN_GRACE_MS,
} from '../../config/defaults.js';

// ── Constants ──────────────────────────────────────────────────────────────────

/** How often the watchdog tick runs (ms). */
const WATCHDOG_INTERVAL_MS = DEFAULT_WATCHDOG_INTERVAL_MS;

// ── Options ────────────────────────────────────────────────────────────────────

export interface WatchdogOptions {
  heartbeatTimeoutMs?: number;
  absoluteCeilingMs?: number;
  softWarnGraceMs?: number;
  /** Override the interval duration — used in tests to control tick frequency. */
  intervalMs?: number;
}

// ── Service ────────────────────────────────────────────────────────────────────

@Injectable()
export class AgentWatchdog implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AgentWatchdog.name);

  private readonly heartbeatTimeoutMs: number;
  private readonly absoluteCeilingMs: number;
  private readonly softWarnGraceMs: number;
  private readonly intervalMs: number;

  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private ticking = false;

  constructor(
    @Inject(SESSION_REGISTRY)
    private readonly registry: ISessionRegistry,

    @Inject(SESSION_TERMINATOR)
    private readonly terminator: ISessionTerminator,

    private readonly eventBus: EventBusService,

    @Optional() options: WatchdogOptions = {},
  ) {
    this.heartbeatTimeoutMs =
      options.heartbeatTimeoutMs ?? DEFAULT_HEARTBEAT_TIMEOUT_MS;
    this.absoluteCeilingMs =
      options.absoluteCeilingMs ?? DEFAULT_ABSOLUTE_CEILING_MS;
    this.softWarnGraceMs =
      options.softWarnGraceMs ?? DEFAULT_SOFT_WARN_GRACE_MS;
    this.intervalMs = options.intervalMs ?? WATCHDOG_INTERVAL_MS;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  onModuleInit(): void {
    this.intervalHandle = setInterval(() => {
      void this.check();
    }, this.intervalMs);

    this.logger.log({
      msg: 'watchdog:started',
      intervalMs: this.intervalMs,
      heartbeatTimeoutMs: this.heartbeatTimeoutMs,
      absoluteCeilingMs: this.absoluteCeilingMs,
      softWarnGraceMs: this.softWarnGraceMs,
    });
  }

  onModuleDestroy(): void {
    if (this.intervalHandle !== null) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
      this.logger.log({ msg: 'watchdog:stopped' });
    }
  }

  // ── Core tick ─────────────────────────────────────────────────────────────

  /**
   * Run one watchdog tick — evaluate all active sessions and act.
   *
   * This method is async so that terminator.terminate() can be awaited per session.
   * If terminator throws, the error is logged and the loop continues to next session.
   */
  async check(): Promise<void> {
    if (this.ticking) {
      this.logger.warn({ msg: 'watchdog:tick-skipped', reason: 're-entrant' });
      return;
    }
    this.ticking = true;
    try {
      const sessions = this.registry.getActive();
      const now = Date.now();

      for (const session of sessions) {
        // Skip terminal sessions (defensive guard — registry should not return these)
        if (isSessionTerminal(session.state)) {
          continue;
        }

        await this.evaluateSession(session, now);
      }
    } finally {
      this.ticking = false;
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async evaluateSession(
    session: WatchdogSession,
    now: number,
  ): Promise<void> {
    const action = decideAction({
      session,
      now,
      heartbeatTimeoutMs: this.heartbeatTimeoutMs,
      absoluteCeilingMs: this.absoluteCeilingMs,
      softWarnGraceMs: this.softWarnGraceMs,
    });

    switch (action) {
      case 'ok':
        this.logger.debug({
          msg: 'watchdog:ok',
          sessionId: session.id,
        });
        break;

      case 'soft-warn':
        this.logger.warn({
          msg: 'watchdog:soft-warn',
          sessionId: session.id,
          ageMs: now - session.startedAt,
          lastHeartbeatAt: session.lastHeartbeatAt,
        });
        this.eventBus.emit(EVENT_CHANNELS.session.warned, {
          sessionId: session.id,
          reason: this.buildWarnReason(session, now),
        });
        break;

      case 'hard-kill':
        await this.hardKill(session, now);
        break;
    }
  }

  private async hardKill(session: WatchdogSession, now: number): Promise<void> {
    const reason = this.buildKillReason(session, now);

    this.logger.warn({
      msg: 'watchdog:hard-kill',
      sessionId: session.id,
      reason,
      ageMs: now - session.startedAt,
      lastHeartbeatAt: session.lastHeartbeatAt,
    });

    // I-11: emit before terminate so observers see the event even if terminate throws
    this.eventBus.emit(EVENT_CHANNELS.session.killed, {
      sessionId: session.id,
      reason,
    });

    try {
      await this.terminator.terminate(session.id, reason);
    } catch (err) {
      // I-12: swallow and log — one bad termination must not crash the tick
      this.logger.error({
        msg: 'watchdog:terminate-failed',
        sessionId: session.id,
        error: String(err),
      });
    }
  }

  private buildWarnReason(session: WatchdogSession, now: number): string {
    if (session.lastHeartbeatAt === null) {
      const ageMs = now - session.startedAt;
      return `No heartbeat received after ${ageMs}ms (threshold: ${this.heartbeatTimeoutMs}ms)`;
    }
    const heartbeatAgeMs = now - session.lastHeartbeatAt;
    return `Last heartbeat ${heartbeatAgeMs}ms ago (threshold: ${this.heartbeatTimeoutMs}ms)`;
  }

  private buildKillReason(session: WatchdogSession, now: number): string {
    const ageMs = now - session.startedAt;
    if (ageMs > this.absoluteCeilingMs) {
      return `Session exceeded absolute ceiling of ${this.absoluteCeilingMs}ms (age: ${ageMs}ms)`;
    }
    if (session.lastHeartbeatAt !== null) {
      const heartbeatAgeMs = now - session.lastHeartbeatAt;
      return `Session stuck: heartbeat ${heartbeatAgeMs}ms ago (timeout+grace: ${this.heartbeatTimeoutMs + this.softWarnGraceMs}ms)`;
    }
    return `Session never heartbeated and exceeded kill threshold (age: ${ageMs}ms)`;
  }
}
