/**
 * token-gate-context.ts — React context and hook for TokenGate.
 *
 * Split from token-gate.tsx to satisfy react-refresh/only-export-components.
 * I-4: no @orch/core imports.
 */

import { createContext, useContext } from 'react';

export interface TokenGateContextValue {
  token: string;
  onUnauthorized: () => void;
}

export const TokenGateContext = createContext<TokenGateContextValue | null>(null);

/** Hook to access the authenticated token and the 401 eviction handler. */
export function useTokenGate(): TokenGateContextValue {
  const ctx = useContext(TokenGateContext);
  if (ctx === null) {
    throw new Error('useTokenGate must be used within TokenGate');
  }
  return ctx;
}
