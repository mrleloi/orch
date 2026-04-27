/**
 * scope-resolver.spec.ts
 *
 * Unit tests for ScopeResolver and TenancyViolationError.
 *
 * Coverage (≥8 cases):
 *  1. Path under agent-workspace/alice/projects/proj-a/ → {user:'alice', project:'proj-a', isShared:false}
 *  2. Path under agent-workspace/shared-projects/proj-x/ → {user:'shared', project:'proj-x', isShared:true}
 *  3. Non-conforming legacy path → defaultUser scope (backwards-compat)
 *  4. canAccess same user → true
 *  5. canAccess shared project across users → true
 *  6. canAccess personal project across users → false
 *  7. enforcePath throws on .. traversal escape
 *  8. enforcePath accepts canonical path under scope root
 *  9. canAccess default-user → true for ALL scopes (backwards-compat)
 * 10. resolve path at shared-projects root level (no project segment)
 * 11. enforcePath on shared scope root itself → passes
 * 12. resolve with Windows-style separator-heavy path (nested under project)
 */

import * as path from 'node:path';
import {
  ScopeResolver,
  TenancyViolationError,
  DEFAULT_USER,
} from './scope-resolver.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

const ROOT = '/srv/orch'; // synthetic rootDir for all tests

function makeResolver(defaultUser?: string): ScopeResolver {
  return new ScopeResolver({ rootDir: ROOT, defaultUser });
}

function join(...parts: string[]): string {
  return path.join(ROOT, ...parts);
}

// ── Suite ────────────────────────────────────────────────────────────────────

describe('ScopeResolver.resolve()', () => {
  let resolver: ScopeResolver;

  beforeEach(() => {
    resolver = makeResolver();
  });

  // 1. Personal project path for alice
  it('resolves agent-workspace/alice/projects/proj-a/foo to alice/proj-a personal scope', () => {
    const filePath = join('agent-workspace', 'alice', 'projects', 'proj-a', 'foo.md');
    const scope = resolver.resolve(filePath);
    expect(scope).toEqual({ user: 'alice', project: 'proj-a', isShared: false });
  });

  // 2. Shared project path
  it('resolves agent-workspace/shared-projects/proj-x/foo to shared/proj-x scope', () => {
    const filePath = join('agent-workspace', 'shared-projects', 'proj-x', 'session-plans', 'foo.md');
    const scope = resolver.resolve(filePath);
    expect(scope).toEqual({ user: 'shared', project: 'proj-x', isShared: true });
  });

  // 3. Legacy flat path — non-conforming → defaultUser scope
  it('resolves legacy agent-workspace/memory/foo to defaultUser scope (backwards-compat)', () => {
    const filePath = join('agent-workspace', 'memory', 'foo.md');
    const scope = resolver.resolve(filePath);
    expect(scope.user).toBe(DEFAULT_USER);
    expect(scope.isShared).toBe(false);
    // project is inferred as the first non-workspace segment
    expect(scope.project).toBe('memory');
  });

  // Extra: path at agent-workspace root itself
  it('resolves agent-workspace root to defaultUser unknown scope', () => {
    const filePath = join('agent-workspace');
    const scope = resolver.resolve(filePath);
    expect(scope.user).toBe(DEFAULT_USER);
    expect(scope.isShared).toBe(false);
  });

  // 10. Shared-projects with no project segment
  it('resolves agent-workspace/shared-projects alone to shared/unknown scope', () => {
    const filePath = join('agent-workspace', 'shared-projects');
    const scope = resolver.resolve(filePath);
    expect(scope.user).toBe('shared');
    expect(scope.isShared).toBe(true);
    expect(scope.project).toBe('unknown');
  });

  // 12. Deep nested path under personal project
  it('resolves deeply nested personal project path correctly', () => {
    const filePath = join('agent-workspace', 'bob', 'projects', 'personal', 'memory', 'sessions', 'today.md');
    const scope = resolver.resolve(filePath);
    expect(scope).toEqual({ user: 'bob', project: 'personal', isShared: false });
  });
});

