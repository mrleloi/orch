/**
 * IOrchStore — persistence contract for session, queue, hook, and lock data.
 *
 * Orch domain code calls these methods without knowing whether the backing store
 * is Prisma+SQLite, in-memory (tests), or any future replacement.
 *
 * Task 1.3: Entity definitions moved to their own files; this file re-exports them
 * and defines only the draft/filter shapes needed by the store interface.
 *
 * Import from:
 *   - `../session` for Session, SessionState, SessionDraft
 *   - `../queue-item` for QueueItem, QueueItemState, QueueItemDraft
 *   - `../types/store` for IOrchStore, HookEvent
 */

import type { Session, SessionDraft } from '../session.js';
import type { QueueItem, QueueItemDraft } from '../queue-item.js';

export type { Session, SessionDraft } from '../session.js';
export type { QueueItem, QueueItemDraft } from '../queue-item.js';

/** Hook event as recorded from Claude Code's POST /hooks/:event endpoint. */
export interface HookEvent {
  id: string;
  sessionId: string;
  eventType: string;
  payload: Record<string, unknown>;
  recordedAt: Date;
}

/** Optional filter for listing queue items. */
export interface QueueFilter {
  status?: string;
  sessionKey?: string;
}

/**
 * IOrchStore — the persistence boundary between Orch domain logic and any store impl.
 *
 * All methods return Promises so sync (in-memory) and async (Prisma) impls both conform.
 * The `withTransaction` method provides an atomic scope; the impl decides the isolation level.
 */
export interface IOrchStore {
  // ── Sessions ──

  /** Persist a new session; returns the created record with generated id. */
  createSession(draft: SessionDraft): Promise<Session>;

  /** Retrieve a session by id; returns null if not found. */
  getSession(id: string): Promise<Session | null>;

  /** Apply a partial patch to an existing session; returns the updated record. */
  updateSession(id: string, patch: Partial<Session>): Promise<Session>;

  /** Return all sessions whose status indicates they are actively running. */
  listActiveSessions(): Promise<Session[]>;

  // ── Queue ──

  /** Append an item to the persistent queue; returns the created record. */
  enqueueItem(draft: QueueItemDraft): Promise<QueueItem>;

  /** Pop the next pending item atomically; returns null when queue is empty. */
  dequeueNext(): Promise<QueueItem | null>;

  /** Apply a partial patch to a queue item; returns the updated record. */
  updateQueueItem(id: string, patch: Partial<QueueItem>): Promise<QueueItem>;

  /** List queue items, optionally filtered by status or session key. */
  listQueue(filter?: QueueFilter): Promise<QueueItem[]>;

  // ── Hook events ──

  /**
   * Persist a hook event from Claude Code.
   *
   * Implementors must enforce dedup: deterministic id for compaction events,
   * content-hash for API error events (per SYNTHESIS §D2). Duplicate inserts
   * should be silently ignored (idempotent).
   */
  recordHookEvent(ev: Omit<HookEvent, 'recordedAt'>): Promise<void>;

  // ── Session locks (DB-backed) ──

  /**
   * Try to acquire a named lock for `owner` with a TTL.
   *
   * Returns true if the lock was granted, false if already held by another owner.
   * Used as the cross-process fallback; in-process lock is a Promise chain (D3).
   */
  acquireSessionLock(
    sessionKey: string,
    owner: string,
    ttlSecs: number,
  ): Promise<boolean>;

  /**
   * Extend the TTL of a lock already held by `owner`.
   *
   * Returns true if renewal succeeded (owner still holds the lock).
   */
  renewSessionLock(sessionKey: string, owner: string): Promise<boolean>;

  /** Release a lock held by `owner`; no-op if not held. */
  releaseSessionLock(sessionKey: string, owner: string): Promise<void>;

  // ── Transactions ──

  /**
   * Execute `fn` inside an atomic transaction scope.
   *
   * The `tx` argument passed to `fn` is a store bound to the transaction context;
   * all reads and writes inside `fn` participate in the same transaction.
   */
  withTransaction<T>(fn: (tx: IOrchStore) => Promise<T>): Promise<T>;
}
