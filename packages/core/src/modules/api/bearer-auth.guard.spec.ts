/**
 * BearerAuthGuard spec
 *
 * Tests the guard's two auth paths:
 *  1. Authorization: Bearer <token> header (primary path)
 *  2. ?token=<urlencoded> query param (SSE fallback for native EventSource)
 *
 * Cases:
 *  1. ?token=<valid>                           → canActivate returns true (200)
 *  2. ?token=<wrong>                           → throws UnauthorizedException (401)
 *  3. Header Bearer <valid> AND ?token=<wrong> → header wins, returns true (200)
 *  4. No header, no query param                → throws UnauthorizedException (401)
 *  5. ORCH_API_BEARER_TOKEN not set            → throws UnauthorizedException (401)
 *  6. Header Bearer <valid>                    → returns true (original path unbroken)
 *  7. Header Bearer <wrong>                    → throws UnauthorizedException (401)
 */

import { ExecutionContext, Logger, UnauthorizedException } from '@nestjs/common';
import { BearerAuthGuard } from './bearer-auth.guard.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

interface FakeRequest {
  headers: Record<string, string | undefined>;
  query: Record<string, unknown>;
}

function buildContext(req: FakeRequest): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => req,
    }),
  } as unknown as ExecutionContext;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('BearerAuthGuard', () => {
  let guard: BearerAuthGuard;
  const TOKEN = 'test-bearer-token-secret';
  const originalEnv = process.env['ORCH_API_BEARER_TOKEN'];

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    guard = new BearerAuthGuard();
    process.env['ORCH_API_BEARER_TOKEN'] = TOKEN;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalEnv === undefined) {
      delete process.env['ORCH_API_BEARER_TOKEN'];
    } else {
      process.env['ORCH_API_BEARER_TOKEN'] = originalEnv;
    }
  });

  // ── Query-param fallback ──────────────────────────────────────────────────

  describe('?token= query-param fallback (EventSource path)', () => {
    it('returns true when ?token=<valid> and no Authorization header', () => {
      const ctx = buildContext({
        headers: {},
        query: { token: TOKEN },
      });
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('throws UnauthorizedException when ?token=<wrong>', () => {
      const ctx = buildContext({
        headers: {},
        query: { token: 'wrong-token' },
      });
      expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when no header and no query param', () => {
      const ctx = buildContext({
        headers: {},
        query: {},
      });
      expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
    });
  });

  // ── Header wins when both present ─────────────────────────────────────────

  describe('header priority', () => {
    it('returns true when header=<valid> and ?token=<wrong> (header wins)', () => {
      const ctx = buildContext({
        headers: { authorization: `Bearer ${TOKEN}` },
        query: { token: 'wrong-token' },
      });
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('throws UnauthorizedException when header=<wrong> even if ?token=<valid>', () => {
      const ctx = buildContext({
        headers: { authorization: 'Bearer wrong-token' },
        query: { token: TOKEN },
      });
      expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
    });
  });

  // ── Primary header path (regression) ─────────────────────────────────────

  describe('Authorization header (primary path)', () => {
    it('returns true when Authorization: Bearer <valid>', () => {
      const ctx = buildContext({
        headers: { authorization: `Bearer ${TOKEN}` },
        query: {},
      });
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('throws UnauthorizedException when Authorization: Bearer <wrong>', () => {
      const ctx = buildContext({
        headers: { authorization: 'Bearer wrong-token' },
        query: {},
      });
      expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when Authorization scheme is not Bearer', () => {
      const ctx = buildContext({
        headers: { authorization: `Basic ${TOKEN}` },
        query: {},
      });
      expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
    });
  });

  // ── Env-var not configured ────────────────────────────────────────────────

  describe('when ORCH_API_BEARER_TOKEN is not configured', () => {
    it('throws UnauthorizedException regardless of provided token', () => {
      delete process.env['ORCH_API_BEARER_TOKEN'];
      const ctx = buildContext({
        headers: { authorization: `Bearer ${TOKEN}` },
        query: { token: TOKEN },
      });
      expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
    });
  });
});
