/**
 * HealthModule — exposes GET /healthz liveness probe.
 *
 * No auth middleware — /healthz is public on localhost-only binding (I-7).
 */

import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';

@Module({
  controllers: [HealthController],
})
export class HealthModule {}
