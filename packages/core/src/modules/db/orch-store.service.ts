/**
 * OrchStoreService — NestJS-injectable implementation of IOrchStore.
 *
 * This is the adapter boundary (I-14): all Prisma imports stop here.
 * Domain code calls IOrchStore methods; this class translates them to Prisma queries.
 *
 * Error mapping (I-12):
 *   Prisma P2002 (unique constraint) → DedupViolationError
 *   Prisma P2025 (record not found)  → DomainError('RECORD_NOT_FOUND')
 *   All other Prisma errors          → DomainError('STORE_ERROR') wrapping the cause
 *
 * Transaction support: `withTransaction` wraps the callback in `prisma.$transaction`.
 * The `tx` argument is an OrchStoreService instance bound to the Prisma tx client.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import type { Session, SessionDraft } from '../../domain/session.js';
import { SessionState } from '../../domain/session.js';
import type { QueueItem, QueueItemDraft } from '../../domain/queue-item.js';
import { QueueItemState } from '../../domain/queue-item.js';
import type {
  HookEvent,
  IOrchStore,
  QueueFilter,
} from '../../domain/types/store.js';
import { DomainError } from '../../domain/errors.js';
import { PrismaService } from './prisma.service.js';

// ── Error helpers ─────────────────────────────────────────────────────────────

/**
 * Thrown when a unique constraint violation is detected on a dedup key.
 * I-8: duplicate hook events are silently ignored at the store level.
 */
export class DedupViolationError extends DomainError {
  constructor(message: string, options?: { cause?: unknown }) {
    super('DEDUP_VIOLATION', message, options);
  }
}

/**
 * Thrown when a record lookup finds no matching row.
 */
export class RecordNotFoundError extends DomainError {
  constructor(entity: string, id: string, options?: { cause?: unknown }) {
    super('RECORD_NOT_FOUND', `${entity} with id "${id}" not found`, options);
  }
}

// ── Prisma error code constants ───────────────────────────────────────────────

const PRISMA_UNIQUE_VIOLATION = 'P2002';
const PRISMA_NOT_FOUND = 'P2025';
/** P2021: table does not exist (e.g. DB torn down before deferred async resolves). */
const PRISMA_TABLE_NOT_FOUND = 'P2021';

/**
 * Duck-typed Prisma known-request-error check.
 * Avoids `instanceof Prisma.PrismaClientKnownRequestError` across the pnpm
 * virtual-store resolution gap — the `code` property is the authoritative
 * discriminator for Prisma known request errors.
 */
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
      throw new DedupViolationError(
        `Unique constraint violation in ${context}`,
        { cause: e },
      );
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

// ── Row ↔ domain mappers ──────────────────────────────────────────────────────

