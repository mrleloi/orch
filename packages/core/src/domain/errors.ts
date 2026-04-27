/**
 * Domain error hierarchy for Orch.
 *
 * All errors extend DomainError so callers can use a single `instanceof DomainError`
 * catch and still introspect the specific failure mode via the `code` discriminator.
 *
 * Aligns with I-12: adapter failures are wrapped into typed subclasses before
 * bubbling to domain logic — raw Node errors never escape the adapter boundary.
 *
 * Secret redaction: DomainError redacts its message at construction time so no
 * secret ever leaks through error.message, JSON.stringify(error), or log lines
 * that capture the message property.
 *
 * Details redaction strategy (Task 2.10.a): per-string-leaf walk.
 * Rationale: JSON round-trip would stringify non-string leaves and potentially
 * produce redacted representations of numeric/boolean values. Walking leaves
 * ensures only string values are passed through redactSecrets(), non-string
 * values are preserved exactly. This is simpler and safer than JSON round-trip.
 */

import { redactSecrets } from '../modules/security/secret-redactor.js';

/**
 * Options accepted by DomainError and all subclasses.
 * Backwards-compatible: existing `{ cause }` usage continues to work.
 */
export interface DomainErrorOptions {
  cause?: unknown;
  details?: Record<string, unknown>;
  retryable?: boolean;
}

/**
 * Walk a Record<string, unknown> and apply redactSecrets() to every string leaf.
 * Non-string values are passed through unchanged.
 * Nested objects are walked recursively.
 * Arrays are not handled (spec does not require it; treat as opaque).
 */
