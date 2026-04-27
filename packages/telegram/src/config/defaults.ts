/**
 * defaults.ts — Centralised DEFAULT_* constants for the @orch/telegram package.
 *
 * Addresses Phase 1 Task 1.9 carryover: all Telegram defaults declared here,
 * not scattered as inline literals.
 *
 * I-2: no hardcoded project names.
 * I-14: no framework imports.
 */

/** Telegram long-poll timeout in milliseconds. Grammy default is 30s; we keep it. */
export const DEFAULT_POLL_TIMEOUT_MS = 30_000;

/**
 * Maximum number of Telegram API retries on transient errors before giving up.
 * Grammy handles retries internally; this is documented here for reference.
 */
export const DEFAULT_API_MAX_RETRIES = 3;

/** Timeout for each /status command's HTTP calls to the core daemon, in milliseconds. */
export const DEFAULT_COMMAND_TIMEOUT_MS = 10_000;

/**
 * Rate limit: minimum milliseconds between consecutive /status replies per chat.
 * Prevents unbounded concurrent status requests from the same chat.
 */
export const DEFAULT_STATUS_DEBOUNCE_MS = 500;
