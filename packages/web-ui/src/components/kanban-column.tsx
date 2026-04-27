/**
 * kanban-column.tsx — Generic Kanban column with header and card list.
 *
 * Pure presentation component. Renders:
 *   - Column heading: "<title> (<count>)"
 *   - List of items using renderItem callback
 *   - Empty state placeholder when items.length === 0
 *
 * I-3: No @anthropic-ai / openai imports.
 * I-4: No @orch/core imports.
 */

import type { ReactNode, JSX } from 'react';

export interface KanbanColumnProps<T> {
  /** Column heading text (e.g. "Pending") */
  title: string;
  /** Item count shown in heading: "<title> (<count>)" */
  count: number;
  /** Items to render */
  items: T[];
  /** Render callback for each item */
  renderItem: (item: T) => ReactNode;
  /** Placeholder copy for empty column. Defaults to "No items". */
  emptyCopy?: string;
}

/**
 * KanbanColumn — renders a titled column with a list of cards.
 *
 * Empty state shows `emptyCopy` (default: "No items") inside a
 * data-testid="kanban-column-empty-<title>" element for test targeting.
 */
export function KanbanColumn<T>({
  title,
  count,
  items,
  renderItem,
  emptyCopy = 'No items',
}: KanbanColumnProps<T>): JSX.Element {
  const columnId = title.toLowerCase();

  return (
    <section
      data-testid={`kanban-column-${columnId}`}
      aria-label={`${title} column`}
      className="flex flex-col gap-3 min-w-0"
    >
      {/* Column header */}
      <div className="flex items-center gap-2 px-1">
        <h2
          data-testid={`kanban-column-heading-${columnId}`}
          className="text-sm font-semibold text-muted-foreground uppercase tracking-wide"
        >
          {title} ({count})
        </h2>
      </div>

      {/* Card list */}
      <div className="flex flex-col gap-2">
        {items.length === 0 ? (
          <p
            data-testid={`kanban-column-empty-${columnId}`}
            className="text-xs text-muted-foreground px-1 py-2"
          >
            {emptyCopy}
          </p>
        ) : (
          items.map((item) => renderItem(item))
        )}
      </div>
    </section>
  );
}
