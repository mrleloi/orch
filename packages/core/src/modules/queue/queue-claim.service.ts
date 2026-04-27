/**
 * QueueClaimService — atomic claim, release, and heartbeat for QueueItem rows.
 *
 * Responsibilities:
 *  - Atomic claim via SQL UPDATE with disjunctive WHERE clause (SC-7)
 *  - On-claim sweep: expired claims are reclaimable via the OR clause (Q4)
 *  - Release: NULL-out claimedBy/claimExpiresAt (only for the holding worker)
 *  - Heartbeat: extend expiry for in-progress work (only for the holding worker)
 *
 * I-1 (daemon-dumb): ZERO LLM calls. Pure SQL; no external AI vendor imports.
 * I-12: Prisma errors wrapped in DomainError('STORE_ERROR').
 * I-14: NO module-level mutable state — private class fields only.
 * P2 (Simplicity): NO retry loop, NO scheduler, NO reaper. The disjunctive
 *   WHERE clause IS the on-claim sweep (per Q4 in 5.3 architect doc §2).
 */

import { Injectable, Logger } from '@nestjs/common';
import { DomainError } from '../../domain/errors.js';
import { PrismaService } from '../db/prisma.service.js';
import { TracingService } from '../tracing/tracing.service.js';

// ── Public types ────────────────────────────────────────────────────────────────

export interface ClaimResult {
  won: boolean;
  itemId: string;
  workerId: string;
  expiresAt: Date;
}

export interface QueueClaimOptions {
  /** TTL for the claim in milliseconds. Default 5 * 60 * 1000 (5 min). */
  ttlMs?: number;
}

// ── Service ─────────────────────────────────────────────────────────────────────

@Injectable()
export class QueueClaimService {
  private readonly logger = new Logger(QueueClaimService.name);

