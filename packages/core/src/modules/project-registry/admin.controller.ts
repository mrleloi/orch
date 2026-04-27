/**
 * AdminController — HTTP endpoints for project registry management.
 *
 * Scope: Phase 1 admin operations only.
 * Auth: BearerAuthMiddleware applied via ProjectRegistryModule.configure().
 * Localhost-only binding is a global bootstrap concern — handled in main.ts.
 *
 * Per SYNTHESIS §6.6: explicit POST endpoint chosen over fsevents-only trigger.
 */

import { Controller, HttpCode, Post } from '@nestjs/common';
import {
  ProjectRegistryService,
  type ReloadResult,
} from './project-registry.service.js';

@Controller('admin')
export class AdminController {
  constructor(private readonly registry: ProjectRegistryService) {}

  /**
   * POST /admin/reload
   *
   * Re-scans ~/.orch/projects/*.yaml, diffs against cache, and returns a summary.
   * Safe to call multiple times — idempotent for unchanged files.
   * Protected by BearerAuthMiddleware (wired in ProjectRegistryModule.configure).
   */
  @Post('reload')
  @HttpCode(200)
  async reload(): Promise<ReloadResult> {
    return this.registry.reload();
  }
}
