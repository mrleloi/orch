/**
 * nav-shell.spec.tsx — Tests for the NavShell component.
 *
 * 4 tests:
 *   1. "renders all 4 nav links"
 *   2. "renders children below nav"
 *   3. "current route link has aria-current='page'"
 *   4. "no sessions nav link (deep-link only)"
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NavShell } from './nav-shell.js';

/** Render NavShell inside a MemoryRouter at the given path. */
function renderNavShell(path: string, children?: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <NavShell>{children ?? <div data-testid="test-child">child content</div>}</NavShell>
    </MemoryRouter>,
  );
}

describe('NavShell', () => {
  it('renders all 4 nav links', () => {
    renderNavShell('/');
    expect(screen.getByTestId('nav-link-dashboard')).toBeInTheDocument();
    expect(screen.getByTestId('nav-link-activity')).toBeInTheDocument();
    expect(screen.getByTestId('nav-link-kanban')).toBeInTheDocument();
    expect(screen.getByTestId('nav-link-settings')).toBeInTheDocument();
  });

  it('renders children below nav', () => {
    renderNavShell('/', <div data-testid="page-content">hello</div>);
    const nav = screen.getByRole('navigation');
    const content = screen.getByTestId('page-content');
    expect(nav).toBeInTheDocument();
    expect(content).toBeInTheDocument();
    // Children are rendered inside <main>, which follows <nav> in the DOM
    expect(content).toHaveTextContent('hello');
  });

  it("current route link has aria-current='page'", () => {
    renderNavShell('/activity');
    const activityLink = screen.getByTestId('nav-link-activity');
    expect(activityLink).toHaveAttribute('aria-current', 'page');
    // Other links should NOT have aria-current
    expect(screen.getByTestId('nav-link-dashboard')).not.toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('nav-link-kanban')).not.toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('nav-link-settings')).not.toHaveAttribute('aria-current', 'page');
  });

  it('no sessions nav link (deep-link only)', () => {
    renderNavShell('/');
    // There must be no link with slug "sessions" — /sessions/:id is deep-link only
    expect(screen.queryByTestId('nav-link-sessions')).not.toBeInTheDocument();
    // Also verify no anchor pointing to /sessions path
    const allLinks = screen.getAllByRole('link');
    const sessionLinks = allLinks.filter((el) =>
      el.getAttribute('href')?.startsWith('/sessions'),
    );
    expect(sessionLinks).toHaveLength(0);
  });
});
