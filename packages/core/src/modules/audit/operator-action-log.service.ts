/**
 * OperatorActionLog service — writes immutable audit rows for confirmed destructive actions.
 *
 * Called by API endpoints after every confirmed destructive operation (I-6).
 *
 * I-6:  Audit row is written AFTER the op, unconditionally — never skipped.
 * I-14: No NestJS imports in domain layer (this IS the infrastructure layer).
 * I-2:  No project-specific defaults.
 *
 * actor derivation:
 *   - Read from custom header X-Orch-Actor (e.g. "telegram:123456")
 *   - Fallback: "unknown" (bearer-authed but no actor header)
 *
 * traceId:
 *   - Extracted from the W3C traceparent if an active span is present.
 *   - Format: 00-<traceId>-<spanId>-<flags>; we extract the 32-char traceId segment.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../db/prisma.service.js';
import { TracingService } from '../tracing/tracing.service.js';
import { DuplicateRecordError } from '../../domain/errors.js';
import { handlePrismaError } from '../../domain/prisma-error-helper.js';

// ── Types ──────────────────────────────────────────────────────────────────────

export type OperatorAction =
  | 'session.stop'
  | 'queue.pause'
  | 'queue.resume'
  | 'queue.enqueue';

export interface OperatorActionEntry {
  /** "telegram:<chatId>" | "web:<tokenHash>" | "cli" | "unknown" */
  actor: string;
  action: OperatorAction;
  /** Session ID, queue item ID, or undefined if not applicable */
  target?: string;
  /** Always true — rows are only written for confirmed ops */
  confirmed: boolean;
}

// ── Service ────────────────────────────────────────────────────────────────────

@Injectable()
export class OperatorActionLogService {
  private readonly logger = new Logger(OperatorActionLogService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tracing: TracingService,
  ) {}

  /**
   * Write an audit row for a confirmed operator action.
   *
   * Never throws — log errors are caught internally to avoid disrupting the caller.
   * The audit row is a record of fact; failure to write it must not swallow the
   * original operation result.
   */
  async log(entry: OperatorActionEntry): Promise<void> {
    const traceId = this.extractTraceId();

    try {
      await this.prisma.operatorActionLog.create({
        data: {
          actor: entry.actor,
          action: entry.action,
          target: entry.target ?? null,
          confirmed: entry.confirmed,
          traceId: traceId ?? null,
        },
      });

      this.logger.debug({
        msg: 'audit:operator-action-log:written',
        actor: entry.actor,
        action: entry.action,
        target: entry.target,
        traceId,
      });
    } catch (err: unknown) {
      const wrapped = handlePrismaError(err);
      if (wrapped instanceof DuplicateRecordError) {
        this.logger.debug({
          msg: 'audit:p2002-suppressed',
          actor: entry.actor,
        });
        return; // duplicate audit row — already logged, swallow
      }
      this.logger.error(
        { err, entry },
        'audit:operator-action-log:write-failed',
      );
      // Intentionally NOT re-thrown — audit failure must not disrupt ops
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Extract the 32-char hex traceId from the active W3C traceparent, if present.
   *
   * traceparent format: 00-<traceId>-<spanId>-<flags>
   * We parse out segment [1] (zero-indexed) which is the 32-hex traceId.
   */
  private extractTraceId(): string | undefined {
    const traceparent = this.tracing.getActiveTraceparent();
    if (traceparent == null) return undefined;

    // W3C traceparent: "00-<32hexTraceId>-<16hexSpanId>-<2hexFlags>"
    const parts = traceparent.split('-');
    if (parts.length >= 4 && parts[1] != null && parts[1].length === 32) {
      return parts[1];
    }
    return undefined;
  }
}
