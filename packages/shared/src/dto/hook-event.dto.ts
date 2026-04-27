/**
 * hook-event.dto.ts — Typed DTOs for Hook-event-related REST responses.
 *
 * I-4: consumers call HTTP API only; no @orch/core imports.
 */

/** Valid hook event type names (mirrors the hooks receiver). */
export type HookEventType =
  | 'SessionStart'
  | 'SessionEnd'
  | 'UserPromptSubmit'
  | 'AssistantResponse'
  | 'PreCompact'
  | 'PostCompact'
  | 'Stop'
  | 'SubagentStop'
  | 'Notification'
  | 'Bash'
  | 'ApiError';

/** DTO for a stored hook event record. */
export interface HookEventDto {
  id: string;
  sessionId: string;
  eventType: HookEventType;
  receivedAt: string;
  payload: Record<string, unknown>;
}
