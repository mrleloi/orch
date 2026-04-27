/**
 * tenancy.service.ts — NestJS injectable wrapper over ScopeResolver.
 *
 * Reads ORCH_TENANCY_DEFAULT_USER env var (falls back to 'default-user').
 * Defers ALL logic to the domain-pure ScopeResolver.
 *
 * Domain rule: ScopeResolver is framework-agnostic. This service is the
 * NestJS integration seam only.
 *
 * See: packages/core/src/tenancy/scope-resolver.ts
 * Ratified by: Decision 029
 */

import { Injectable } from '@nestjs/common';
import { ScopeResolver, TenancyScope, DEFAULT_USER } from './scope-resolver.js';

@Injectable()
export class TenancyService {
  private readonly resolver: ScopeResolver;

  constructor() {
    const defaultUser =
      process.env['ORCH_TENANCY_DEFAULT_USER'] ?? DEFAULT_USER;
    // rootDir defaults to process.cwd() — the project root where agent-workspace/ lives.
    // Can be overridden by setting the ORCH_ROOT_DIR env var.
    const rootDir = process.env['ORCH_ROOT_DIR'] ?? process.cwd();
    this.resolver = new ScopeResolver({ rootDir, defaultUser });
  }

  /**
   * Resolve a file path to its tenancy scope.
   *
   * @param filePath  Absolute or cwd-relative path to resolve.
   */
  resolve(filePath: string): TenancyScope {
    return this.resolver.resolve(filePath);
  }

  /**
   * Check whether `requester` may access the resource at `scope`.
   *
   * @param scope      Resolved scope of the resource.
   * @param requester  User identifier of the requesting party.
   */
  canAccess(scope: TenancyScope, requester: string): boolean {
    return this.resolver.canAccess(scope, requester);
  }

  /**
   * Assert that `filePath` does not escape the scope root.
   * Throws TenancyViolationError if the path is outside the allowed root.
   *
   * @param scope     Resolved scope to enforce.
   * @param filePath  Path to validate.
   */
  enforcePath(scope: TenancyScope, filePath: string): void {
    this.resolver.enforcePath(scope, filePath);
  }
}
