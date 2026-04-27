/**
 * Hook-module specific error types.
 *
 * All extend DomainError (I-12).
 */

import { DomainError } from '../../domain/errors.js';

/**
 * Thrown when an incoming hook payload fails zod schema validation.
 * Controller catches this and returns HTTP 400.
 */
export class HookValidationError extends DomainError {
  readonly issues: ReadonlyArray<{
    path: (string | number)[];
    message: string;
  }>;

  constructor(
    eventType: string,
    issues: ReadonlyArray<{ path: (string | number)[]; message: string }>,
    options?: { cause?: unknown },
  ) {
    super(
      'HOOK_VALIDATION_ERROR',
      `Hook payload for event "${eventType}" failed validation`,
      options,
    );
    this.issues = issues;
  }
}

/**
 * Thrown when an unknown hook event type is received (not in HOOK_SCHEMAS).
 * Controller catches this and returns HTTP 400.
 */
export class UnknownHookEventError extends DomainError {
  constructor(eventType: string, options?: { cause?: unknown }) {
    super(
      'UNKNOWN_HOOK_EVENT',
      `Unknown hook event type: "${eventType}"`,
      options,
    );
  }
}
