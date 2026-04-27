/**
 * DbModule — provides PrismaService and OrchStoreService to the NestJS DI container.
 *
 * Import this module from AppModule (or any feature module) to get database access.
 * Cross-module communication via DI — no direct imports between feature modules (I-14).
 */

import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';
import { OrchStoreService } from './orch-store.service.js';

@Module({
  providers: [PrismaService, OrchStoreService],
  exports: [PrismaService, OrchStoreService],
})
export class DbModule {}
