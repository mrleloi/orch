/**
 * Domain event types for Orch — discriminated union over all observable hook events.
 *
 * Each variant corresponds to a Claude Code hook event type sent to POST /hooks/:event.
 * Source: Claude-Code-Agent-Monitor.md §3-4 + hooks documentation.
 *
 * Naming convention:
 *   - Event type names match Claude Code hook names exactly (PascalCase).
 *   - `kind` discriminant is the hook event name as received in the URL path.
 *
 * These are DOMAIN events, not hook payloads — the HooksService translates
 * raw HTTP bodies into these typed events before touching domain logic.
 */

// ── Base ──────────────────────────────────────────────────────────────────────

/** Fields common to every domain event. */
export interface BaseEvent {
  /** Orch-internal session id (maps to Session.id in DB). */
  sessionId: string;
  /** ISO-8601 timestamp when this event was recorded by Orch. */
  recordedAt: string;
}

// ── Session lifecycle ─────────────────────────────────────────────────────────

/**
 * Claude Code started a new session (the first hook fired after spawn).
 *
 * Drives: Idle → Starting (if not already), ensures DB session row exists.
 */
export interface SessionStartEvent extends BaseEvent {
  kind: 'SessionStart';
  /** Claude Code session ID from the hook payload. */
  claudeSessionId: string;
  /** Model identifier reported by Claude Code. */
  model?: string;
  /** Whether this start is a fresh startup, resume, /clear, or /compact. */
  source?: string;
}

/**
 * User pressed Escape / sent Ctrl-C — Claude Code finished its current turn but
 * the session is NOT ended. The user can still type.
 *
 * CRITICAL: `Stop` does NOT terminate the session (Agent-Monitor §2 key insight).
 * Drives: Running → Stopping (transient; stays Stopping until user input or SessionEnd).
 */
export interface StopEvent extends BaseEvent {
  kind: 'Stop';
  /** Whether the stop was triggered by an error (drives session → error vs idle). */
  isError: boolean;
}

/**
 * The Claude Code process has fully exited — session is definitively ended.
 *
 * This is the ONLY event that drives a session to the `Ended` terminal state.
 * Source: Agent-Monitor §2 "SessionEnd (not Stop) terminates a session".
 */
export interface SessionEndEvent extends BaseEvent {
  kind: 'SessionEnd';
  /** Exit reason as reported by Claude Code. */
  endReason?: string;
}

// ── Compaction ────────────────────────────────────────────────────────────────

/**
 * Claude Code is about to compact its context window.
 *
 * Transient signal — no session state change. Orch records the span event
 * and creates a dedup-safe compaction entry (id = `{sessionId}-compact-{uuid}`).
 */
export interface PreCompactEvent extends BaseEvent {
  kind: 'PreCompact';
  /** Compact entry UUID from Claude Code (used for dedup — I-8). */
  compactUuid: string;
}

/**
 * Claude Code finished compacting its context window.
 *
 * Transient signal — no session state change. Orch persists the hook record
 * and emits a span event for tracing.
 */
export interface PostCompactEvent extends BaseEvent {
  kind: 'PostCompact';
  /** Compact entry UUID matching the paired PreCompact event. */
  compactUuid: string;
}

// ── Tool use ──────────────────────────────────────────────────────────────────

/**
 * Claude Code is about to use a tool (fires before the tool executes).
 *
 * Drives: agent state → working.
 */
export interface PreToolUseEvent extends BaseEvent {
  kind: 'PreToolUse';
  /** Tool name (e.g. "Bash", "Read", "Write"). */
  toolName: string;
  /** Whether this is an Agent sub-tool (spawns a subagent). */
  isAgent: boolean;
}

/**
 * Claude Code finished using a tool.
 *
 * Drives: clears current_tool on agent (stays working overall).
 * NOTE: For Agent tools, fires when the subagent BACKGROUNDS, not when it finishes.
 */
export interface PostToolUseEvent extends BaseEvent {
  kind: 'PostToolUse';
  toolName: string;
  isAgent: boolean;
}

