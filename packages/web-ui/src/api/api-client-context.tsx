/**
 * api-client-context.ts — React context + hook providing a memoized ApiClient.
 *
 * The client is memoized on [token, onUnauthorized] so re-renders do not
 * churn new ApiClient instances. Bound to baseUrl from env.
 *
 * Usage:
 *   - Wrap children with <ApiClientProvider> inside TokenGate.
 *   - Consume with useApiClient() in any descendant component.
 *
 * I-4: No @orch/core imports.
 * I-3: No @anthropic-ai / openai imports.
 */

import { createContext, useContext, useMemo, type ReactNode, type JSX } from 'react';
import { ApiClient } from './client.js';
import { useTokenGate } from '../auth/token-gate-context.js';
import { env } from '../env.js';

// ── Context ───────────────────────────────────────────────────────────────────

/**
 * Exported so test harnesses can provide a mock ApiClient directly
 * without needing a full TokenGate + ApiClientProvider tree.
 */
export const ApiClientContext = createContext<ApiClient | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

interface ApiClientProviderProps {
  children: ReactNode;
}

/**
 * Provides a memoized ApiClient instance to descendant components.
 * Must be rendered inside <TokenGate> so useTokenGate() is available.
 */
export function ApiClientProvider(props: ApiClientProviderProps): JSX.Element {
  const { token, onUnauthorized } = useTokenGate();

  // Memoize client on [token, onUnauthorized] — stable identity across re-renders.
  const client = useMemo(
    () =>
      new ApiClient({
        baseUrl: env.orchApiBaseUrl,
        getToken: () => token,
        onUnauthorized,
      }),
    [token, onUnauthorized],
  );

  return (
    <ApiClientContext.Provider value={client}>
      {props.children as JSX.Element}
    </ApiClientContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Returns the memoized ApiClient from context.
 * Throws if called outside <ApiClientProvider>.
 */
export function useApiClient(): ApiClient {
  const client = useContext(ApiClientContext);
  if (client === null) {
    throw new Error('useApiClient must be used within ApiClientProvider');
  }
  return client;
}
