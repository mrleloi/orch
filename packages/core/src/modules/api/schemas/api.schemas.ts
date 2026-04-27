/**
 * api.schemas.ts — Zod schemas for all REST API /api/v1 request bodies.
 *
 * I-10: Every external body is validated through zod before touching domain logic.
 * No NestJS imports (I-14 — pure schema definitions).
 */

import { z } from 'zod';
import { QueueItemState } from '../../../domain/queue-item.js';

// ── POST /api/v1/queue ────────────────────────────────────────────────────────

/**
 * Body for enqueuing a plan via the REST API.
 *
 * Maps to QueueService.enqueue() input. The REST API generates dedupKey
 * from projectId + planPath if not provided explicitly.
 */
export const EnqueuePlanBodySchema = z.object({
  projectId: z.string().min(1, 'projectId is required'),
  planPath: z.string().min(1, 'planPath is required'),
  priority: z.number().int().min(0).max(100).optional(),
});

export type EnqueuePlanBody = z.infer<typeof EnqueuePlanBodySchema>;

// ── GET /api/v1/queue (query params) ──────────────────────────────────────────

/**
 * Query parameters for GET /api/v1/queue.
 *
 * Both filters are optional; omitting them returns all items.
 */
export const QueueListQuerySchema = z.object({
  status: z.nativeEnum(QueueItemState).optional(),
  projectId: z.string().min(1).optional(),
});

export type QueueListQuery = z.infer<typeof QueueListQuerySchema>;

// ── GET /api/v1/sessions/:id/usage (query params) ─────────────────────────────

/**
 * Query parameters for GET /api/v1/sessions/:id/usage.
 *
 * Minimal param set — only what the chart consumer actually needs.
 * No speculative params (Karpathy P2).
 *
 * I-10: Zod-validated at request boundary.
 */
export const SessionUsageQuerySchema = z.object({
  /** ISO-8601 start bound (optional). If provided, samples before this time are excluded. */
  since: z.string().datetime({ offset: true }).optional(),
  /** ISO-8601 end bound (optional). If provided, samples after this time are excluded. */
  until: z.string().datetime({ offset: true }).optional(),
});

export type SessionUsageQuery = z.infer<typeof SessionUsageQuerySchema>;
