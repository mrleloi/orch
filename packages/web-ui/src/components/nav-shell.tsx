/**
 * nav-shell.tsx — Shared navigation shell rendered on every route.
 *
 * Renders a top nav bar with 4 links (Dashboard, Activity, Kanban, Settings).
 * /sessions/:id is a deep-link only — no nav link for it.
 *
 * Uses React Router NavLink for aria-current="page" on the active route.
 * NavLink automatically sets aria-current="page" on the active link (v6+ behavior).
 * Uses Tailwind for styling.
 *
 * I-4: no @orch/core imports.
 * I-2: no "stockforge".
 *
 * Part B signature (verbatim):
 *   export function NavShell(props: { children: ReactNode }): JSX.Element;
 */

import { type ReactNode, type JSX } from 'react';
import { NavLink } from 'react-router-dom';

interface NavShellProps {
  children: ReactNode;
}

/** Navigation links rendered in the top bar (deep-link routes excluded). */
const NAV_LINKS: Array<{ to: string; label: string; slug: string }> = [
  { to: '/', label: 'Dashboard', slug: 'dashboard' },
  { to: '/activity', label: 'Activity', slug: 'activity' },
  { to: '/kanban', label: 'Kanban', slug: 'kanban' },
  { to: '/settings', label: 'Settings', slug: 'settings' },
];

/**
 * NavShell — wraps every page with a persistent top navigation bar.
 *
 * React Router NavLink automatically sets aria-current="page" on the active
 * link. The `end` prop on the "/" link prevents it from matching all routes.
 */
export function NavShell(props: NavShellProps): JSX.Element {
  return (
    <div className="min-h-screen flex flex-col">
      <nav className="bg-gray-900 text-white px-6 py-3 flex gap-6 items-center" role="navigation">
        <span className="font-bold text-lg mr-4">Orch</span>
        {NAV_LINKS.map(({ to, label, slug }) => (
          <NavLink
            key={slug}
            to={to}
            end={to === '/'}
            data-testid={`nav-link-${slug}`}
            className={({ isActive }) =>
              isActive
                ? 'underline text-white font-semibold'
                : 'text-gray-300 hover:text-white'
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>
      <main className="flex-1">{props.children}</main>
    </div>
  );
}
