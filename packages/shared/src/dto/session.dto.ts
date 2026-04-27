/**
 * session.dto.ts — Typed DTOs for Session-related REST responses.
 *
 * These mirror the core daemon's REST API shapes. @orch/telegram and @orch/web
 * import these types for fetch response parsing — they do NOT import @orch/core.
 * (I-4: one-way dependency; consumers call HTTP API only.)
 */

/** Valid session state values (mirrors SessionState domain enum). */
export type SessionState =
  | 'pending'
  | 'starting'
  | 'active'
  | 'rate_limited'
  | 'context_full'
  | 'stopping'
  | 'completed'
  | 'failed'
  | 'cancelled';

/** DTO returned by GET /api/v1/sessions/active and GET /api/v1/sessions/:id */
export interface SessionDto {
  id: string;
  projectId: string;
  planPath: string;
  state: SessionState;
  claudeSessionId: string | null;
  startedAt: string | null;
  endedAt: string | null;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  traceId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Alias used when explicitly fetching the active (running) session. */
export type ActiveSessionDto = SessionDto;

/** Summary DTO for session list endpoints. */
export interface SessionSummaryDto {
  id: string;
  projectId: string;
  state: SessionState;
  startedAt: string | null;
  endedAt: string | null;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

/**
 * DTO returned by GET /api/v1/sessions/:id/tail?lines=N
 *
 * lines     — the tail lines from the session stdout ring buffer
 * truncated — true when the ring buffer held more data than was returned
 *             (i.e. lines was clamped or the buffer overflowed)
 */
export interface TailResponseDto {
  lines: string[];
  truncated: boolean;
}
