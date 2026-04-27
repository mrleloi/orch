/**
 * scope-resolver.ts — Pure TypeScript domain layer for tenancy scope resolution.
 *
 * Domain-pure: zero NestJS imports, zero fs/process.env reads.
 * All configuration injected via constructor options.
 *
 * Path conventions (tenancy-model.md §3):
 *   Personal:  agent-workspace/<user>/projects/<project>/
 *   Shared:    agent-workspace/shared-projects/<project>/
 *   Legacy:    agent-workspace/  (flat root, backwards-compat)
 *
 * Ratified by: Decision 029
 */

import * as path from 'node:path';
import { DEFAULT_USER } from '../config/defaults.js';
export { DEFAULT_USER };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Sentinel dir name for shared project zone
const SHARED_ZONE_MARKER = 'shared-projects';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Resolved tenancy scope for a workspace path or operation. */
export interface TenancyScope {
  user: string;
  project: string;
  isShared: boolean;
}

/** Constructor options for ScopeResolver. */
export interface TenancyResolverOptions {
  /** Absolute filesystem root containing agent-workspace/. */
  rootDir: string;
  /** Fallback user for legacy paths. Defaults to 'default-user'. */
  defaultUser?: string;
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

/** Thrown when a path escapes the allowed scope root (traversal or cross-tenant). */
export class TenancyViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TenancyViolationError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ---------------------------------------------------------------------------
// ScopeResolver
// ---------------------------------------------------------------------------

/**
 * Domain-pure resolver for workspace tenancy scopes.
 * In the NestJS layer, TenancyService wraps this class.
 */
export class ScopeResolver {
  private readonly rootDir: string;
  private readonly defaultUser: string;

  constructor(options: TenancyResolverOptions) {
    this.rootDir = path.resolve(options.rootDir);
    this.defaultUser = options.defaultUser ?? DEFAULT_USER;
  }

  /**
   * Resolve a file path to a TenancyScope.
   *
   * Layout recognition:
   *   1. agent-workspace/shared-projects/<project>/... → {user:'shared', project, isShared:true}
   *   2. agent-workspace/<user>/projects/<project>/... → {user, project, isShared:false}
   *   3. Any other path (legacy flat layout) → defaultUser scope (backwards-compat, no error)
   */
  resolve(filePath: string): TenancyScope {
    const normalised = path.resolve(this.rootDir, filePath);
    const awRoot = path.join(this.rootDir, 'agent-workspace');
    const awTrailing = awRoot + path.sep;

    let rel: string | null = null;
    if (normalised === awRoot) rel = '';
    else if (normalised.startsWith(awTrailing))
      rel = normalised.slice(awTrailing.length);

    if (rel === null || rel === '') return this._legacy('unknown');

    const segs = rel.split(path.sep).filter(Boolean);
    if (segs.length === 0) return this._legacy('unknown');

    // Shared-projects zone
    if (segs[0] === SHARED_ZONE_MARKER) {
      return { user: 'shared', project: segs[1] ?? 'unknown', isShared: true };
    }

    // Multi-user personal zone: <user>/projects/<project>/
    if (segs.length >= 3 && segs[1] === 'projects') {
      return { user: segs[0]!, project: segs[2]!, isShared: false };
    }

    // Legacy flat layout
    return this._legacy(segs[0] ?? 'unknown');
  }

  /**
   * Check whether `requester` may access `scope`.
   *
   * Rules:
   *   - 'default-user' accesses ALL scopes (backwards-compat, single-tenant)
   *   - Owner (requester === scope.user) always has access
   *   - Shared project → any user may access
   *   - Personal project of a different user → denied
   */
  canAccess(scope: TenancyScope, requester: string): boolean {
    if (requester === DEFAULT_USER) return true;
    if (requester === scope.user) return true;
    if (scope.isShared) return true;
    return false;
  }

  /**
   * Assert that `filePath` stays within the scope root.
   * Throws TenancyViolationError on path-traversal or out-of-scope access.
   */
  enforcePath(scope: TenancyScope, filePath: string): void {
    const scopeRoot = this._scopeRoot(scope);
    const resolved = path.resolve(this.rootDir, filePath);
    const trailing = scopeRoot.endsWith(path.sep)
      ? scopeRoot
      : scopeRoot + path.sep;

    if (resolved !== scopeRoot && !resolved.startsWith(trailing)) {
      throw new TenancyViolationError(
        `Path "${resolved}" escapes scope root "${scopeRoot}". ` +
          `Access denied for user "${scope.user}", project "${scope.project}".`,
      );
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private _scopeRoot(scope: TenancyScope): string {
    if (scope.isShared) {
      return path.join(
        this.rootDir,
        'agent-workspace',
        SHARED_ZONE_MARKER,
        scope.project,
      );
    }
    // Legacy flat-layout: single-tenant scope root is all of agent-workspace/
    if (scope.user === this.defaultUser && this.defaultUser === DEFAULT_USER) {
      return path.join(this.rootDir, 'agent-workspace');
    }
    return path.join(
      this.rootDir,
      'agent-workspace',
      scope.user,
      'projects',
      scope.project,
    );
  }

  private _legacy(inferredProject: string): TenancyScope {
    return {
      user: this.defaultUser,
      project: inferredProject,
      isShared: false,
    };
  }
}
