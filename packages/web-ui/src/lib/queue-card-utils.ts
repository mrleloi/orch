/**
 * queue-card-utils.ts — Pure utility helpers for queue card display.
 *
 * Extracted from queue-card.tsx to satisfy the src/lib/ vs src/components/
 * convention and avoid react-refresh/only-export-components lint warnings.
 *
 * I-3: No @anthropic-ai / openai imports.
 * I-4: No @orch/core imports.
 */

// ── Relative-time helper ───────────────────────────────────────────────────────

/**
 * Formats a UTC ISO timestamp as a human-readable relative string.
 * Uses Intl.RelativeTimeFormat with "auto" numeric mode and "short" style.
 * Examples: "2 min. ago", "1 hr. ago", "just now".
 * Falls back to the raw string if parsing fails.
 */
export function formatRelativeTime(isoTimestamp: string | null): string {
  if (isoTimestamp === null) return '—';

  const now = Date.now();
  let then: number;
  try {
    then = new Date(isoTimestamp).getTime();
  } catch {
    return isoTimestamp;
  }

  if (Number.isNaN(then)) return isoTimestamp;

  const diffMs = then - now; // negative = in the past
  const diffSec = Math.round(diffMs / 1000);
  const diffMin = Math.round(diffMs / 60_000);
  const diffHour = Math.round(diffMs / 3_600_000);
  const diffDay = Math.round(diffMs / 86_400_000);

  // Intl.RelativeTimeFormat options: "auto" numeric hides "in X seconds" for 0,
  // "short" keeps the output compact.
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto', style: 'short' });

  if (Math.abs(diffSec) < 60) return rtf.format(diffSec, 'second');
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, 'minute');
  if (Math.abs(diffHour) < 24) return rtf.format(diffHour, 'hour');
  return rtf.format(diffDay, 'day');
}

/**
 * Returns the basename of a file path (strips leading directories).
 * "/plans/sub/task.md" → "task.md"
 */
export function pathBasename(planPath: string): string {
  // Handle both Unix and Windows separators
  const parts = planPath.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] ?? planPath;
}
