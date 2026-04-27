/**
 * QueueRepository — thin Prisma wrapper over the QueueItem table.
 *
 * This is the persistence adapter for queue items. All domain ↔ Prisma row
 * mapping lives here. Callers receive domain `QueueItem` objects; Prisma rows
 * never leak past this boundary (I-14).
 *
 * Error mapping (I-12):
 *   Prisma P2002 (unique constraint) → QueueDedupError
 *   Prisma P2025 (record not found)  → DomainError('RECORD_NOT_FOUND')
 *   All other Prisma errors          → DomainError('STORE_ERROR')
 *
 * Transaction support:
 *   All write methods accept an optional `tx` param. When provided, operations
 *   run in that transaction's context. When absent, the injected PrismaService
 *   is used directly.
 */

import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import type { QueueItem } from '../../domain/queue-item.js';
import { QueueItemState } from '../../domain/queue-item.js';
import { DomainError } from '../../domain/errors.js';
import { QueueDedupError } from './queue.errors.js';
import { PrismaService } from '../db/prisma.service.js';

// ── Tx-client type ─────────────────────────────────────────────────────────────

export type TxClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

// ── Prisma error helpers ───────────────────────────────────────────────────────

const PRISMA_UNIQUE_VIOLATION = 'P2002';
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
    if (e.code === PRISMA_UNIQUE_VIOLATION) {
      throw new QueueDedupError(`Unique constraint violation in ${context}`, {
        cause: e,
      });
    }
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

function rowToQueueItem(row: {
  id: string;
  sessionKey: string;
  state: string;
  priority: number;
  dedupKey: string;
  payloadJson: string;
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
  endedAt: Date | null;
}): QueueItem {
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(row.payloadJson) as Record<string, unknown>;
  } catch {
    // malformed JSON — return empty payload rather than crashing
  }

  const item: QueueItem = {
    id: row.id,
    sessionKey: row.sessionKey,
    state: row.state as QueueItemState,
    priority: row.priority,
    dedupKey: row.dedupKey,
    payload,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
  if (row.startedAt !== null) item.startedAt = row.startedAt;
  if (row.endedAt !== null) item.endedAt = row.endedAt;
  return item;
}

// ── Create input shape ─────────────────────────────────────────────────────────

export interface CreateQueueItemInput {
  projectId: string;
  sessionKey: string;
  priority?: number;
  dedupKey: string;
  payload?: Record<string, unknown>;
  maxAttempts?: number;
}

// ── Repository ─────────────────────────────────────────────────────────────────

