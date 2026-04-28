/** layer-builder.ts — Path-resolution helpers and default layer factory.
 * Extracted from layered-resolver.ts (CF-29 split; Phase 9 v2.4).
 * Domain-layer ZERO framework dependency. Spec §3. */

import { join } from 'node:path';

import {
  SystemDefaultsSchema,
  UserConfigSchema,
  ProjectProfileSchema,
  RepoOverrideSchema,
  type LayerSource,
} from './layered-resolver.js';

// ── Path resolution helpers ──────────────────────────────────────────────────

/**
 * Resolve the user home directory for Layer 2 path construction.
 * Priority: XDG_CONFIG_HOME → HOME → USERPROFILE. Spec §1.2.
 */
export function resolveUserHome(): {
  /** If XDG_CONFIG_HOME is set, the orch config path is $XDG_CONFIG_HOME/orch/config.yaml */
  xdgConfigHome: string | undefined;
  /** The resolved home directory (~-equivalent). */
  home: string | undefined;
} {
  const xdg = process.env['XDG_CONFIG_HOME'];
  const home = process.env['HOME'] ?? process.env['USERPROFILE'];
  return { xdgConfigHome: xdg || undefined, home: home || undefined };
}

/**
 * Resolve the Layer 2 user config file path.
 * Resolution order per spec §1.2:
 *  1. $XDG_CONFIG_HOME/orch/config.yaml
 *  2. $HOME/.config/orch/config.yaml  (POSIX fallback)
 *  3. $HOME/.orch/config.yaml         (Windows + macOS-Unix simple)
 *  4. %USERPROFILE%\.orch\config.yaml (Windows fallback)
 *
 * Returns the first matching path candidate (caller may pass to fileLoader).
 * If neither XDG nor HOME nor USERPROFILE is resolvable, returns undefined.
 */
export function resolveUserConfigPath(): string | undefined {
  const { xdgConfigHome, home } = resolveUserHome();

  if (xdgConfigHome) {
    return join(xdgConfigHome, 'orch', 'config.yaml');
  }
  if (home) {
    // Prefer ~/.config/orch/config.yaml on POSIX; fall back to ~/.orch/config.yaml
    // For simplicity, we return the ~/.orch path which is the Windows-compatible form.
    // A caller on pure POSIX can override via XDG_CONFIG_HOME.
    return join(home, '.orch', 'config.yaml');
  }
  return undefined;
}

/**
 * Build the canonical 4-layer source descriptor for a given project.
 *
 * Helper used by daemon entry-points to construct the standard layering.
 * Each layer's schema is bound here; downstream LayeredResolver consumes the array.
 * Spec §3 buildDefaultLayers.
 *
 * @param projectRoot absolute path to the managed project root
 * @param userHome absolute path to the user home dir (resolved by caller from env vars)
 * @param systemDefaultsPath absolute path to the dist-bundled defaults.json
 */
export function buildDefaultLayers(
  projectRoot: string,
  userHome: string,
  systemDefaultsPath: string,
): LayerSource[] {
  const { xdgConfigHome } = resolveUserHome();

  const userConfigPath = xdgConfigHome
    ? join(xdgConfigHome, 'orch', 'config.yaml')
    : join(userHome, '.orch', 'config.yaml');

  return [
    {
      name: 'system',
      path: systemDefaultsPath,
      schema: SystemDefaultsSchema,
    },
    {
      name: 'user',
      path: userConfigPath,
      schema: UserConfigSchema,
    },
    {
      name: 'project',
      path: join(projectRoot, '.orch', 'profile.yaml'),
      schema: ProjectProfileSchema,
    },
    {
      name: 'repo',
      path: join(projectRoot, '.orch', 'profile.local.yaml'),
      schema: RepoOverrideSchema,
    },
  ];
}
