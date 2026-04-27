/**
 * MailboxService — peer messaging between concurrent workers.
 *
 * Phase 5.3 / SC-9: Workers communicate by sending messages through the
 * WorkerMailbox table. The daemon does NOT interpret messages (I-1 daemon-dumb).
 * This service is the only public API for the mailbox; no LLM calls.
 *
 * Method contract:
 *   send        — insert a new message row (no unique constraint; idempotent at call
 *                 level means two identical calls produce 2 rows).
 *   pollUnread  — FIFO poll of unread messages; optionally marks them read in same
 *                 call. Limit defaults to 50, validated by repository (I-10).
 *   markRead    — flip read=true for the supplied IDs. Empty ids → no-op.
 *   archiveBefore — delete messages older than cutoff. Dormant in v2.0 (Q5).
 *
 * I-1:  No LLM calls.
 * I-12: Prisma errors wrapped in DomainError (handled in MailboxRepository).
 * I-14: No module-level mutable state.
 * Architecture.md §Layer 1: MailboxMessage interface lives here for v2.0.
 */

import { Injectable } from '@nestjs/common';
import { MailboxRepository } from './mailbox.repository.js';

// ── Domain types ───────────────────────────────────────────────────────────────

/** Represents a persisted mailbox message returned to callers. */
export interface MailboxMessage {
  id: string;
  toWorker: string;
  fromWorker: string;
  message: string;
  read: boolean;
  createdAt: Date;
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class MailboxService {
  constructor(private readonly repo: MailboxRepository) {}

  /**
   * Send a message to a peer worker.
   *
   * Inserts a new WorkerMailbox row with read=false.
   * No unique constraint: two identical sends produce 2 distinct rows.
   *
   * @returns The persisted row's id.
   */
  async send(input: {
    to: string;
    from: string;
    message: string;
  }): Promise<{ id: string }> {
    return this.repo.insert({
      toWorker: input.to,
      fromWorker: input.from,
      message: input.message,
    });
  }

  /**
   * Poll unread messages for a worker (FIFO — createdAt ASC).
   *
   * @param toWorker   The recipient worker ID.
   * @param opts.limit       Max rows to return (default 50). Validated ≥1 ≤1000 by repo (I-10).
   * @param opts.markRead    If true, atomically flips read=true on the returned rows.
   *                         Default false — caller decides ack semantics.
   */
  async pollUnread(
    toWorker: string,
    opts?: { limit?: number; markRead?: boolean },
  ): Promise<MailboxMessage[]> {
    const limit = opts?.limit;
    const shouldMarkRead = opts?.markRead ?? false;

    const messages = await this.repo.findUnread(toWorker, limit);

    if (shouldMarkRead && messages.length > 0) {
      const ids = messages.map((m) => m.id);
      await this.repo.markRead(ids);
      // Return messages with read=true to reflect the flip
      return messages.map((m) => ({ ...m, read: true }));
    }

    return messages;
  }

  /**
   * Mark messages as read.
   *
   * @param ids  List of message IDs to mark read. Empty list is a no-op.
   * @returns    Count of rows actually updated.
   */
  async markRead(ids: string[]): Promise<{ updated: number }> {
    return this.repo.markRead(ids);
  }

  /**
   * Archive (delete) messages older than `before`.
   *
   * Dormant in v2.0 (Q5 in 5.3 architect doc) — ships implemented but not
   * invoked by any daemon logic. A future admin command will call this.
   *
   * @returns Count of rows deleted.
   */
  async archiveBefore(before: Date): Promise<{ archived: number }> {
    const { deleted } = await this.repo.deleteBefore(before);
    return { archived: deleted };
  }
}
