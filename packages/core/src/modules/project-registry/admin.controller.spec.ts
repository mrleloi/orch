/**
 * AdminController spec
 *
 * Tests the POST /admin/reload endpoint:
 *  - Returns 200 with the correct summary shape
 *  - Calls service.reload() exactly once per request
 *
 * Auth middleware tests (Fix A):
 *  - BearerAuthMiddleware is applied to admin/* routes via ProjectRegistryModule
 *  - Direct middleware unit tests: no bearer → 401, wrong bearer → 401, correct bearer → next()
 */

import * as http from 'node:http';
import { Test, type TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { AdminController } from './admin.controller.js';
import { ProjectRegistryService } from './project-registry.service.js';
import type { ReloadResult } from './project-registry.service.js';
import { BearerAuthMiddleware } from '../api/bearer-auth.middleware.js';

// ── Mock service ──────────────────────────────────────────────────────────────

function createMockRegistry(): jest.Mocked<ProjectRegistryService> {
  return {
    reload: jest.fn(),
    listProjects: jest.fn(),
    getProject: jest.fn(),
    onModuleInit: jest.fn(),
    onModuleDestroy: jest.fn(),
  } as unknown as jest.Mocked<ProjectRegistryService>;
}

// ── Bearer auth middleware helpers ────────────────────────────────────────────

function buildReq(headers: Record<string, string> = {}): http.IncomingMessage {
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

describe('AdminController', () => {
  let controller: AdminController;
  let mockRegistry: jest.Mocked<ProjectRegistryService>;

  beforeEach(async () => {
    mockRegistry = createMockRegistry();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        { provide: ProjectRegistryService, useValue: mockRegistry },
      ],
    }).compile();

    controller = module.get<AdminController>(AdminController);
  });

  describe('POST /admin/reload', () => {
    it('returns 200 with the summary shape from service.reload()', async () => {
      const expected: ReloadResult = {
        added: 2,
        updated: 1,
        removed: 0,
        errors: [],
      };
      mockRegistry.reload.mockResolvedValue(expected);

      const result = await controller.reload();

      expect(result).toEqual(expected);
      expect(result).toHaveProperty('added');
      expect(result).toHaveProperty('updated');
      expect(result).toHaveProperty('removed');
      expect(result).toHaveProperty('errors');
    });

    it('calls service.reload() exactly once per request', async () => {
      mockRegistry.reload.mockResolvedValue({ added: 0, updated: 0, removed: 0, errors: [] });

      await controller.reload();

      expect(mockRegistry.reload).toHaveBeenCalledTimes(1);
    });

    it('returns zero counts when nothing changed', async () => {
      const empty: ReloadResult = { added: 0, updated: 0, removed: 0, errors: [] };
      mockRegistry.reload.mockResolvedValue(empty);

      const result = await controller.reload();

      expect(result.added).toBe(0);
      expect(result.updated).toBe(0);
      expect(result.removed).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('propagates errors from service.reload()', async () => {
      mockRegistry.reload.mockRejectedValue(new Error('disk failure'));

      await expect(controller.reload()).rejects.toThrow('disk failure');
    });
  });
});

// ── BearerAuthMiddleware on admin/* routes (Fix A) ────────────────────────────
//
// Tests that the same BearerAuthMiddleware that guards /api/v1/* also guards
// /admin/reload — verifying the middleware contract directly (module-level
// middleware wiring is exercised in integration; unit tests cover middleware logic).

describe('BearerAuthMiddleware applied to admin routes', () => {
  const TOKEN = 'test-admin-bearer-token';
  const originalEnv = process.env['ORCH_API_BEARER_TOKEN'];

  let middleware: BearerAuthMiddleware;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    middleware = new BearerAuthMiddleware();
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

  it('returns 401 when no Authorization header is provided', () => {
    const req = buildReq({});
    const res = buildRes();
    const next = jest.fn();

    middleware.use(req as http.IncomingMessage, res as unknown as http.ServerResponse, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when wrong bearer token is provided', () => {
    const req = buildReq({ authorization: 'Bearer wrong-token-value' });
    const res = buildRes();
    const next = jest.fn();

    middleware.use(req as http.IncomingMessage, res as unknown as http.ServerResponse, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() when correct bearer token is provided', () => {
    const req = buildReq({ authorization: `Bearer ${TOKEN}` });
    const res = buildRes();
    const next = jest.fn();

    middleware.use(req as http.IncomingMessage, res as unknown as http.ServerResponse, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(0); // writeHead not called
  });
});
