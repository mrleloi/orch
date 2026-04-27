/**
 * token-gate-storage.ts — localStorage helpers for bearer token persistence.
 *
 * Split from token-gate.tsx to satisfy react-refresh/only-export-components.
 * Bearer token stored ONLY in localStorage (no sessionStorage dual-path).
 */

export const TOKEN_KEY = 'orch_bearer_token';

/** Retrieve stored token from localStorage. Returns null if absent. */
export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

/** Store token in localStorage. */
export function storeToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

/** Remove token from localStorage. */
export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

/**
 * Validate a bearer token against the health endpoint.
 * Returns true if the server responds 2xx, false otherwise.
 */
export async function validateToken(apiBaseUrl: string, token: string): Promise<boolean> {
  try {
    const response = await fetch(`${apiBaseUrl}/api/v1/health`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.ok;
  } catch {
    return false;
  }
}
