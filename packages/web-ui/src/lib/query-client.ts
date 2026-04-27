/**
 * query-client.ts — Shared TanStack Query client instance.
 *
 * staleTime: 30s for cold data (spec requirement).
 * I-4: no @orch/core imports.
 */

import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000, // 30 seconds
      retry: 1,
    },
  },
});
