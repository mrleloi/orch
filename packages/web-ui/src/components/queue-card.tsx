/**
 * queue-card.tsx — Single queue item card for the KanbanPage.
 *
 * Renders:
 *   - projectId
 *   - planPath basename (strips directory prefix)
 *   - relative startedAt ("2 min ago") via Intl.RelativeTimeFormat — no extra dep
 *   - Stop button (variant="destructive") ONLY when item.state === 'running'
 *     Stop button onClick calls parent's onStopRequest(item.id) — controlled
 *     dialog state lives in KanbanPage.
 *
 * I-3: No @anthropic-ai / openai imports.
 * I-4: No @orch/core imports.
 */

import type { JSX } from 'react';
import type { QueueItemDto } from '@orch/shared';
import { Card, CardContent } from './ui/card.js';
import { Button } from './ui/button.js';
import { formatRelativeTime, pathBasename } from '../lib/queue-card-utils.js';

// ── Component ─────────────────────────────────────────────────────────────────

export interface QueueCardProps {
  item: QueueItemDto;
  /** Called with the item's id when the Stop button is clicked. */
  onStopRequest: (sessionId: string) => void;
}

/**
 * QueueCard — renders a single queue item.
 *
 * Stop button is rendered ONLY when item.state === 'running'.
 * Clicking Stop calls onStopRequest(item.id) — the confirmation dialog
 * (StopSessionDialog) is controlled by the parent KanbanPage.
 *
 * I-6: Stop button opens a confirmation dialog in the parent; this component
 *      NEVER calls apiClient.sessions.stop directly.
 */
export function QueueCard({ item, onStopRequest }: QueueCardProps): JSX.Element {
  const basename = pathBasename(item.planPath);
  const relativeTime = formatRelativeTime(item.startedAt);

  return (
    <Card
      data-testid={`queue-card-${item.id}`}
      className="p-3"
    >
      <CardContent className="p-0 space-y-1">
        <p
          data-testid={`queue-card-project-${item.id}`}
          className="text-sm font-medium truncate"
        >
          {item.projectId}
        </p>
        <p
          data-testid={`queue-card-plan-${item.id}`}
          className="text-xs text-muted-foreground truncate"
        >
          {basename}
        </p>
        <p
          data-testid={`queue-card-time-${item.id}`}
          className="text-xs text-muted-foreground"
        >
          {relativeTime}
        </p>

        {/* Stop button — only when running (I-6: opens dialog in parent, never calls stop directly) */}
        {item.state === 'running' && (
          <Button
            data-testid={`queue-card-stop-${item.id}`}
            variant="destructive"
            size="sm"
            onClick={() => { onStopRequest(item.id); }}
          >
            Stop
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
