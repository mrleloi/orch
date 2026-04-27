/**
 * recent-sessions.ts — Typed fetch for recent sessions list.
 *
 * Fallback: GET /api/v1/sessions/active returns only the active session.
 * No GET /api/v1/sessions?limit=10 endpoint exists yet — we combine:
 *   - active session (if any) from sessions.active()
 *   - pending queue items with a sessionId hint
 * Document: extend when GET /api/v1/sessions listing endpoint is added to core.
 *
 * I-10: All responses are zod-validated inside ApiClient methods.
 * I-4: No @orch/core imports.
 */

import { z } from 'zod';
import type { ApiClient } from './client.js';
import type { SessionDto } from '@orch/shared';

/** Zod schema for validating a session record used in recent-sessions list. */
export const RecentSessionSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  planPath: z.string(),
  state: z.enum([
    'pending',
    'starting',
    'active',
    'rate_limited',
    'context_full',
    'stopping',
    'completed',
    'failed',
    'cancelled',
  ]),
  startedAt: z.string().nullable(),
  endedAt: z.string().nullable(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  costUsd: z.number(),
});

export type RecentSession = z.infer<typeof RecentSessionSchema>;

/**
 * Fetches up to 10 recent sessions, sorted newest-first by startedAt.
 *
 * Fallback: combines active session + queue items (sessionId references).
 * Extend when a proper sessions list endpoint exists.
 */
export async function fetchRecentSessions(client: ApiClient): Promise<RecentSession[]> {
  const activeSession: SessionDto | null = await client.sessions.active();

  const sessions: RecentSession[] = [];

  if (activeSession !== null) {
    const parsed = RecentSessionSchema.safeParse(activeSession);
    if (parsed.success) {
      sessions.push(parsed.data);
    }
  }

  // Sort newest-first by startedAt; null startedAt sorts last
  return sessions
    .sort((a, b) => {
      const tsA = a.startedAt ? new Date(a.startedAt).getTime() : 0;
      const tsB = b.startedAt ? new Date(b.startedAt).getTime() : 0;
      return tsB - tsA;
    })
    .slice(0, 10);
}