function redactDetailsLeaves(
  details: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    if (typeof value === 'string') {
      result[key] = redactSecrets(value);
    } else if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value)
    ) {
      result[key] = redactDetailsLeaves(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/** Base class for all Orch domain errors. */
export class DomainError extends Error {
  /** Machine-readable error code — used for routing, logging, and metrics. */
  readonly code: string;

  /**
   * Optional cause chain (mirrors the standard Error `cause` option but typed
   * as `unknown` to keep strict-null-checks happy with `catch (e: unknown)`).
   */
  override readonly cause: unknown;

  /**
   * Structured context for this error.
   * All string leaf values are redacted at construction time via redactSecrets().
   */
  readonly details: Record<string, unknown>;

  /**
   * Whether this error condition is transient and the operation can be retried.
   * Default: false. Subclasses (e.g. RateLimitError, SessionLockHeldError) override to true.
   */
  readonly retryable: boolean;

  constructor(code: string, message: string, options?: DomainErrorOptions) {
    // Redact secrets from the message before storing — pay once at construction.
    super(redactSecrets(message));
    this.name = this.constructor.name;
    this.code = code;
    this.cause = options?.cause;
    this.details = redactDetailsLeaves(options?.details ?? {});
    this.retryable = options?.retryable ?? false;

    // Restore prototype chain after `extends Error` (TypeScript quirk in ES5 targets).
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /**
   * Serialise this error to a plain object safe for Web UI error boundaries and
   * structured logging. Intentionally excludes raw stack traces.
   *
   * cause is serialised as `{ name, message, code? }` when it is an Error instance,
   * to avoid leaking stack traces through the cause chain.
   */
  toJSON(): {
    name: string;
    code: string;
    message: string;
    retryable: boolean;
    details: Record<string, unknown>;
    cause: unknown;
  } {
    let serialisedCause: unknown;
    if (this.cause instanceof DomainError) {
      // Recurse into the full DomainError shape so details/retryable/inner cause
      // are not silently dropped when the cause chain contains DomainErrors.
      serialisedCause = this.cause.toJSON();
    } else if (this.cause instanceof Error) {
      serialisedCause = {
        name: this.cause.name,
        message: this.cause.message,
      };
    } else {
      serialisedCause = this.cause;
    }

    return {
      name: this.name,
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      details: this.details,
      cause: serialisedCause,
    };
  }
}

// ── Profile ──────────────────────────────────────────────────────────────────

/**
 * Thrown when a `.orch/profile.yaml` fails zod schema validation.
 *
 * Carries the raw zod issues so the project-registry can surface them
 * as structured diagnostics rather than unformatted strings.
 */
export class ProfileValidationError extends DomainError {
  /** Raw validation issues from the zod parse result. */
  readonly issues: ReadonlyArray<{
    path: (string | number)[];
    message: string;
  }>;

  constructor(
    message: string,
    issues: ReadonlyArray<{ path: (string | number)[]; message: string }>,
    options?: DomainErrorOptions,
  ) {
    super('PROFILE_VALIDATION_ERROR', message, {
      ...options,
      details: { issues, ...(options?.details ?? {}) },
      retryable: false,
    });
    this.issues = issues;
  }
}

// ── State machine ─────────────────────────────────────────────────────────────

/**
 * Thrown when a domain event triggers an illegal state transition.
 *
 * Example: trying to apply `SessionEnd` to a session that is `Idle` (never started).
 */
export class StateTransitionError extends DomainError {
  readonly fromState: string;
  readonly event: string;

  constructor(fromState: string, event: string, options?: DomainErrorOptions) {
    super(
      'STATE_TRANSITION_ERROR',
      `Illegal transition: cannot apply event "${event}" in state "${fromState}"`,
      {
        ...options,
        details: { fromState, event, ...(options?.details ?? {}) },
        retryable: false,
      },
    );
    this.fromState = fromState;
    this.event = event;
  }
}

// ── Runtime / adapter ─────────────────────────────────────────────────────────

/**
 * Thrown when the ccs / claude CLI cannot be spawned.
 *
 * Typical causes: binary not on PATH, ENOENT, permission denied.
 */
export class RuntimeSpawnError extends DomainError {
  constructor(message: string, options?: DomainErrorOptions) {
    super('RUNTIME_SPAWN_ERROR', message, { ...options, retryable: false });
  }
}

/**
 * Thrown when `git worktree add` fails during ClaudeCodeAdapter.spawn().
 *
 * Extends RuntimeSpawnError so existing classifyError() contracts hold:
 * `instanceof RuntimeSpawnError` is true (I-12 adapter failure isolation).
 * Phase 6.3 / Decision 018.
 */
export class WorktreeCreateError extends RuntimeSpawnError {}

// ── Rate limiting ─────────────────────────────────────────────────────────────

/**
 * Thrown when the Claude API signals a rate-limit during an active session.
 *
 * The `retryAfterSecs` hint (if provided) drives the ccs failover / backoff logic.
 */
export class RateLimitError extends DomainError {
  /** Seconds to wait before retry, if signalled by the API. */
  readonly retryAfterSecs?: number;

  constructor(
    message: string,
    options?: DomainErrorOptions & { retryAfterSecs?: number },
  ) {
    const retryAfterSecs = options?.retryAfterSecs;
    super('RATE_LIMIT_ERROR', message, {
      ...options,
      details: {
        ...(retryAfterSecs !== undefined ? { retryAfterSecs } : {}),
        ...(options?.details ?? {}),
      },
      retryable: true,
    });
    if (retryAfterSecs !== undefined) {
      this.retryAfterSecs = retryAfterSecs;
    }
  }
}

// ── Context / budget ──────────────────────────────────────────────────────────

/**
 * Thrown when a session's token budget is exhausted and the context window is full.
 *
 * Triggers the handoff builder (Phase 3) to produce a summary before terminating.
 */
export class ContextFullError extends DomainError {
  constructor(message: string, options?: DomainErrorOptions) {
    super('CONTEXT_FULL_ERROR', message, { ...options, retryable: false });
  }
}

// ── Security ──────────────────────────────────────────────────────────────────

/**
 * Thrown when a hook POST fails the `X-Orch-Hook-Secret` header validation.
 *
 * Should result in HTTP 401 at the controller layer; must NOT log the secret value.
 */
export class HookAuthError extends DomainError {
  constructor(
    message = 'Hook request failed authentication',
    options?: DomainErrorOptions,
  ) {
    super('HOOK_AUTH_ERROR', message, { ...options, retryable: false });
  }
}

// ── Request queue ─────────────────────────────────────────────────────────────

/**
 * Thrown when a pending task in RequestQueue is rejected because the queue for
 * that sessionKey was cancelled via `RequestQueue.cancel()`.
 *
 * The in-flight task (currently processing) is NOT affected — it continues to
 * completion. Only tasks that were waiting in the pending list are rejected
 * with this error.
 *
 * I-12: extends DomainError.
 */
export class QueueCancelledError extends DomainError {
  /** The session key whose queue was cancelled. */
  readonly sessionKey: string;

  constructor(sessionKey: string, options?: DomainErrorOptions) {
    super(
      'QUEUE_CANCELLED_ERROR',
      `Request queue for session "${sessionKey}" was cancelled — pending tasks rejected`,
      {
        ...options,
        details: { sessionKey, ...(options?.details ?? {}) },
        retryable: false,
      },
    );
    this.sessionKey = sessionKey;
  }
}

// ── Session lock ──────────────────────────────────────────────────────────────

/**
 * Thrown when `SessionManager.runSession()` attempts to acquire the DB-backed
 * lock for a session that is already locked by another process.
 *
 * Callers should surface this as a "session already running elsewhere" condition
 * and NOT retry immediately (the other process holds an active lock with a TTL).
 *
 * I-12: extends DomainError.
 */
export class SessionLockHeldError extends DomainError {
  /** The session key for which the lock could not be acquired. */
  readonly sessionKey: string;

  constructor(sessionKey: string, options?: DomainErrorOptions) {
    super(
      'SESSION_LOCK_HELD',
      `Session lock for "${sessionKey}" is already held by another process`,
      {
        ...options,
        details: { sessionKey, ...(options?.details ?? {}) },
        retryable: true,
      },
    );
    this.sessionKey = sessionKey;
  }
}

// ── Database / persistence ────────────────────────────────────────────────────

/**
 * Thrown when a Prisma INSERT violates a unique constraint (P2002).
 *
 * Structural check only — no @prisma/client import (I-14).
 * Retryable=false: the duplicate row already exists; caller should deduplicate.
 */
export class DuplicateRecordError extends DomainError {
  readonly model: string;
  readonly target: readonly string[];

  constructor(
    model: string,
    target: readonly string[],
    options?: { cause?: unknown },
  ) {
    super(
      'DUPLICATE_RECORD',
      `Unique constraint violation on ${model}(${target.join(',')})`,
      { cause: options?.cause, retryable: false, details: { model, target } },
    );
    this.model = model;
    this.target = target;
  }
}

// ── Queue quarantine ──────────────────────────────────────────────────────────

/**
 * Thrown when a queue item has exceeded the maximum retry count and is moved to
 * the `Quarantined` state to prevent infinite failure loops.
 */
export class QuarantineError extends DomainError {
  /** The queue item id that was quarantined. */
  readonly queueItemId: string;

  /** Number of attempts made before quarantine. */
  readonly attempts: number;

  constructor(
    queueItemId: string,
    attempts: number,
    options?: DomainErrorOptions,
  ) {
    super(
      'QUARANTINE_ERROR',
      `Queue item "${queueItemId}" quarantined after ${attempts} failed attempts`,
      {
        ...options,
        details: { queueItemId, attempts, ...(options?.details ?? {}) },
        retryable: false,
      },
    );
    this.queueItemId = queueItemId;
    this.attempts = attempts;
  }
}
