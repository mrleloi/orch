/**
 * @orch/shared — barrel export.
 *
 * Exports:
 *  - SSE event types and envelope schema (zod)
 *  - REST API DTOs for Session, Project, QueueItem, HookEvent
 *  - Env schemas for telegram + web consumers
 *
 * I-4: @orch/telegram and @orch/web import from here — NEVER from @orch/core.
 * I-14: no @nestjs imports in this package.
 */

// Events
export { ALL_EVENT_TYPES, EndedReason } from './events/event-types.js';
export type { EventType, EndedReasonValue } from './events/event-types.js';
export { SseEnvelopeSchema, parseSseEnvelope } from './events/sse-envelope.js';
export type { SseEnvelope } from './events/sse-envelope.js';

// DTOs
export type {
  SessionDto,
  ActiveSessionDto,
  SessionSummaryDto,
  SessionState,
  TailResponseDto,
} from './dto/session.dto.js';
export type { ProjectDto } from './dto/project.dto.js';
export type {
  QueueItemDto,
  QueueStatusDto,
  QueueItemState,
} from './dto/queue.dto.js';
export type { HookEventDto, HookEventType } from './dto/hook-event.dto.js';

// Env schemas
export {
  sharedEnvSchema,
  telegramEnvSchema,
  validateTelegramEnv,
  webEnvSchema,
  otelEnvSchema,
} from './env/schema.js';
export type { TelegramEnv, WebEnv, OtelEnv } from './env/schema.js';

// Security
export { redactSecrets, clipPlanPath, SECRET_PATTERNS } from './security/redact.js';
export type { RedactorFn } from './security/redact.js';
