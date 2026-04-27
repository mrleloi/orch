/**
 * AuditModule — provides OperatorActionLogService for audit trail writing.
 *
 * Imports:
 *  - PrismaModule (for PrismaService)
 *  - TracingModule (@Global — auto-available)
 *
 * Exports:
 *  - OperatorActionLogService (consumed by ApiModule)
 */

import { Module } from '@nestjs/common';
import { OperatorActionLogService } from './operator-action-log.service.js';
import { DbModule } from '../db/prisma.module.js';

@Module({
  imports: [DbModule],
  providers: [OperatorActionLogService],
  exports: [OperatorActionLogService],
})
export class AuditModule {}