describe('ScopeResolver.canAccess()', () => {
  let resolver: ScopeResolver;

  beforeEach(() => {
    resolver = makeResolver();
  });

  // 4. Same user accessing their own scope → true
  it('grants access when requester === scope.user', () => {
    const scope = { user: 'alice', project: 'proj-a', isShared: false };
    expect(resolver.canAccess(scope, 'alice')).toBe(true);
  });

  // 5. Shared project — different user → true
  it('grants access to shared project for any user', () => {
    const scope = { user: 'shared', project: 'proj-x', isShared: true };
    expect(resolver.canAccess(scope, 'alice')).toBe(true);
    expect(resolver.canAccess(scope, 'bob')).toBe(true);
  });

  // 6. Personal project — different user → false
  it('denies access to personal project for a different user', () => {
    const scope = { user: 'alice', project: 'personal', isShared: false };
    expect(resolver.canAccess(scope, 'bob')).toBe(false);
  });

  // 9. default-user → true for ALL scopes (backwards-compat)
  it('grants default-user access to any scope (backwards-compat)', () => {
    const personalScope = { user: 'alice', project: 'proj-a', isShared: false };
    const sharedScope = { user: 'shared', project: 'proj-x', isShared: true };
    const ownScope = { user: DEFAULT_USER, project: 'workspace', isShared: false };

    expect(resolver.canAccess(personalScope, DEFAULT_USER)).toBe(true);
    expect(resolver.canAccess(sharedScope, DEFAULT_USER)).toBe(true);
    expect(resolver.canAccess(ownScope, DEFAULT_USER)).toBe(true);
  });
});

describe('ScopeResolver.enforcePath()', () => {
  let resolver: ScopeResolver;

  beforeEach(() => {
    resolver = makeResolver();
  });

  // 7. Path traversal escape → TenancyViolationError
  it('throws TenancyViolationError when path escapes scope root via ..', () => {
    const scope = { user: 'alice', project: 'proj-a', isShared: false };
    // Attempt to traverse out of alice/projects/proj-a
    const escapedPath = join(
      'agent-workspace', 'alice', 'projects', 'proj-a',
      '..', '..', '..', 'bob', 'projects', 'personal', 'secret.md',
    );
    expect(() => resolver.enforcePath(scope, escapedPath)).toThrow(TenancyViolationError);
  });

  // 8. Canonical path under scope root → no error
  it('accepts a canonical path directly under scope root', () => {
    const scope = { user: 'alice', project: 'proj-a', isShared: false };
    const validPath = join('agent-workspace', 'alice', 'projects', 'proj-a', 'memory', 'notes.md');
    expect(() => resolver.enforcePath(scope, validPath)).not.toThrow();
  });

  // 11. Scope root itself → no error
  it('accepts the scope root path itself', () => {
    const scope = { user: 'alice', project: 'proj-a', isShared: false };
    const scopeRoot = join('agent-workspace', 'alice', 'projects', 'proj-a');
    expect(() => resolver.enforcePath(scope, scopeRoot)).not.toThrow();
  });

  // shared scope enforcePath
  it('throws when path escapes shared project scope', () => {
    const scope = { user: 'shared', project: 'proj-x', isShared: true };
    const escapedPath = join(
      'agent-workspace', 'shared-projects', 'proj-x',
      '..', 'other-project', 'secret.md',
    );
    expect(() => resolver.enforcePath(scope, escapedPath)).toThrow(TenancyViolationError);
  });

  it('accepts canonical path under shared scope root', () => {
    const scope = { user: 'shared', project: 'proj-x', isShared: true };
    const validPath = join('agent-workspace', 'shared-projects', 'proj-x', 'traces', 'run.jsonl');
    expect(() => resolver.enforcePath(scope, validPath)).not.toThrow();
  });
});

describe('DEFAULT_USER constant', () => {
  it('is "default-user"', () => {
    expect(DEFAULT_USER).toBe('default-user');
  });
});

describe('TenancyViolationError', () => {
  it('is an instance of Error with name TenancyViolationError', () => {
    const err = new TenancyViolationError('test');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('TenancyViolationError');
    expect(err.message).toBe('test');
  });
});
