/**
 * SecurityModule — NestJS module providing SecretRedactorService.
 *
 * Import this module in any feature module that needs secret redaction.
 * Cross-module communication via DI; do not import SecretRedactorService directly
 * across feature module boundaries.
 */

import { Module } from '@nestjs/common';
import { SecretRedactorService } from './secret-redactor.service.js';

@Module({
  providers: [SecretRedactorService],
  exports: [SecretRedactorService],
})
export class SecurityModule {}
