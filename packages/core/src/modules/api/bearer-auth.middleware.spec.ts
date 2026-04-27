/**
 * BearerAuthMiddleware spec
 *
 * Tests timing-safe Bearer token validation:
 *  - 401 when ORCH_API_BEARER_TOKEN is not configured
 *  - 401 when Authorization header is missing
 *  - 401 when Authorization header has wrong scheme
 *  - 401 when token is wrong
 *  - Calls next() when token matches
 *
 * Mirrors hook-secret.middleware.spec.ts pattern.
 */

import * as http from 'node:http';
import { Logger } from '@nestjs/common';
import { BearerAuthMiddleware } from './bearer-auth.middleware.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildReq(
  headers: Record<string, string> = {},
): http.IncomingMessage {
  return {
    headers: Object.fromEntries(
      Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]),
    ),
  } as unknown as http.IncomingMessage;
}

interface FakeResponse {
  statusCode: number;
  body: string;
  writeHead: jest.Mock;
  end: jest.Mock;
}

function buildRes(): FakeResponse {
  const res: FakeResponse = {
    statusCode: 0,
    body: '',
    writeHead: jest.fn((code: number) => {
      res.statusCode = code;
    }),
    end: jest.fn((data: string) => {
      res.body = data;
    }),
  };
  return res;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('BearerAuthMiddleware', () => {
  let middleware: BearerAuthMiddleware;
  const TOKEN = 'test-bearer-token-secret';
  const originalEnv = process.env['ORCH_API_BEARER_TOKEN'];

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    middleware = new BearerAuthMiddleware();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalEnv === undefined) {
      delete process.env['ORCH_API_BEARER_TOKEN'];
    } else {
      process.env['ORCH_API_BEARER_TOKEN'] = originalEnv;
    }
  });

  describe('when ORCH_API_BEARER_TOKEN is not configured', () => {
    it('returns 401 and does not call next()', () => {
      delete process.env['ORCH_API_BEARER_TOKEN'];
      const req = buildReq({ authorization: `Bearer ${TOKEN}` });
      const res = buildRes();
      const next = jest.fn();

      middleware.use(req as http.IncomingMessage, res as unknown as http.ServerResponse, next);

      expect(res.statusCode).toBe(401);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('when ORCH_API_BEARER_TOKEN is configured', () => {
    beforeEach(() => {
      process.env['ORCH_API_BEARER_TOKEN'] = TOKEN;
    });

    it('calls next() when Authorization: Bearer <token> matches', () => {
      const req = buildReq({ authorization: `Bearer ${TOKEN}` });
      const res = buildRes();
      const next = jest.fn();

      middleware.use(req as http.IncomingMessage, res as unknown as http.ServerResponse, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.statusCode).toBe(0); // writeHead not called
    });

    it('returns 401 when Authorization header is missing', () => {
      const req = buildReq({});
      const res = buildRes();
      const next = jest.fn();

      middleware.use(req as http.IncomingMessage, res as unknown as http.ServerResponse, next);

      expect(res.statusCode).toBe(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 401 when Authorization scheme is not Bearer', () => {
      const req = buildReq({ authorization: `Basic ${TOKEN}` });
      const res = buildRes();
      const next = jest.fn();

      middleware.use(req as http.IncomingMessage, res as unknown as http.ServerResponse, next);

      expect(res.statusCode).toBe(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 401 when Bearer token is wrong', () => {
      const req = buildReq({ authorization: 'Bearer wrong-token' });
      const res = buildRes();
      const next = jest.fn();

      middleware.use(req as http.IncomingMessage, res as unknown as http.ServerResponse, next);

      expect(res.statusCode).toBe(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 401 when Bearer token has different length (length-oracle protection)', () => {
      const req = buildReq({ authorization: 'Bearer short' });
      const res = buildRes();
      const next = jest.fn();

      middleware.use(req as http.IncomingMessage, res as unknown as http.ServerResponse, next);

      expect(res.statusCode).toBe(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 401 when Authorization header is empty string', () => {
      const req = buildReq({ authorization: '' });
      const res = buildRes();
      const next = jest.fn();

      middleware.use(req as http.IncomingMessage, res as unknown as http.ServerResponse, next);

      expect(res.statusCode).toBe(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('response body is valid JSON with statusCode 401', () => {
      const req = buildReq({});
      const res = buildRes();
      const next = jest.fn();

      middleware.use(req as http.IncomingMessage, res as unknown as http.ServerResponse, next);

      const body = JSON.parse(res.body) as { statusCode: number; message: string };
      expect(body.statusCode).toBe(401);
      expect(body.message).toBe('Unauthorized');
    });
  });
});
