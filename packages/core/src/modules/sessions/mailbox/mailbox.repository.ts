/**
 * MailboxRepository — thin Prisma wrapper over the WorkerMailbox table.
 *
 * This is the persistence adapter for worker mailbox messages. All domain ↔ Prisma row
 * mapping lives here. Callers receive domain `MailboxMessage` objects; Prisma rows
 * never leak past this boundary (I-14).
 *
 * Error mapping (I-12):
 *   Prisma P2025 (record not found)  → DomainError('RECORD_NOT_FOUND')
 *   All other Prisma errors          → DomainError('STORE_ERROR')
 *
 * I-10: pollUnread `limit` param is z-validated at boundary before reaching Prisma.
 * I-14: No module-level mutable state.
 * I-1:  No LLM calls. Pure persistence adapter.
 */

import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../../db/prisma.service.js';
import { DomainError } from '../../../domain/errors.js';
import type { MailboxMessage } from './mailbox.service.js';

// ── Zod schemas (I-10) ─────────────────────────────────────────────────────────

const PollLimitSchema = z.number().int().min(1).max(1000).optional();

// ── Prisma error helpers ───────────────────────────────────────────────────────

const PRISMA_NOT_FOUND = 'P2025';

function isPrismaKnownError(
  e: unknown,
): e is { code: string; message: string } {
  return (
    typeof e === 'object' &&
    e !== null &&
    'code' in e &&
    typeof (e as Record<string, unknown>)['code'] === 'string'
  );
}

function mapPrismaError(e: unknown, context: string): never {
  if (isPrismaKnownError(e)) {
    if (e.code === PRISMA_NOT_FOUND) {
      throw new DomainError(
        'RECORD_NOT_FOUND',
        `Record not found in ${context}`,
        { cause: e },
      );
    }
  }
  throw new DomainError(
    'STORE_ERROR',
    `Database error in ${context}: ${String(e)}`,
    { cause: e },
  );
}

// ── Row → domain mapper ────────────────────────────────────────────────────────

function rowToMailboxMessage(row: {
  id: string;
  toWorker: string;
  fromWorker: string;
  message: string;
  read: boolean;
  createdAt: Date;
}): MailboxMessage {
  return {
    id: row.id,
    toWorker: row.toWorker,
    fromWorker: row.fromWorker,
    message: row.message,
    read: row.read,
    createdAt: row.createdAt,
  };
}

// ── Repository ─────────────────────────────────────────────────────────────────

@Injectable()
export class MailboxRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Insert a new WorkerMailbox row with read=false.
   *
   * Returns the persisted row's id.
   * No unique constraint: two identical sends produce 2 distinct rows (SC-9).
   */
  async insert(input: {
    toWorker: string;
    fromWorker: string;
    message: string;
  }): Promise<{ id: string }> {
    try {
      const row = await this.prisma.workerMailbox.create({
        data: {
          toWorker: input.toWorker,
          fromWorker: input.fromWorker,
          message: input.message,
          read: false,
        },
        select: { id: true },
      });
      return { id: row.id };
    } catch (e) {
      mapPrismaError(e, 'MailboxRepository.insert');
    }
  }

  /**
   * Fetch unread messages for a worker in createdAt ASC order (FIFO).
   *
   * I-10: `limit` is validated through PollLimitSchema before reaching Prisma.
   *
   * @param toWorker  The recipient worker ID.
   * @param limit     Maximum number of rows to return (default 50, validated ≥1 ≤1000).
   */
  async findUnread(
    toWorker: string,
    limit?: number,
  ): Promise<MailboxMessage[]> {
    // I-10: validate limit before using it
    const validatedLimit = PollLimitSchema.parse(limit);

    try {
      const rows = await this.prisma.workerMailbox.findMany({
        where: { toWorker, read: false },
        orderBy: { createdAt: 'asc' },
        take: validatedLimit ?? 50,
      });
      return rows.map(rowToMailboxMessage);
    } catch (e) {
      mapPrismaError(e, 'MailboxRepository.findUnread');
    }
  }

  /**
   * Mark the supplied message IDs as read.
   *
   * Returns the count of rows updated.
   * Empty `ids` is a no-op — returns 0.
   */
  async markRead(ids: string[]): Promise<{ updated: number }> {
    if (ids.length === 0) {
      return { updated: 0 };
    }

    try {
      const result = await this.prisma.workerMailbox.updateMany({
        where: { id: { in: ids }, read: false },
        data: { read: true },
      });
      return { updated: result.count };
    } catch (e) {
      mapPrismaError(e, 'MailboxRepository.markRead');
    }
  }

  /**
   * Delete all messages with createdAt < before.
   *
   * Returns the count of rows deleted.
   * Dormant in v2.0 (Q5) — ships implemented but not called by daemon logic.
   */
  async deleteBefore(before: Date): Promise<{ deleted: number }> {
    try {
      const result = await this.prisma.workerMailbox.deleteMany({
        where: { createdAt: { lt: before } },
      });
      return { deleted: result.count };
    } catch (e) {
      mapPrismaError(e, 'MailboxRepository.deleteBefore');
    }
  }

  /**
   * Fetch messages by IDs (used by pollUnread + markRead in same tx path via service).
   */
  async findByIds(ids: string[]): Promise<MailboxMessage[]> {
    if (ids.length === 0) return [];
    try {
      const rows = await this.prisma.workerMailbox.findMany({
        where: { id: { in: ids } },
      });
      return rows.map(rowToMailboxMessage);
    } catch (e) {
      mapPrismaError(e, 'MailboxRepository.findByIds');
    }
  }
}
