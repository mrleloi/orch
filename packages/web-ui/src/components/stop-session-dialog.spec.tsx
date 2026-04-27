/**
 * stop-session-dialog.spec.tsx — Tests for StopSessionDialog.
 *
 * 8 tests:
 *  1. Renders dialog content when open=true
 *  2. Shows "Confirm Stop" button when open
 *  3. Clicking Confirm calls onConfirm exactly once
 *  4. Clicking Cancel does NOT call onConfirm
 *  5a. Dialog closes after Confirm click (onOpenChange called with false exactly once)
 *  5b. Dialog closes after Cancel click (onOpenChange called with false exactly once)
 *  6. Dialog has role="alertdialog" (a11y)
 *  7. Escape key closes dialog without calling onConfirm (I-6 safety regression guard)
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StopSessionDialog } from './stop-session-dialog';

const SESSION_ID = 'sess-abc-123';

function renderDialog(overrides: {
  open?: boolean;
  onConfirm?: () => void;
  onOpenChange?: (open: boolean) => void;
} = {}): ReturnType<typeof render> {
  const props = {
    sessionId: SESSION_ID,
    open: overrides.open ?? true,
    onConfirm: overrides.onConfirm ?? vi.fn(),
    onOpenChange: overrides.onOpenChange ?? vi.fn(),
  };
  return render(<StopSessionDialog {...props} />);
}

describe('StopSessionDialog', () => {
  // ── Test 1: Renders dialog content when open=true ──────────────────────────

  it('renders dialog content when open=true', () => {
    renderDialog({ open: true });
    expect(screen.getByText('Stop session?')).toBeInTheDocument();
    expect(screen.getByText(SESSION_ID, { exact: false })).toBeInTheDocument();
  });

  // ── Test 2: Shows "Confirm Stop" button when open ─────────────────────────

  it('shows "Confirm Stop" button when dialog is open', () => {
    renderDialog({ open: true });
    expect(
      screen.getByRole('button', { name: 'Confirm Stop' }),
    ).toBeInTheDocument();
  });

  // ── Test 3: Confirm calls onConfirm exactly once ───────────────────────────

  it('calls onConfirm exactly once when Confirm Stop is clicked', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    renderDialog({ onConfirm });

    await user.click(screen.getByRole('button', { name: 'Confirm Stop' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  // ── Test 4: Cancel does NOT call onConfirm ─────────────────────────────────

  it('does NOT call onConfirm when Cancel is clicked', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    renderDialog({ onConfirm });

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onConfirm).not.toHaveBeenCalled();
  });

  // ── Test 5a: Confirm calls onOpenChange(false) exactly once ─────────────────

  it('calls onOpenChange(false) exactly once after Confirm is clicked', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    renderDialog({ onOpenChange });

    await user.click(screen.getByRole('button', { name: 'Confirm Stop' }));

    expect(onOpenChange).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  // ── Test 5b: Cancel calls onOpenChange(false) exactly once ──────────────────

  it('calls onOpenChange(false) exactly once after Cancel is clicked', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    renderDialog({ onOpenChange });

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onOpenChange).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  // ── Test 6: role="alertdialog" (a11y) ─────────────────────────────────────

  it('has role="alertdialog" for accessibility', () => {
    renderDialog({ open: true });
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  // ── Test 7: Escape key closes dialog without calling onConfirm ─────────────
  // I-6 safety regression guard: keyboard dismiss must not trigger session stop.

  it('calls onOpenChange(false) on Escape key and does NOT call onConfirm', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();

    renderDialog({ onConfirm, onOpenChange });

    await user.keyboard('{Escape}');

    expect(onConfirm).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
