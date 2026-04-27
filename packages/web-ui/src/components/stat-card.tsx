/**
 * stat-card.tsx — Reusable dashboard stat card.
 *
 * Renders:
 *   - label + value + lucide icon in the happy path
 *   - <Skeleton> during isLoading
 *   - destructive <Card> + retry button on isError
 *
 * I-4: No @orch/core imports.
 * I-3: No @anthropic-ai / openai imports.
 */

import type { JSX, ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card.js';
import { Skeleton } from './ui/skeleton.js';
import { Button } from './ui/button.js';
import { cn } from '@/lib/utils';

export interface StatCardProps {
  /** Test id — used for data-testid on the root element. */
  testId: string;
  /** Short label shown above the value (e.g. "Active Session"). */
  label: string;
  /** Formatted value string (e.g. "1", "$1.23"). */
  value: string;
  /** Lucide icon element (or any ReactNode). */
  icon: ReactNode;
  /** Whether the data is currently loading. */
  isLoading: boolean;
  /** Whether the query is in an error state. */
  isError: boolean;
  /** Called when the user clicks "Retry" in the error state. */
  onRetry: () => void;
}

/**
 * StatCard — displays a single stat with label, value, and icon.
 * Shows Skeleton while loading; shows error card with retry on error.
 */
export function StatCard({
  testId,
  label,
  value,
  icon,
  isLoading,
  isError,
  onRetry,
}: StatCardProps): JSX.Element {
  if (isLoading) {
    return (
      <Card data-testid={testId} className="p-6">
        <Skeleton className="h-4 w-24 mb-2" />
        <Skeleton className="h-8 w-16" />
      </Card>
    );
  }

  if (isError) {
    return (
      <Card
        data-testid={testId}
        className={cn('p-6 border-destructive bg-destructive/10')}
      >
        <CardHeader className="p-0 pb-2">
          <CardTitle className="text-sm font-medium text-destructive">{label}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <p className="text-sm text-destructive mb-3">Failed to load</p>
          <Button
            variant="destructive"
            size="sm"
            onClick={onRetry}
            data-testid={`${testId}-retry`}
          >
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid={testId} className="p-6">
      <CardHeader className="p-0 pb-2 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <span className="text-muted-foreground" aria-hidden="true">
          {icon}
        </span>
      </CardHeader>
      <CardContent className="p-0">
        <p className="text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}
