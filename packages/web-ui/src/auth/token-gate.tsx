/**
 * token-gate.tsx — Auth gate that protects the app behind a bearer token.
 *
 * On load: if no token in localStorage → show prompt screen.
 * On submit: GET /api/v1/health with bearer; valid → store + render children.
 * On invalid (non-2xx) → clear storage + re-prompt.
 * On 401 mid-session → evict + re-prompt (via onUnauthorized in ApiClient).
 *
 * I-4: no @orch/core imports.
 * Bearer token stored ONLY in localStorage (no sessionStorage dual-path).
 *
 * Part B contract:
 *   export function TokenGate(props: { children: ReactNode }): JSX.Element;
 */

import { useState, useCallback, type ReactNode, type JSX } from 'react';
import { env } from '../env.js';
import { getStoredToken, storeToken, clearToken, validateToken } from './token-gate-storage.js';
import { TokenGateContext } from './token-gate-context.js';

interface TokenGateProps {
  children: ReactNode;
}

export function TokenGate(props: TokenGateProps): JSX.Element {
  const [token, setToken] = useState<string | null>(getStoredToken);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const candidate = input.trim();
      if (!candidate) return;

      setValidating(true);
      setError(null);

      const valid = await validateToken(env.orchApiBaseUrl, candidate);

      if (valid) {
        storeToken(candidate);
        setToken(candidate);
      } else {
        clearToken();
        setToken(null);
        setError('Invalid token. Please check your Orch API token and try again.');
      }

      setValidating(false);
    },
    [input],
  );

  // Token eviction callback — called by ApiClient on 401
  const handleUnauthorized = useCallback(() => {
    clearToken();
    setToken(null);
    setError('Session expired or token revoked. Please re-enter your token.');
  }, []);

  // If we have a token, render children with eviction handler available via context
  if (token !== null) {
    return (
      <TokenGateContext.Provider value={{ token, onUnauthorized: handleUnauthorized }}>
        {props.children as JSX.Element}
      </TokenGateContext.Provider>
    );
  }

  // Prompt screen
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: '1rem',
      }}
      data-testid="token-gate-prompt"
    >
      <div style={{ maxWidth: '400px', width: '100%' }}>
        <h1 style={{ marginBottom: '1rem' }}>Orch Dashboard</h1>
        <p style={{ marginBottom: '1.5rem', color: '#666' }}>
          Enter your Orch API bearer token to continue.
        </p>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1rem' }}>
            <label htmlFor="token-input" style={{ display: 'block', marginBottom: '0.5rem' }}>
              Bearer Token
            </label>
            <input
              id="token-input"
              type="password"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Enter token..."
              disabled={validating}
              style={{ width: '100%', padding: '0.5rem', boxSizing: 'border-box' }}
              data-testid="token-input"
            />
          </div>
          {error != null && (
            <p
              style={{ color: 'red', marginBottom: '1rem' }}
              role="alert"
              data-testid="token-error"
            >
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={validating || input.trim().length === 0}
            data-testid="token-submit"
          >
            {validating ? 'Validating...' : 'Connect'}
          </button>
        </form>
      </div>
    </div>
  );
}
