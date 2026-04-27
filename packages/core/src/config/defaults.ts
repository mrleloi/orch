/**
 * Centralized DEFAULT_* constants for Orch core.
 *
 * I-2: no project-specific defaults (all configurable via profile.yaml).
 * I-14: const exports only; no module-level mutable state.
 */

// Watchdog
export const DEFAULT_HEARTBEAT_TIMEOUT_MS = 180_000;
export const DEFAULT_ABSOLUTE_CEILING_MS = 1_800_000;
export const DEFAULT_SOFT_WARN_GRACE_MS = 60_000;
export const DEFAULT_WATCHDOG_INTERVAL_MS = 30_000;

// API tail
export const DEFAULT_TAIL_LINES = 20;

// Hook dedup
export const DEFAULT_DEDUP_BUCKET_MS = 60_000;

// Stderr buffering
export const DEFAULT_STDERR_BUFFER_MAX_BYTES = 256 * 1024;

// Subprocess termination
export const DEFAULT_TERMINATE_TIMEOUT_MS = 5_000;

// Tenancy — preserves single-user install backwards-compatibility (tenancy-model.md §3)
export const DEFAULT_USER = 'default-user';

// Context budget thresholds (Task 3.2; charter F4: PROJECT_CHARTER.md:83)
export const DEFAULT_CONTEXT_BUDGET_WARN_AT_TOKENS = 200_000;
export const DEFAULT_CONTEXT_BUDGET_FORCE_HANDOFF_AT_TOKENS = 230_000;

/**
 * Typed aggregate of default context budget thresholds.
 * Raw numeric constants above; this provides the ContextBudgetThresholds shape.
 *
 * Import type: ContextBudgetThresholds from modules/context-budget/context-budget.types
 * (cannot import here without a circular dep — use the raw constants above if needed
 * outside of context-budget module).
 */
export const DEFAULT_THRESHOLDS = {
  warnAtTokens: DEFAULT_CONTEXT_BUDGET_WARN_AT_TOKENS,
  forceHandoffAtTokens: DEFAULT_CONTEXT_BUDGET_FORCE_HANDOFF_AT_TOKENS,
} as const;
