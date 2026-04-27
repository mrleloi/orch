/**
 * BearerAuthMiddleware — validates Authorization: Bearer <token> header on all
 * /api/v1/* requests.
 *
 * Security rules:
 *  - Comparison uses timingSafeCompare (D12) to prevent timing attacks.
 *  - Returns 401 on missing OR wrong token — intentionally does NOT indicate
 *    which condition triggered (prevents information leakage).
 *  - If ORCH_API_BEARER_TOKEN env var is empty/unset, all requests are rejected
 *    (secure by default).
 *
 * Uses Node.js http.IncomingMessage / http.ServerResponse directly — avoids
 * importing the fastify package (NestMiddleware receives the raw Node.js objects).
 *
 * Pattern mirrors HookSecretMiddleware in hooks/hook-secret.middleware.ts.
 * Shared timing-safe logic extracted to security/timing-safe-compare.ts.
 *
 * I-7: Bind to localhost by default (enforced in main.ts, not here).
 * I-12: All errors are logged but not re-thrown as 5xx — 401 is always returned.
 */

import type * as http from 'node:http';
import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { timingSafeCompare } from '../security/timing-safe-compare.js';

/** Authorization header name. */
const AUTHORIZATION_HEADER = 'authorization';

/** Bearer scheme prefix — lowercase for case-insensitive match. */
const BEARER_PREFIX = 'bearer ';

@Injectable()
export class BearerAuthMiddleware implements NestMiddleware {
  private readonly logger = new Logger(BearerAuthMiddleware.name);

  use(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    next: () => void,
  ): void {
    const expectedToken = process.env['ORCH_API_BEARER_TOKEN'];

    if (!expectedToken || expectedToken.length === 0) {
      // Token not configured — reject all requests to avoid running unsecured.
      this.logger.warn({
        msg: 'bearer-auth:not-configured',
        note: 'ORCH_API_BEARER_TOKEN env var is unset; rejecting API request',
      });
      this.sendUnauthorized(res);
      return;
    }

    // Read the Authorization header — IncomingMessage headers are lowercase
    const rawHeader = req.headers[AUTHORIZATION_HEADER];
    const headerValue =
      typeof rawHeader === 'string' ? rawHeader : rawHeader?.[0];

    if (!headerValue) {
      this.sendUnauthorized(res);
      return;
    }

    // Extract Bearer token (scheme is case-insensitive per RFC 7235)
    const lower = headerValue.toLowerCase();
    if (!lower.startsWith(BEARER_PREFIX)) {
      this.sendUnauthorized(res);
      return;
    }

    const providedToken = headerValue.slice(BEARER_PREFIX.length);

    if (!timingSafeCompare(expectedToken, providedToken)) {
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
