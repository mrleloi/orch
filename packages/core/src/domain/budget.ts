/**
 * Token budget calculation stubs — Phase 3 budget enforcer will flesh these out.
 *
 * These functions are the surface the Phase 3 context-budget-enforcer module will
 * call. Defining stubs now means feature modules can import them immediately without
 * coupling to Phase 3 internals.
 *
 * Design notes (SYNTHESIS §3 — NICE / Phase 3):
 *   - soft@200K  → trigger handoff builder (start summarising)
 *   - hard@230K  → halt, emit session log, announce handoff
 *   - 250K cap   → hard cap per R-1; if crossed session is compromised
 *
 * All constants are exported so callers can display them in UI / logs.
 */

// ── Thresholds ────────────────────────────────────────────────────────────────

/** Soft threshold in tokens — triggers handoff builder start (Phase 3). */
export const TOKEN_SOFT_THRESHOLD = 200_000;

/** Hard threshold in tokens — halt dispatch, emit session log, announce handoff. */
export const TOKEN_HARD_THRESHOLD = 230_000;

/** Absolute cap — never exceed. If crossed, session is already compromised. */
export const TOKEN_ABSOLUTE_CAP = 250_000;

// ── Public API ────────────────────────────────────────────────────────────────

export interface BudgetThresholds {
  soft: number;
  hard: number;
  absoluteCap: number;
}

/**
 * Returns the default budget thresholds.
 *
 * Stub — Phase 3 will allow overriding via profile.yaml.
 */
export function getDefaultThresholds(): BudgetThresholds {
  return {
    soft: TOKEN_SOFT_THRESHOLD,
    hard: TOKEN_HARD_THRESHOLD,
    absoluteCap: TOKEN_ABSOLUTE_CAP,
  };
}

/**
 * Rough token estimate from raw text using the 4-chars-per-token heuristic.
 *
 * This is intentionally imprecise — used only for budget guard checks before
 * the session reports real token counts via OTEL spans. Phase 3 will replace
 * this with a proper tokenizer or use Claude's reported values exclusively.
 *
 * @param text  The text whose token count to estimate
 * @returns     Estimated token count (always ≥ 1 for non-empty input)
 */
export function estimateTokens(text: string): number {
  if (!text || text.length === 0) {
    return 0;
  }
  // 4 characters per token is the standard rough heuristic for English text.
  return Math.max(1, Math.ceil(text.length / 4));
}

export type HandoffDecision = 'ok' | 'soft-warn' | 'hard-stop';

/**
 * Determine whether a session should trigger a handoff based on token usage.
 *
 * Returns:
 *   - `'ok'`        — below soft threshold, continue normally
 *   - `'soft-warn'` — between soft and hard thresholds, start building handoff context
 *   - `'hard-stop'` — at or above hard threshold, stop dispatching new work
 *
 * @param totalTokens  Total tokens consumed by the current session
 * @param thresholds   Budget thresholds (defaults if omitted)
 */
export function shouldTriggerHandoff(
  totalTokens: number,
  thresholds: BudgetThresholds = getDefaultThresholds(),
): HandoffDecision {
  if (totalTokens >= thresholds.hard) {
    return 'hard-stop';
  }
  if (totalTokens >= thresholds.soft) {
    return 'soft-warn';
  }
  return 'ok';
}

/**
 * Returns true if the given token count exceeds the absolute cap.
 *
 * If this returns true, the current session is likely already compromised and
 * should be force-terminated regardless of other budget state.
 */
export function isOverAbsoluteCap(
  totalTokens: number,
  thresholds: BudgetThresholds = getDefaultThresholds(),
): boolean {
  return totalTokens > thresholds.absoluteCap;
}
