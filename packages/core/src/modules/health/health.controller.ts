/**
 * HealthController — lightweight liveness probe for the Orch daemon.
 *
 * GET /healthz → 200 { status: 'ok', uptime: <seconds> }
 *
 * No auth required — this endpoint is safe because the daemon is bound to
 * 127.0.0.1 by default (I-7), so only local processes can reach it.
 *
 * Used by:
 *  - `pnpm run dev` process health check
 *  - Infrastructure readiness probes
 *  - Manual verification: curl http://127.0.0.1:4141/healthz
 */

import { Controller, Get } from '@nestjs/common';

export interface HealthResponse {
  status: 'ok';
  uptime: number;
}

@Controller('healthz')
export class HealthController {
  @Get()
  check(): HealthResponse {
    return {
      status: 'ok',
      uptime: process.uptime(),
    };
  }
}
