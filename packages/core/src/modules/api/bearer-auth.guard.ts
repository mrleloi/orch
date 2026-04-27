/**
 * BearerAuthGuard — NestJS CanActivate guard wrapping the same Bearer token
 * validation logic as BearerAuthMiddleware.
 *
 * Used by SseController (@UseGuards(BearerAuthGuard)) because SSE endpoints
 * need per-route auth rather than middleware-level auth. Middleware applies
 * to configured route patterns; guards apply per-controller/per-handler,
 * which is more precise for SSE where we also control headers.
 *
 * Security rules (identical to BearerAuthMiddleware):
 *  - timingSafeCompare for token comparison (D12 / I-9).
 *  - Rejects ALL requests if ORCH_API_BEARER_TOKEN is unset.
 *  - Returns 401 — never 403 — to avoid leaking auth state.
 *
 * SSE query-param fallback:
 *  - Native browser EventSource cannot send Authorization headers.
 *  - When the Authorization header is absent, the guard falls back to the
 *    `?token=` query parameter (URL-decoded by Fastify before we read it).
 *  - If BOTH are present, the header wins; the query param is ignored.
 *  - The same timingSafeCompare helper is used for both paths (I-9).
 *  - This guard is ONLY applied to SseController, so the `?token=` surface
 *    is limited to GET /api/v1/events/stream and does not apply to any REST
 *    endpoints (attack surface confined to SSE route).
 *
 * I-7:  Localhost binding enforced in main.ts, not here.
 * I-12: No re-throw as 5xx; UnauthorizedException (401) always returned.
 */

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { timingSafeCompare } from '../security/timing-safe-compare.js';

const BEARER_PREFIX = 'bearer ';

@Injectable()
export class BearerAuthGuard implements CanActivate {
  private readonly logger = new Logger(BearerAuthGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const expectedToken = process.env['ORCH_API_BEARER_TOKEN'];

    if (!expectedToken || expectedToken.length === 0) {
      this.logger.warn({
        msg: 'bearer-auth-guard:not-configured',
        note: 'ORCH_API_BEARER_TOKEN env var is unset; rejecting SSE request',
      });
      throw new UnauthorizedException('Unauthorized');
    }

    const req = context.switchToHttp().getRequest<FastifyRequest>();

    // ── Primary path: Authorization: Bearer <token> header ──────────────────
    const rawHeader = req.headers['authorization'];
    const headerValue = typeof rawHeader === 'string' ? rawHeader : undefined;

    if (headerValue !== undefined) {
      const lower = headerValue.toLowerCase();
      if (!lower.startsWith(BEARER_PREFIX)) {
        throw new UnauthorizedException('Unauthorized');
      }
      const providedToken = headerValue.slice(BEARER_PREFIX.length);
      if (!timingSafeCompare(expectedToken, providedToken)) {
        throw new UnauthorizedException('Unauthorized');
      }
      return true;
    }

    // ── Fallback path: ?token=<urlencoded> query param ───────────────────────
    // Used by native browser EventSource which cannot send Authorization headers.
    // Fastify URL-decodes query params before we read them.
    // This fallback is safe because BearerAuthGuard is ONLY mounted on
    // SseController (GET /api/v1/events/stream) — not on any REST routes.
    const queryToken = (req.query as Record<string, unknown>)['token'];
    const providedQueryToken =
      typeof queryToken === 'string' ? queryToken : undefined;

    if (!providedQueryToken) {
      throw new UnauthorizedException('Unauthorized');
    }

    if (!timingSafeCompare(expectedToken, providedQueryToken)) {
      throw new UnauthorizedException('Unauthorized');
    }

    return true;
  }
}
