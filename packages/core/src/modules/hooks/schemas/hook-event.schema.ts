/**
 * Zod schemas for every Claude Code hook event type.
 *
 * I-10: Every external HTTP body is validated through these schemas before any
 *       domain logic runs. Unknown fields are stripped (z.object strip mode).
 *
 * Event types from Claude Code hook taxonomy:
 *   SessionStart, PreToolUse, PostToolUse, UserPromptSubmit, Notification, Stop,
 *   SessionEnd, SubagentStop, PreCompact, PostCompact, ApiError
 *
 * The controller extracts the event type from the URL path param (:event)
 * and dispatches to the appropriate schema here.
 *
 * All schemas include `session_id` (Claude Code's hook format uses snake_case).
 * HooksService maps these to camelCase domain events.
 *
 * Note on Zod 4: z.record() requires (keyType, valueType) — two arguments.
 */

import { z } from 'zod';
import { HookDecisionSchema } from '../hook-decision.js';

// ── Common base ───────────────────────────────────────────────────────────────

/** Fields present on every hook payload from Claude Code. */
const BaseHookPayload = z.object({
  /** Claude Code session UUID. */
  session_id: z.string().min(1),
  /** ISO-8601 timestamp — optional because some hooks omit it. */
  timestamp: z.string().optional(),
});

// ── Per-event schemas ─────────────────────────────────────────────────────────

/**
 * SessionStart fires when Claude Code starts or resumes a session.
 * Spec: 003-hooks-receiver.md §31, Claude Code docs §startup/resume hooks.
 */
export const SessionStartSchema = BaseHookPayload.extend({
  /** The Claude Code session UUID (may differ from session_id in some versions). */
  claude_session_id: z.string().optional(),
  /** Model identifier reported at session start. */
  model: z.string().optional(),
  /** Whether this start is a fresh startup, resume, /clear, or /compact. */
  source: z.enum(['startup', 'resume', 'clear', 'compact']).optional(),
}).strip();

export const PreToolUseSchema = BaseHookPayload.extend({
  tool_name: z.string().min(1),
  tool_input: z.record(z.string(), z.unknown()).optional(),
  is_agent: z.boolean().optional().default(false),
  // Phase 5.3.5 — SC-12. Optional; absent = approve (backward compat).
  decision: HookDecisionSchema.optional(),
  message: z.string().optional(),
}).strip();

export const PostToolUseSchema = BaseHookPayload.extend({
  tool_name: z.string().min(1),
  tool_output: z.unknown().optional(),
  is_agent: z.boolean().optional().default(false),
  // Phase 5.3.5 — SC-12. Optional; absent = approve (backward compat).
  decision: HookDecisionSchema.optional(),
  message: z.string().optional(),
}).strip();

export const UserPromptSubmitSchema = BaseHookPayload.extend({
  /** The prompt text (may be long). */
  prompt: z.string(),
}).strip();

export const NotificationSchema = BaseHookPayload.extend({
  message: z.string(),
  /** Arbitrary structured metadata. */
  metadata: z.record(z.string(), z.unknown()).optional(),
}).strip();

export const StopSchema = BaseHookPayload.extend({
  /** Whether this stop was due to an error condition. */
  is_error: z.boolean().optional().default(false),
  stop_reason: z.string().optional(),
  // Phase 5.3.5 — SC-12. Optional; absent = approve (backward compat).
  decision: HookDecisionSchema.optional(),
  message: z.string().optional(),
}).strip();

export const SessionEndSchema = BaseHookPayload.extend({
  end_reason: z.string().optional(),
}).strip();

export const SubagentStopSchema = BaseHookPayload.extend({
  /** Identifier for the subagent that stopped. */
  subagent_id: z.string().min(1),
  is_error: z.boolean().optional().default(false),
}).strip();

export const PreCompactSchema = BaseHookPayload.extend({
  /**
   * UUID assigned by Claude Code for this compaction event.
   * Used as the deterministic dedup key: `{sessionId}-compact-{uuid}`.
   */
  compact_uuid: z.string().min(1),
  /** Summary/transcript snapshot context (if provided). */
  summary: z.string().optional(),
}).strip();

export const PostCompactSchema = BaseHookPayload.extend({
  /** UUID matching the paired PreCompact event. */
  compact_uuid: z.string().min(1),
}).strip();

/** Schema for API error events that arrive as hook POST bodies. */
export const ApiErrorSchema = BaseHookPayload.extend({
  error_type: z.string().min(1),
  error_message: z.string(),
  /** Optional retry-after hint (seconds). */
  retry_after_secs: z.number().int().positive().optional(),
}).strip();

// ── Discriminated union for all hook types ────────────────────────────────────

/** Map from URL path param value to the matching zod schema. */
export const HOOK_SCHEMAS = {
  SessionStart: SessionStartSchema,
  PreToolUse: PreToolUseSchema,
  PostToolUse: PostToolUseSchema,
  UserPromptSubmit: UserPromptSubmitSchema,
  Notification: NotificationSchema,
  Stop: StopSchema,
  SessionEnd: SessionEndSchema,
  SubagentStop: SubagentStopSchema,
  PreCompact: PreCompactSchema,
  PostCompact: PostCompactSchema,
  ApiError: ApiErrorSchema,
} as const;

/** Valid hook event type strings (must match the URL :event param). */
export type HookEventType = keyof typeof HOOK_SCHEMAS;

/** Infer the output type for a specific hook event. */
export type HookPayloadOf<T extends HookEventType> = z.output<
  (typeof HOOK_SCHEMAS)[T]
>;

/** TypeScript type for a validated SessionStart payload. */
export type SessionStartPayload = z.infer<typeof SessionStartSchema>;

/** Returns true if the given string is a valid hook event type. */
export function isValidHookEventType(value: string): value is HookEventType {
  return value in HOOK_SCHEMAS;
}
