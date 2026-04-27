/**
 * HookSecretMiddleware spec
 *
 * Covers:
 *  - 401 when ORCH_HOOK_SECRET not set
 *  - 401 when header is missing
 *  - 401 when header has wrong value (same length)
 *  - 401 when header has wrong value (different length)
 *  - next() called when header matches
 *  - both missing and wrong return same 401 (no information leakage)
 */

import type * as http from 'node:http';
import { Logger } from '@nestjs/common';
import { HookSecretMiddleware, HOOK_SECRET_HEADER } from './hook-secret.middleware.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildReq(headers: Record<string, string> = {}): http.IncomingMessage {
  return {
    headers: headers as Record<string, string | string[]>,
  } as http.IncomingMessage;
}

interface FakeRes {
  res: http.ServerResponse;
  statusCode: () => number | null;
  body: () => string;
}

function buildRes(): FakeRes {
  const state = { statusCode: null as number | null, body: '' };
  const res = {
    writeHead: jest.fn((code: number) => {
      state.statusCode = code;
    }),
    end: jest.fn((data?: string) => {
      if (data) state.body = data;
    }),
  } as unknown as http.ServerResponse;

  return {
    res,
    statusCode: () => state.statusCode,
    body: () => state.body,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('HookSecretMiddleware', () => {
  let middleware: HookSecretMiddleware;
  const ORIGINAL_SECRET = process.env['ORCH_HOOK_SECRET'];

  beforeEach(() => {
    middleware = new HookSecretMiddleware();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (ORIGINAL_SECRET !== undefined) {
      process.env['ORCH_HOOK_SECRET'] = ORIGINAL_SECRET;
    } else {
      delete process.env['ORCH_HOOK_SECRET'];
    }
  });

  it('returns 401 when ORCH_HOOK_SECRET is not set', () => {
    delete process.env['ORCH_HOOK_SECRET'];
    const req = buildReq();
    const { res, statusCode } = buildRes();
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(statusCode()).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when header is missing', () => {
    process.env['ORCH_HOOK_SECRET'] = 'my-secret';
    const req = buildReq({}); // no header
    const { res, statusCode } = buildRes();
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(statusCode()).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when header is wrong (same length)', () => {
    process.env['ORCH_HOOK_SECRET'] = 'my-secret-123';
    const req = buildReq({ [HOOK_SECRET_HEADER]: 'my-secret-XYZ' }); // same length, wrong value
    const { res, statusCode } = buildRes();
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(statusCode()).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when header is wrong (different length)', () => {
    process.env['ORCH_HOOK_SECRET'] = 'my-secret';
    const req = buildReq({ [HOOK_SECRET_HEADER]: 'wrong' }); // different length
    const { res, statusCode } = buildRes();
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(statusCode()).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() when header matches', () => {
    process.env['ORCH_HOOK_SECRET'] = 'correct-secret';
    const req = buildReq({ [HOOK_SECRET_HEADER]: 'correct-secret' });
    const { res } = buildRes();
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('does NOT reveal which check failed (401 in both missing and wrong cases)', () => {
    process.env['ORCH_HOOK_SECRET'] = 'my-secret';

    // Missing header
    const req1 = buildReq({});
    const { res: res1, statusCode: sc1 } = buildRes();
    middleware.use(req1, res1, jest.fn());

    // Wrong header
    const req2 = buildReq({ [HOOK_SECRET_HEADER]: 'wrong-secret' });
    const { res: res2, statusCode: sc2 } = buildRes();
    middleware.use(req2, res2, jest.fn());

    // Both return 401 (not 400 for missing, 403 for wrong — same status for both)
    expect(sc1()).toBe(401);
    expect(sc2()).toBe(401);
  });
});
