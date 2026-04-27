import * as crypto from 'node:crypto';

/**
 * Redact a sessionKey for log emission.
 *
 * Default: sha256(raw).hex.slice(0, 12) — PII-safe, collision-safe enough for log correlation.
 * Debug:   when env ORCH_DEBUG_SESSION_KEYS === '1', returns raw (dev only, never default).
 */
export function redactSessionKey(raw: string): string {
  if (process.env['ORCH_DEBUG_SESSION_KEYS'] === '1') return raw;
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 12);
}
