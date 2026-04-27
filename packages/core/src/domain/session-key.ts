/**
 * SessionKey — branded string that uniquely identifies a running session slot.
 *
 * Using a branded type prevents raw strings from being passed where a SessionKey
 * is expected, catching a category of wiring bugs at compile time.
 */

import { DomainError } from './errors.js';

/** Branded string — construct only via the `sessionKey()` factory. */
export type SessionKey = string & { readonly __brand: 'SessionKey' };

/**
 * Build a deterministic SessionKey from its constituent parts.
 *
 * Determinism is required for the in-process Promise-chain lock (D3): callers
 * must always produce the same key for the same logical session so that the
 * Map<SessionKey, Promise> correctly serializes concurrent work.
 *
 * @param projectId   - Registry-assigned project identifier (non-empty)
 * @param sessionType - Session classification e.g. "impl", "review" (non-empty)
 * @param threadId    - Conversation branch within the session; defaults to "main"
 */
export function sessionKey(
  projectId: string,
  sessionType: string,
  threadId = 'main',
): SessionKey {
  if (!projectId) {
    throw new DomainError(
      'SESSION_KEY_INVALID',
      '[orch] sessionKey: projectId must not be empty',
    );
  }
  if (!sessionType) {
    throw new DomainError(
      'SESSION_KEY_INVALID',
      '[orch] sessionKey: sessionType must not be empty',
    );
  }
  if (!threadId) {
    throw new DomainError(
      'SESSION_KEY_INVALID',
      '[orch] sessionKey: threadId must not be empty',
    );
  }
  return `${projectId}:${sessionType}:${threadId}` as SessionKey;
}
