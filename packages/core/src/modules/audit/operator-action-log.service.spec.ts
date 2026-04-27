/**
 * OperatorActionLogService spec
 *
 * Tests:
 *  - Happy path: log() writes correct row to Prisma
 *  - Actor derivation
 *  - audit-20: traceId extracted from active OTEL span traceparent
 *  - Failure: Prisma error is caught + logged; does NOT rethrow
 */

import { Logger } from '@nestjs/common';
import { OperatorActionLogService } from './operator-action-log.service.js';
import type { PrismaService } from '../db/prisma.service.js';
import type { TracingService } from '../tracing/tracing.service.js';

// ── Mock factories ─────────────────────────────────────────────────────────────

function buildMockPrisma(): jest.Mocked<PrismaService> {
  return {
    operatorActionLog: {
      create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
    },
  } as unknown as jest.Mocked<PrismaService>;
}

function buildMockTracing(traceparent?: string): jest.Mocked<TracingService> {
  return {
    getActiveTraceparent: jest.fn().mockReturnValue(traceparent),
  } as unknown as jest.Mocked<TracingService>;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('OperatorActionLogService', () => {
  let service: OperatorActionLogService;
  let prisma: jest.Mocked<PrismaService>;
  let tracing: jest.Mocked<TracingService>;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    prisma = buildMockPrisma();
    tracing = buildMockTracing();
    service = new OperatorActionLogService(prisma, tracing);
  });

  afterEach(() => jest.restoreAllMocks());

  it('happy path: writes correct row to Prisma', async () => {
    await service.log({
      actor: 'telegram:123456',
      action: 'session.stop',
      target: 'sess-abc',
      confirmed: true,
    });

    expect(prisma.operatorActionLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actor: 'telegram:123456',
        action: 'session.stop',
        target: 'sess-abc',
        confirmed: true,
        traceId: null,
      }),
    });
  });

  it('writes null target when target not provided', async () => {
    await service.log({
      actor: 'cli',
      action: 'queue.pause',
      confirmed: true,
    });

    expect(prisma.operatorActionLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        target: null,
      }),
    });
  });

  // Audit log test 20: traceId populated from active OTEL span
  it('audit-20: extracts traceId from active span traceparent', async () => {
    // W3C traceparent: 00-<32hexTraceId>-<16hexSpanId>-<2hexFlags>
    const traceId = 'a1b2c3d4e5f6789012345678901234ab';
    const traceparent = `00-${traceId}-abcdef1234567890-01`;
    const tracingWithSpan = buildMockTracing(traceparent);
    const serviceWithSpan = new OperatorActionLogService(prisma, tracingWithSpan);

    await serviceWithSpan.log({
      actor: 'telegram:99',
      action: 'queue.resume',
      confirmed: true,
    });

    expect(prisma.operatorActionLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        traceId,
      }),
    });
  });

  it('traceId is null when no active span', async () => {
    await service.log({
      actor: 'cli',
      action: 'queue.enqueue',
      target: 'item-1',
      confirmed: true,
    });

    expect(prisma.operatorActionLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        traceId: null,
      }),
    });
  });

  it('Prisma error is caught and logged; does NOT rethrow', async () => {
    prisma.operatorActionLog.create.mockRejectedValue(new Error('db error'));
    const errorSpy = jest.spyOn(Logger.prototype, 'error');

    // Should not throw
    await expect(
      service.log({ actor: 'cli', action: 'session.stop', confirmed: true }),
    ).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('traceId is null when traceparent has unexpected format', async () => {
    const tracingBadFormat = buildMockTracing('invalid-format');
    const serviceWithBad = new OperatorActionLogService(prisma, tracingBadFormat);

    await serviceWithBad.log({
      actor: 'cli',
      action: 'queue.pause',
      confirmed: true,
    });

    expect(prisma.operatorActionLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ traceId: null }),
    });
  });

  it('P2002 race during OperatorActionLog insert is suppressed', async () => {
    const p2002Err = { code: 'P2002', meta: { modelName: 'OperatorActionLog', target: ['actor'] } };
    prisma.operatorActionLog.create.mockRejectedValue(p2002Err);

    const debugSpy = jest.spyOn(Logger.prototype, 'debug');
    const errorSpy = jest.spyOn(Logger.prototype, 'error');

    // Should resolve without throwing
    await expect(
      service.log({ actor: 'cli', action: 'session.stop', confirmed: true }),
    ).resolves.toBeUndefined();

    // Debug log capturing 'audit:p2002-suppressed'
    const debugMsgs = debugSpy.mock.calls.map((args) =>
      typeof args[0] === 'object' && args[0] !== null ? (args[0] as { msg?: string }).msg : args[0],
    );
    expect(debugMsgs).toContain('audit:p2002-suppressed');

    // No error log
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
