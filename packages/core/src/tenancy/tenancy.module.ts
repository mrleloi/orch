/**
 * TenancyModule — NestJS module providing workspace tenancy scope resolution.
 *
 * Exports TenancyService for use by other feature modules.
 * Cross-module communication via DI; do not import TenancyService directly
 * across feature module boundaries without importing TenancyModule.
 *
 * Default behaviour (personal-first, backwards-compatible):
 *   ORCH_TENANCY_DEFAULT_USER unset → 'default-user'
 *   Existing flat agent-workspace/ layout → preserved, zero migration required.
 *
 * See: agent-workspace/constitution/tenancy-model.md
 * Ratified by: Decision 029
 */

import { Module } from '@nestjs/common';
import { TenancyService } from './tenancy.service.js';

@Module({
  providers: [TenancyService],
  exports: [TenancyService],
})
export class TenancyModule {}