  /** Default claim TTL: 5 minutes. */
  static readonly DEFAULT_TTL_MS = 5 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tracing: TracingService,
  ) {}

  /**
   * Atomic claim. Returns ClaimResult with `won: true` iff the caller WON the row.
   *
   * SQL:
   *   UPDATE "QueueItem"
   *   SET    "claimedBy"      = :workerId,
   *          "claimExpiresAt" = :expiry
   *   WHERE  "id" = :itemId
   *     AND  ("claimedBy" IS NULL
   *           OR "claimExpiresAt" < CURRENT_TIMESTAMP)
   *
   * 0-row UPDATE = another worker holds an unexpired claim → won: false.
   * 1-row UPDATE = caller won → won: true.
   *
   * Never throws on contention. Throws DomainError('STORE_ERROR') only on DB error.
   *
   * I-1: pure SQL; zero LLM calls.
   * I-12: Prisma errors wrapped in DomainError('STORE_ERROR').
   */
  async claim(
    workerId: string,
    itemId: string,
    options?: QueueClaimOptions,
  ): Promise<ClaimResult> {
    const ttlMs = options?.ttlMs ?? QueueClaimService.DEFAULT_TTL_MS;
    const expiry = new Date(Date.now() + ttlMs);

    return this.tracing.withSpan('queue.claim', async (span) => {
      span.setAttribute('queue.workerId', workerId);
      span.setAttribute('queue.itemId', itemId);

      try {
        // Atomic UPDATE with disjunctive WHERE clause (SC-7 + Q4 on-claim sweep).
        // We pass `now` as a parameter rather than using CURRENT_TIMESTAMP because
        // SQLite stores Prisma DateTime as ISO-8601 with T separator (e.g.
        // "2026-04-26T06:39:00.000Z") while CURRENT_TIMESTAMP uses a space separator
        // ("2026-04-26 06:39:00"). String comparison then breaks because 'T' > ' '
        // in ASCII — so ISO-form values always sort AFTER space-form values, making
        // "claimExpiresAt" < CURRENT_TIMESTAMP never true for expired claims.
        // Passing `now` as a typed Date parameter lets Prisma normalise to the same
        // ISO-8601 format used for stored values, preserving correct ordering.
        const now = new Date();
        const rowsAffected = await this.prisma.$executeRaw`
          UPDATE "QueueItem"
          SET    "claimedBy"      = ${workerId},
                 "claimExpiresAt" = ${expiry}
          WHERE  "id" = ${itemId}
            AND  ("claimedBy" IS NULL
                  OR "claimExpiresAt" < ${now})
        `;

        const won = rowsAffected === 1;
        span.setAttribute('queue.claimed', won);
        this.logger.debug({
          msg: won ? 'queue.claim:won' : 'queue.claim:lost',
          workerId,
          itemId,
        });

        return { won, itemId, workerId, expiresAt: expiry };
      } catch (e) {
        if (e instanceof DomainError) throw e;
        throw new DomainError(
          'STORE_ERROR',
          `QueueClaimService.claim failed for item "${itemId}": ${String(e)}`,
          { cause: e },
        );
      }
    });
  }

  /**
   * Release a held claim (sets claimedBy=NULL, claimExpiresAt=NULL).
   *
   * WHERE clause authz: only the holding worker can release. If the row is held
   * by a different worker (or is already free), 0 rows affected → released: false.
   * No-op if the row does not exist → released: false.
   *
   * Never throws on contention. Throws DomainError('STORE_ERROR') only on DB error.
   */
  async release(
    workerId: string,
    itemId: string,
  ): Promise<{ released: boolean }> {
    return this.tracing.withSpan('queue.release', async (span) => {
      span.setAttribute('queue.workerId', workerId);
      span.setAttribute('queue.itemId', itemId);

      try {
        const rowsAffected = await this.prisma.$executeRaw`
          UPDATE "QueueItem"
          SET    "claimedBy"      = NULL,
                 "claimExpiresAt" = NULL
          WHERE  "id"         = ${itemId}
            AND  "claimedBy"  = ${workerId}
        `;

        const released = rowsAffected === 1;
        span.setAttribute('queue.released', released);
        return { released };
      } catch (e) {
        if (e instanceof DomainError) throw e;
        throw new DomainError(
          'STORE_ERROR',
          `QueueClaimService.release failed for item "${itemId}": ${String(e)}`,
          { cause: e },
        );
      }
    });
  }

  /**
   * Refresh the expiry on a held claim.
   *
   * Used when work is in-progress and the original TTL is approaching expiry.
   * WHERE claimedBy = :workerId ensures only the holding worker can extend.
   *
   * Returns refreshed: false (and newExpiresAt = now) when another worker holds
   * the row. Never throws on contention.
   */
  async heartbeat(
    workerId: string,
    itemId: string,
    options?: QueueClaimOptions,
  ): Promise<{ refreshed: boolean; newExpiresAt: Date }> {
    const ttlMs = options?.ttlMs ?? QueueClaimService.DEFAULT_TTL_MS;
    const newExpiry = new Date(Date.now() + ttlMs);

    return this.tracing.withSpan('queue.heartbeat', async (span) => {
      span.setAttribute('queue.workerId', workerId);
      span.setAttribute('queue.itemId', itemId);

      try {
        const rowsAffected = await this.prisma.$executeRaw`
          UPDATE "QueueItem"
          SET    "claimExpiresAt" = ${newExpiry}
          WHERE  "id"        = ${itemId}
            AND  "claimedBy" = ${workerId}
        `;

        const refreshed = rowsAffected === 1;
        span.setAttribute('queue.heartbeat.refreshed', refreshed);
        return { refreshed, newExpiresAt: newExpiry };
      } catch (e) {
        if (e instanceof DomainError) throw e;
        throw new DomainError(
          'STORE_ERROR',
          `QueueClaimService.heartbeat failed for item "${itemId}": ${String(e)}`,
          { cause: e },
        );
      }
    });
  }
}
