/**
 * HookSecretMiddleware — validates the X-Orch-Hook-Secret header on every
 * POST /hooks/* request.
 *
 * Security rules:
 *  - Comparison uses `crypto.timingSafeEqual` to prevent timing attacks (D12).
 *  - Returns 401 on missing OR wrong secret — intentionally does NOT indicate
 *    which condition triggered (prevents information leakage).
 *  - If ORCH_HOOK_SECRET env var is empty/unset, hooks are rejected unless
 *    explicitly configured (secure by default).
 *
 * Uses Node.js http.IncomingMessage / http.ServerResponse directly — avoids
 * importing the fastify package (NestMiddleware receives the raw Node.js objects).
 *
 * I-7: Bind to localhost by default (enforced in main.ts, not here).
 * I-12: All errors are logged but not re-thrown as 5xx — 401 is always returned.
 */

import type * as http from 'node:http';
import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { timingSafeCompare } from '../security/timing-safe-compare.js';

/** Header name for hook authentication. */
export const HOOK_SECRET_HEADER = 'x-orch-hook-secret';

@Injectable()
export class HookSecretMiddleware implements NestMiddleware {
  private readonly logger = new Logger(HookSecretMiddleware.name);

  use(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    next: () => void,
  ): void {
    const expectedRaw = process.env['ORCH_HOOK_SECRET'];

    if (!expectedRaw || expectedRaw.length === 0) {
      // Secret not configured — reject all requests to avoid running unsecured.
      this.logger.warn({
        msg: 'hook-secret:not-configured',
        note: 'ORCH_HOOK_SECRET env var is unset; rejecting hook request',
      });
      this.sendUnauthorized(res);
      return;
    }

    // Read the header — IncomingMessage headers are lowercase
    const rawHeader = req.headers[HOOK_SECRET_HEADER];
    const provided = typeof rawHeader === 'string' ? rawHeader : rawHeader?.[0];

    if (!provided) {
      // Missing header
      this.sendUnauthorized(res);
      return;
    }

    // Delegate to shared timing-safe helper (D12 — single source of truth).
    // timingSafeCompare handles length-mismatch dummy-compare internally.
    if (!timingSafeCompare(expectedRaw, provided)) {
      this.sendUnauthorized(res);
      return;
    }

    next();
  }

  private sendUnauthorized(res: http.ServerResponse): void {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ statusCode: 401, message: 'Unauthorized' }));
  }
}
