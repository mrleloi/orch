/**
 * sse-url.ts — Shared SSE stream URL builder.
 *
 * Extracted from DashboardPage + KanbanPage (2.8.b helper-extraction).
 * ActivityPage and any future SSE consumer should use this instead of
 * inlining the template.
 *
 * I-3: No @anthropic-ai / openai imports.
 * I-4: No @orch/core imports.
 */

/**
 * Build the SSE stream URL with the bearer token embedded as a query param.
 *
 * BearerAuthGuard accepts `?token=` as a fallback for browser EventSource
 * (which cannot set Authorization headers).
 *
 * The caller is responsible for not invoking this when `token` is empty —
 * this function handles empty strings without throwing; the resulting URL
 * simply carries an empty token query param.
 */
export function buildSseStreamUrl(token: string): string {
  return `/api/v1/events/stream?token=${encodeURIComponent(token)}`;
}