function rowToSession(row: {
  id: string;
  projectId: string;
  sessionKey: string;
  state: string;
  model: string | null;
  claudeSessionId: string | null;
  tokensUsed: number | null;
  endReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
  endedAt: Date | null;
  worktreePath?: string | null;
}): Session {
  // Build the session object conditionally to satisfy exactOptionalPropertyTypes
  const session: Session = {
    id: row.id,
    projectId: row.projectId,
    sessionKey: row.sessionKey,
    state: row.state as SessionState,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
  if (row.model !== null) session.model = row.model;
  if (row.claudeSessionId !== null)
    session.claudeSessionId = row.claudeSessionId;
  if (row.tokensUsed !== null) session.tokensUsed = row.tokensUsed;
  if (row.endReason !== null) session.endReason = row.endReason;
  if (row.startedAt !== null) session.startedAt = row.startedAt;
  if (row.endedAt !== null) session.endedAt = row.endedAt;
  // worktreePath: null (cleaned up) or string (active path) — only set when present
  if (row.worktreePath !== undefined) session.worktreePath = row.worktreePath;
  return session;
}

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
    // malformed JSON stored — return empty payload rather than throwing
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

// ── Tx-client type (Prisma interactive tx delegate) ───────────────────────────

// When using prisma.$transaction(async (tx) => ...), `tx` is a Prisma-delegated
// client that omits lifecycle methods. We use PrismaClient directly here.
type TxClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class OrchStoreService implements IOrchStore {
  // `prisma` is declared with `protected` access so the internal transaction-scoped
  // subinstances can override it without using readonly. Use `protected` not `private`
  // to allow the subclass trick.
  protected db: PrismaService | TxClient;
  protected readonly logger: Logger;

  constructor(prisma: PrismaService) {
    this.db = prisma;
    this.logger = new Logger(OrchStoreService.name);
  }

  /**
   * Returns a store instance bound to the given transaction client.
   * Used internally by `withTransaction`.
   */
  private withTxClient(tx: TxClient): OrchStoreService {
    const scoped = Object.create(
      OrchStoreService.prototype,
    ) as OrchStoreService;
    scoped.db = tx;
    return scoped;
  }

  // ── Sessions ───────────────────────────────────────────────────────────────

  async createSession(draft: SessionDraft): Promise<Session> {
    try {
      const row = await this.db.session.create({
        data: {
          projectId: draft.projectId,
          sessionKey: draft.sessionKey,
          state: SessionState.Idle,
          model: draft.model ?? null,
        },
      });
      return rowToSession(row);
    } catch (e) {
      mapPrismaError(e, 'createSession');
    }
  }

  async getSession(id: string): Promise<Session | null> {
    try {
      const row = await this.db.session.findUnique({ where: { id } });
      return row ? rowToSession(row) : null;
    } catch (e) {
      mapPrismaError(e, 'getSession');
    }
  }

  async updateSession(id: string, patch: Partial<Session>): Promise<Session> {
    try {
      const data: Prisma.SessionUpdateInput = {};
      if (patch.state !== undefined) data.state = patch.state;
      if (patch.model !== undefined) data.model = patch.model;
      if (patch.claudeSessionId !== undefined)
        data.claudeSessionId = patch.claudeSessionId;
      if (patch.tokensUsed !== undefined) data.tokensUsed = patch.tokensUsed;
      if (patch.endReason !== undefined) data.endReason = patch.endReason;
      if (patch.startedAt !== undefined) data.startedAt = patch.startedAt;
      if (patch.endedAt !== undefined) data.endedAt = patch.endedAt;
      // Phase 6.3 — worktreePath: string to set the path, null to clear after prune.
      // Use Prisma `set` semantics to allow explicit null (column is nullable TEXT).
      if ('worktreePath' in patch) {
        data.worktreePath = patch.worktreePath ?? null;
      }

      const row = await this.db.session.update({ where: { id }, data });
      return rowToSession(row);
    } catch (e) {
      mapPrismaError(e, 'updateSession');
    }
  }

  async listActiveSessions(): Promise<Session[]> {
    try {
      const rows = await this.db.session.findMany({
        where: {
          state: {
            in: [
              SessionState.Starting,
              SessionState.Running,
              SessionState.Stopping,
              SessionState.RateLimited,
            ],
          },
        },
      });
      return rows.map(rowToSession);
    } catch (e) {
      mapPrismaError(e, 'listActiveSessions');
    }
  }

  // ── Queue ──────────────────────────────────────────────────────────────────

  async enqueueItem(draft: QueueItemDraft): Promise<QueueItem> {
    try {
      const logicalProjectId = this.sessionKeyToProjectId(draft.sessionKey);
      // Look up the Project DB row by its logical projectId (stored in profileJson).
      // SQLite JSON_EXTRACT allows us to query inside the JSON column.
      const project = await this.db.project.findFirst({
        where: {
          profileJson: {
            contains: `"projectId":"${logicalProjectId}"`,
          },
        },
      });

      if (!project) {
        throw new DomainError(
          'RECORD_NOT_FOUND',
          `Project with logical id "${logicalProjectId}" not found`,
        );
      }

      const row = await this.db.queueItem.create({
        data: {
          projectId: project.id,
          sessionKey: draft.sessionKey,
          state: QueueItemState.Pending,
          priority: draft.priority ?? 0,
          dedupKey: draft.dedupKey,
          payloadJson: JSON.stringify(draft.payload ?? {}),
          maxAttempts: draft.maxAttempts ?? 3,
        },
      });
      return rowToQueueItem(row);
    } catch (e) {
      if (e instanceof DomainError) throw e;
      mapPrismaError(e, 'enqueueItem');
    }
  }

  async dequeueNext(): Promise<QueueItem | null> {
    // Atomic: find highest-priority pending item and mark it Active in one transaction.
    // For SQLite the nested $transaction is safe: WAL + busy_timeout=5000 prevents SQLITE_BUSY.
    try {
      const prismaService = this.db as PrismaService;
      return await prismaService.$transaction(async (tx) => {
        const row = await tx.queueItem.findFirst({
          where: { state: QueueItemState.Pending },
          orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
        });
        if (!row) return null;
        const updated = await tx.queueItem.update({
          where: { id: row.id },
          data: {
            state: QueueItemState.Active,
            startedAt: new Date(),
            attempts: { increment: 1 },
          },
        });
        return rowToQueueItem(updated);
      });
    } catch (e) {
      mapPrismaError(e, 'dequeueNext');
    }
  }

  async updateQueueItem(
    id: string,
    patch: Partial<QueueItem>,
  ): Promise<QueueItem> {
    try {
      const data: Prisma.QueueItemUpdateInput = {};
      if (patch.state !== undefined) data.state = patch.state;
      if (patch.priority !== undefined) data.priority = patch.priority;
      if (patch.attempts !== undefined) data.attempts = patch.attempts;
      if (patch.startedAt !== undefined) data.startedAt = patch.startedAt;
      if (patch.endedAt !== undefined) data.endedAt = patch.endedAt;
      if (patch.payload !== undefined)
        data.payloadJson = JSON.stringify(patch.payload);

      const row = await this.db.queueItem.update({ where: { id }, data });
      return rowToQueueItem(row);
    } catch (e) {
      mapPrismaError(e, 'updateQueueItem');
    }
  }

  async listQueue(filter?: QueueFilter): Promise<QueueItem[]> {
    try {
      const where: Prisma.QueueItemWhereInput = {};
      if (filter?.status !== undefined) where.state = filter.status;
      if (filter?.sessionKey !== undefined)
        where.sessionKey = filter.sessionKey;

      const rows = await this.db.queueItem.findMany({
        where,
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      });
      return rows.map(rowToQueueItem);
    } catch (e) {
      mapPrismaError(e, 'listQueue');
    }
  }

  // ── Hook events ────────────────────────────────────────────────────────────

  async recordHookEvent(ev: Omit<HookEvent, 'recordedAt'>): Promise<void> {
    try {
      await this.db.hookEvent.create({
        data: {
          id: ev.id,
          sessionId: ev.sessionId,
          eventType: ev.eventType,
          payloadJson: JSON.stringify(ev.payload),
          dedupKey: `${ev.sessionId}:${ev.eventType}:${ev.id}`,
        },
      });
    } catch (e) {
      if (isPrismaKnownError(e)) {
        if (e.code === PRISMA_UNIQUE_VIOLATION) {
          // I-8: duplicate hook event — silently ignore
          return;
        }
      }
      mapPrismaError(e, 'recordHookEvent');
    }
  }

  // ── Session locks ──────────────────────────────────────────────────────────

  async acquireSessionLock(
    sessionKey: string,
    owner: string,
    ttlSecs: number,
  ): Promise<boolean> {
    const expiresAt = new Date(Date.now() + ttlSecs * 1000);
    try {
      // Clean up any expired lock first (best-effort)
      await this.db.sessionLock.deleteMany({
        where: { sessionKey, expiresAt: { lt: new Date() } },
      });
      // Attempt to create the lock (PK on sessionKey = unique constraint)
      await this.db.sessionLock.create({
        data: { sessionKey, owner, expiresAt },
      });
      return true;
    } catch (e) {
      if (isPrismaKnownError(e)) {
        if (e.code === PRISMA_UNIQUE_VIOLATION) {
          return false; // lock already held by another owner
        }
      }
      mapPrismaError(e, 'acquireSessionLock');
    }
  }

  async renewSessionLock(sessionKey: string, owner: string): Promise<boolean> {
    try {
      const existing = await this.db.sessionLock.findUnique({
        where: { sessionKey },
      });
      if (!existing || existing.owner !== owner) return false;
      const expiresAt = new Date(Date.now() + 30_000);
      await this.db.sessionLock.update({
        where: { sessionKey },
        data: { expiresAt },
      });
      return true;
    } catch (e) {
      mapPrismaError(e, 'renewSessionLock');
    }
  }

  async releaseSessionLock(sessionKey: string, owner: string): Promise<void> {
    try {
      await this.db.sessionLock.deleteMany({ where: { sessionKey, owner } });
    } catch (e) {
      // P2021 (table not found) means the DB was torn down before this deferred
      // async-void chain resolved (common in test teardown when _handleGracefulEnd
      // fires after Prisma onModuleDestroy). The lock holder no longer exists —
      // treat as a successful release rather than surfacing a spurious error.
      if (isPrismaKnownError(e) && e.code === PRISMA_TABLE_NOT_FOUND) {
        this.logger.warn({
          msg: 'session-lock:release-on-torn-down-db',
          sessionKey,
          owner,
          code: 'P2021',
        });
        return;
      }
      mapPrismaError(e, 'releaseSessionLock');
    }
  }

  // ── Transactions ───────────────────────────────────────────────────────────

  async withTransaction<T>(fn: (tx: IOrchStore) => Promise<T>): Promise<T> {
    const prismaService = this.db as PrismaService;
    return prismaService.$transaction(async (txClient) => {
      const txStore = this.withTxClient(txClient);
      return fn(txStore);
    });
  }

  // ── Internal helpers ───────────────────────────────────────────────────────

  /**
   * Extracts projectId from a sessionKey (`{projectId}:{type}:{threadId}`).
   * Falls back to the full key if format doesn't match.
   */
  private sessionKeyToProjectId(sessionKey: string): string {
    const colonIdx = sessionKey.indexOf(':');
    return colonIdx >= 0 ? sessionKey.slice(0, colonIdx) : sessionKey;
  }
}
