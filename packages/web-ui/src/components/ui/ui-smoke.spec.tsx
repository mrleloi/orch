/**
 * ui-smoke.spec.tsx — Smoke tests for shadcn/ui primitives.
 *
 * Renders each primitive once and asserts no crash + DOM presence.
 * Verifies the design system is correctly bundled.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from './button';
import { Card, CardContent, CardHeader, CardTitle } from './card';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogAction,
  AlertDialogCancel,
} from './alert-dialog';
import { Badge } from './badge';
import { Skeleton } from './skeleton';

describe('Button primitive', () => {
  it('renders without crashing', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
  });
});

describe('Card primitive', () => {
  it('renders without crashing', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Test Card</CardTitle>
        </CardHeader>
        <CardContent>Content here</CardContent>
      </Card>,
    );
    expect(screen.getByText('Test Card')).toBeInTheDocument();
    expect(screen.getByText('Content here')).toBeInTheDocument();
  });
});

describe('AlertDialog primitive', () => {
  it('renders trigger and shows content when open', () => {
    render(
      <AlertDialog open>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction>Continue</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>,
    );
    expect(screen.getByText('Are you sure?')).toBeInTheDocument();
    expect(screen.getByText('This action cannot be undone.')).toBeInTheDocument();
  });
});

describe('Badge primitive', () => {
  it('renders without crashing', () => {
    render(<Badge>Running</Badge>);
    expect(screen.getByText('Running')).toBeInTheDocument();
  });
});

describe('Skeleton primitive', () => {
  it('renders without crashing', () => {
    const { container } = render(<Skeleton className="h-4 w-full" />);
    expect(container.firstChild).toHaveClass('animate-pulse');
  });
});
