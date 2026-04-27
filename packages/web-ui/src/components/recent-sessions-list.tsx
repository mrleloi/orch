/**
 * recent-sessions-list.tsx — Renders the last-10 sessions sorted newest-first.
 *
 * States:
 *   - Loading: shows Skeleton rows
 *   - Error: shows error message
 *   - Empty: shows "No recent sessions" message
 *   - Populated: shows up to 10 session rows
 *
 * I-4: No @orch/core imports.
 * I-3: No @anthropic-ai / openai imports.
 */

import type { JSX } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card.js';
import { Skeleton } from './ui/skeleton.js';
import { Badge } from './ui/badge.js';
import type { RecentSession } from '../api/recent-sessions.js';

export interface RecentSessionsListProps {
  sessions: RecentSession[];
  isLoading: boolean;
  isError: boolean;
}

/** Maps session state to a badge variant for visual differentiation. */
function stateVariant(
  state: RecentSession['state'],
): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (state) {
    case 'active':
    case 'starting':
      return 'default';
    case 'completed':
      return 'secondary';
    case 'failed':
    case 'cancelled':
      return 'destructive';
    default:
      return 'outline';
  }
}

/** Formats a nullable ISO date string as a short locale date, or "—" if null. */
function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * RecentSessionsList — renders up to 10 sessions sorted newest-first.
 */
export function RecentSessionsList({
  sessions,
  isLoading,
  isError,
}: RecentSessionsListProps): JSX.Element {
  return (
    <Card data-testid="recent-sessions-list">
      <CardHeader>
        <CardTitle className="text-base">Recent Sessions</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="space-y-3" data-testid="recent-sessions-loading">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        )}

        {!isLoading && isError && (
          <p className="text-sm text-destructive" data-testid="recent-sessions-error">
            Failed to load recent sessions.
          </p>
        )}

        {!isLoading && !isError && sessions.length === 0 && (
          <p className="text-sm text-muted-foreground" data-testid="recent-sessions-empty">
            No recent sessions
          </p>
        )}

        {!isLoading && !isError && sessions.length > 0 && (
          <ul className="divide-y" data-testid="recent-sessions-items">
            {sessions.map((session) => (
              <li
                key={session.id}
                className="py-3 flex items-center justify-between"
                data-testid={`session-row-${session.id}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{session.projectId}</p>
                  <p className="text-xs text-muted-foreground truncate">{session.planPath}</p>
                </div>
                <div className="ml-4 flex flex-col items-end gap-1 shrink-0">
                  <Badge variant={stateVariant(session.state)}>{session.state}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(session.startedAt)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