@Injectable()
export class QueueRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Resolve which db client to use: injected tx or the service default. */
  private db(tx?: TxClient): TxClient | PrismaService {
    return tx ?? this.prisma;
  }

  /**
   * Create a new QueueItem row and return the domain entity.
   *
   * Throws QueueDedupError if (projectId, dedupKey) already exists (I-8).
   */
  async create(input: CreateQueueItemInput, tx?: TxClient): Promise<QueueItem> {
    try {
      const row = await this.db(tx).queueItem.create({
        data: {
          projectId: input.projectId,
          sessionKey: input.sessionKey,
          state: QueueItemState.Pending,
          priority: input.priority ?? 5,
          dedupKey: input.dedupKey,
          payloadJson: JSON.stringify(input.payload ?? {}),
          maxAttempts: input.maxAttempts ?? 3,
        },
      });
      return rowToQueueItem(row);
    } catch (e) {
      if (e instanceof QueueDedupError) throw e;
      mapPrismaError(e, 'QueueRepository.create');
    }
  }

  /**
   * Find a queue item by its id. Returns null if not found.
   */
  async findById(id: string, tx?: TxClient): Promise<QueueItem | null> {
    try {
      const row = await this.db(tx).queueItem.findUnique({ where: { id } });
      return row ? rowToQueueItem(row) : null;
    } catch (e) {
      mapPrismaError(e, 'QueueRepository.findById');
    }
  }

  /**
   * Find a queue item by (projectId, dedupKey). Returns null if not found.
   * Used for idempotent enqueue checks.
   */
  async findByDedupKey(
    projectId: string,
    dedupKey: string,
    tx?: TxClient,
  ): Promise<QueueItem | null> {
    try {
      const row = await this.db(tx).queueItem.findUnique({
        where: { projectId_dedupKey: { projectId, dedupKey } },
      });
      return row ? rowToQueueItem(row) : null;
    } catch (e) {
      mapPrismaError(e, 'QueueRepository.findByDedupKey');
    }
  }

  /**
   * Atomically select the highest-priority oldest Pending item for a project
   * and transition it to Active in the same transaction.
   *
   * MUST be called inside a transaction (accepts optional tx param).
   * Implements the "atomic pick + state flip" pattern from SYNTHESIS §D2.
   *
   * Returns null if no Pending items exist for the project.
   */
  async nextForProject(
    projectId: string,
    tx?: TxClient,
  ): Promise<QueueItem | null> {
    const client = this.db(tx);
    try {
      const row = await client.queueItem.findFirst({
        where: { projectId, state: QueueItemState.Pending },
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      });
      if (!row) return null;

      const updated = await client.queueItem.update({
        where: { id: row.id },
        data: {
          state: QueueItemState.Active,
          startedAt: new Date(),
        },
      });
      return rowToQueueItem(updated);
    } catch (e) {
      mapPrismaError(e, 'QueueRepository.nextForProject');
    }
  }

  /**
   * Update the state (and optional fields) of a queue item.
   */
  async updateState(
    id: string,
    newState: QueueItemState,
    patch?: Partial<Pick<QueueItem, 'startedAt' | 'endedAt' | 'payload'>>,
    tx?: TxClient,
  ): Promise<QueueItem> {
    try {
      const data: Prisma.QueueItemUpdateInput = { state: newState };
      if (patch?.startedAt !== undefined) data.startedAt = patch.startedAt;
      if (patch?.endedAt !== undefined) data.endedAt = patch.endedAt;
      if (patch?.payload !== undefined)
        data.payloadJson = JSON.stringify(patch.payload);

      const row = await this.db(tx).queueItem.update({ where: { id }, data });
      return rowToQueueItem(row);
    } catch (e) {
      mapPrismaError(e, 'QueueRepository.updateState');
    }
  }

  /**
   * Increment the attempts counter for a queue item.
   * Optionally stores an error message in the payload for diagnostics.
   */
  async incrementAttempts(
    id: string,
    errorMessage?: string,
    tx?: TxClient,
  ): Promise<QueueItem> {
    try {
      // First fetch current payload so we can merge the error message
      const current = await this.db(tx).queueItem.findUniqueOrThrow({
        where: { id },
        select: { payloadJson: true },
      });

      let payload: Record<string, unknown> = {};
      try {
        payload = JSON.parse(current.payloadJson) as Record<string, unknown>;
      } catch {
        // ignore
      }

      if (errorMessage !== undefined) {
        payload['_lastError'] = errorMessage;
      }

      const row = await this.db(tx).queueItem.update({
        where: { id },
        data: {
          attempts: { increment: 1 },
          payloadJson: JSON.stringify(payload),
        },
      });
      return rowToQueueItem(row);
    } catch (e) {
      if (e instanceof DomainError) throw e;
      mapPrismaError(e, 'QueueRepository.incrementAttempts');
    }
  }

  /**
   * List queue items with optional filters.
   *
   * @param projectId  Filter by project (undefined = all projects)
   * @param state      Filter by state (undefined = all states)
   * @param limit      Max results (undefined = no limit)
   */
  async list(
    projectId?: string,
    state?: QueueItemState,
    limit?: number,
    tx?: TxClient,
  ): Promise<QueueItem[]> {
    try {
      const where: Prisma.QueueItemWhereInput = {};
      if (projectId !== undefined) where.projectId = projectId;
      if (state !== undefined) where.state = state;

      const rows = await this.db(tx).queueItem.findMany({
        where,
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
        ...(limit !== undefined ? { take: limit } : {}),
      });
      return rows.map(rowToQueueItem);
    } catch (e) {
      mapPrismaError(e, 'QueueRepository.list');
    }
  }
}