// ── Subagent ──────────────────────────────────────────────────────────────────

/**
 * A subagent (spawned by an Agent tool) has finished its work.
 *
 * Only `SubagentStop` (or `SessionEnd`) marks a subagent as completed.
 * The session stays active; only the matching subagent slot is closed.
 */
export interface SubagentStopEvent extends BaseEvent {
  kind: 'SubagentStop';
  /** Identifier for the subagent — used to correlate with the spawning PreToolUse. */
  subagentId: string;
}

// ── Notifications ─────────────────────────────────────────────────────────────

/**
 * Claude Code emitted a notification (includes compaction summaries, system messages).
 *
 * Transient — no state change. Routed to the notifier channel adapter.
 */
export interface NotificationEvent extends BaseEvent {
  kind: 'Notification';
  /** Human-readable notification body. */
  message: string;
  /** Structured metadata from the hook payload (if any). */
  meta?: Record<string, unknown>;
}

// ── Errors ────────────────────────────────────────────────────────────────────

/**
 * Claude Code reported an API error during a session.
 *
 * Dedup key: content-hash of `type + message` (Agent-Monitor §1 dedup strategy).
 */
export interface ApiErrorEvent extends BaseEvent {
  kind: 'ApiError';
  /** Error type string from the Claude API (e.g. "overloaded_error"). */
  errorType: string;
  /** Human-readable error message. */
  errorMessage: string;
}

/**
 * Rate-limit detected on the active session (either from API error or stderr pattern).
 *
 * Drives: Running → RateLimited. Adapter handles ccs failover elsewhere.
 */
export interface RateLimitDetectedEvent extends BaseEvent {
  kind: 'RateLimitDetected';
  /** Seconds to wait before retry, if extractable from the error response. */
  retryAfterSecs?: number;
}

/**
 * Watchdog detected that the session has not produced a heartbeat within the
 * allowed window — the process may be hung.
 *
 * Drives: Running → Failed (after grace period logic in watchdog, decided in Task 1.9c).
 */
export interface HeartbeatTimeoutEvent extends BaseEvent {
  kind: 'HeartbeatTimeout';
  /** Milliseconds since the last recorded heartbeat. */
  heartbeatAgeMs: number;
}

/**
 * User submitted a prompt to the active session.
 *
 * Recorded for tracing and audit; does not drive a state transition.
 */
export interface UserPromptSubmitEvent extends BaseEvent {
  kind: 'UserPromptSubmit';
  /** Redacted prompt text (secret-redactor applied before storage). */
  promptText: string;
}

// ── Hook decision ─────────────────────────────────────────────────────────────

/**
 * A PreToolUse hook returned `decision=deny` — the tool MUST NOT execute.
 *
 * Phase 5.3.5 — SC-12. SessionManager subscribes to this via `tool.denied`
 * EventBus channel and suppresses the corresponding writeStdin call (I-11).
 */
export interface ToolDeniedEvent extends BaseEvent {
  kind: 'ToolDenied';
  /** Tool name that was denied (from PreToolUse payload). */
  toolName: string;
  /** Human-readable denial reason from the hook (optional). */
  message: string | undefined;
}

// ── Discriminated union ───────────────────────────────────────────────────────

/**
 * Every possible domain event in Orch.
 *
 * Use the `kind` discriminant to narrow the type in switch statements.
 */
export type DomainEvent =
  | SessionStartEvent
  | StopEvent
  | SessionEndEvent
  | PreCompactEvent
  | PostCompactEvent
  | PreToolUseEvent
  | PostToolUseEvent
  | SubagentStopEvent
  | NotificationEvent
  | ApiErrorEvent
  | RateLimitDetectedEvent
  | HeartbeatTimeoutEvent
  | UserPromptSubmitEvent
  | ToolDeniedEvent;

/** Extract the `kind` literal union for use in type-guards and maps. */
export type DomainEventKind = DomainEvent['kind'];
