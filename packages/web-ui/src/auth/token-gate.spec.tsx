/**
 * token-gate.spec.tsx — Tests for TokenGate auth component.
 *
 * Covers:
 * 1. No token → prompt screen rendered
 * 2. Invalid token → clears storage + shows error
 * 3. Valid token → renders children
 * 4. 401 mid-session → evicts + re-prompts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useContext } from 'react';
import { TokenGate } from './token-gate.js';
import { getStoredToken, clearToken, storeToken } from './token-gate-storage.js';
import { TokenGateContext, type TokenGateContextValue } from './token-gate-context.js';

// ── Helpers ────────────────────────────────────────────────────────────────────

const TOKEN_KEY = 'orch_bearer_token';

function clearStorage() {
  localStorage.removeItem(TOKEN_KEY);
}

// ── Mock fetch ─────────────────────────────────────────────────────────────────

const mockFetch = vi.fn();

beforeEach(() => {
  clearStorage();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearStorage();
  vi.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TokenGate', () => {
  it('shows prompt when no token is stored', () => {
    render(<TokenGate><div data-testid="child">App Content</div></TokenGate>);
    expect(screen.getByTestId('token-gate-prompt')).toBeInTheDocument();
    expect(screen.queryByTestId('child')).not.toBeInTheDocument();
  });

  it('renders children when a valid token is stored', () => {
    storeToken('valid-token-abc');
    render(<TokenGate><div data-testid="child">App Content</div></TokenGate>);
    expect(screen.getByTestId('child')).toBeInTheDocument();
    expect(screen.queryByTestId('token-gate-prompt')).not.toBeInTheDocument();
  });

  it('validates token via health endpoint and stores on success', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

    render(<TokenGate><div data-testid="child">App Content</div></TokenGate>);

    // Should start with prompt
    expect(screen.getByTestId('token-gate-prompt')).toBeInTheDocument();

    // Enter token
    const input = screen.getByTestId('token-input');
    await userEvent.type(input, 'my-bearer-token');

    // Submit
    const submit = screen.getByTestId('token-submit');
    await userEvent.click(submit);

    // Should now render children
    await waitFor(() => {
      expect(screen.getByTestId('child')).toBeInTheDocument();
    });

    expect(getStoredToken()).toBe('my-bearer-token');
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch.mock.calls[0][1]).toMatchObject({
      headers: { Authorization: 'Bearer my-bearer-token' },
    });
  });

  it('shows error and clears token when validation fails (non-2xx)', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });

    render(<TokenGate><div data-testid="child">App Content</div></TokenGate>);

    const input = screen.getByTestId('token-input');
    await userEvent.type(input, 'bad-token');
    await userEvent.click(screen.getByTestId('token-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('token-error')).toBeInTheDocument();
    });

    expect(screen.getByTestId('token-gate-prompt')).toBeInTheDocument();
    expect(screen.queryByTestId('child')).not.toBeInTheDocument();
    expect(getStoredToken()).toBeNull();
  });

  it('shows error and clears token when validation throws (network error)', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network failure'));

    render(<TokenGate><div data-testid="child">App Content</div></TokenGate>);

    const input = screen.getByTestId('token-input');
    await userEvent.type(input, 'bad-token');
    await userEvent.click(screen.getByTestId('token-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('token-error')).toBeInTheDocument();
    });

    expect(getStoredToken()).toBeNull();
  });

  it('evicts token and re-prompts when onUnauthorized is called (401 mid-session)', async () => {
    storeToken('valid-token');

    // Child that triggers onUnauthorized from context
    function ChildWithEviction(): JSX.Element {
      const ctx = useContext(TokenGateContext) as TokenGateContextValue;
      return (
        <div>
          <span data-testid="child">App Content</span>
          <button
            data-testid="trigger-unauthorized"
            onClick={() => ctx.onUnauthorized()}
          >
            Trigger 401
          </button>
        </div>
      );
    }

    render(
      <TokenGate>
        <ChildWithEviction />
      </TokenGate>,
    );

    // Should be authenticated
    expect(screen.getByTestId('child')).toBeInTheDocument();

    // Trigger 401 eviction
    await act(async () => {
      await userEvent.click(screen.getByTestId('trigger-unauthorized'));
    });

    // Should show prompt again
    await waitFor(() => {
      expect(screen.getByTestId('token-gate-prompt')).toBeInTheDocument();
    });

    expect(getStoredToken()).toBeNull();
    expect(screen.queryByTestId('child')).not.toBeInTheDocument();
  });
});

describe('localStorage helpers', () => {
  it('storeToken and getStoredToken round-trip', () => {
    storeToken('test-token-123');
    expect(getStoredToken()).toBe('test-token-123');
  });

  it('clearToken removes stored token', () => {
    storeToken('test-token-123');
    clearToken();
    expect(getStoredToken()).toBeNull();
  });
});
