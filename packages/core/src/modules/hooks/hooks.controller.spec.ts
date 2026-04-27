/**
 * HooksController spec
 *
 * Unit tests for the controller layer.
 *
 * Covers:
 *  - 200 on valid POST + valid event type
 *  - 400 on unknown event type
 *  - 400 on malformed body (zod error details surfaced)
 *  - 200 with deduped=true when service returns deduped
 *  - 500 on DomainError from service
 *
 * Note: Auth (401) is tested separately in hook-secret.middleware.spec.ts
 * because it's applied via middleware, not in the controller itself.
 */

import { BadRequestException, InternalServerErrorException, Logger } from '@nestjs/common';
import { HooksController } from './hooks.controller.js';
import { DomainError } from '../../domain/errors.js';
import type { HooksService, ProcessEventResult } from './hooks.service.js';
import type { DomainEvent } from '../../domain/events.js';
import { SessionState } from '../../domain/session.js';

// ── Fake service ──────────────────────────────────────────────────────────────

function buildFakeService(opts: {
  processResult?: Partial<ProcessEventResult>;
  throwError?: Error;
}): HooksService {
  const defaultResult: ProcessEventResult = {
    deduped: false,
    domainEvent: { kind: 'Stop', sessionId: 'sess-1', recordedAt: '', isError: false } as DomainEvent,
    newState: SessionState.Stopping,
    ...opts.processResult,
  };

  return {
    processEvent: jest.fn(async () => {
      if (opts.throwError) throw opts.throwError;
      return defaultResult;
    }),
  } as unknown as HooksService;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('HooksController', () => {
  let controller: HooksController;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('receiveHook', () => {
    it('returns 200 ok:true for valid event + body', async () => {
      controller = new HooksController(buildFakeService({}));
      const result = await controller.receiveHook('Stop', {
        session_id: 'sess-abc',
        is_error: false,
      });
      expect(result).toEqual({ ok: true });
    });

    it('returns 200 ok:true deduped:true when service returns deduped', async () => {
      controller = new HooksController(
        buildFakeService({ processResult: { deduped: true } }),
      );
      const result = await controller.receiveHook('Stop', {
        session_id: 'sess-abc',
      });
      expect(result).toEqual({ ok: true, deduped: true });
    });

    it('throws BadRequestException for unknown event type', async () => {
      controller = new HooksController(buildFakeService({}));
      await expect(
        controller.receiveHook('UnknownEvent', { session_id: 'sess-abc' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws BadRequestException for malformed body (missing required field)', async () => {
      controller = new HooksController(buildFakeService({}));
      await expect(
        controller.receiveHook('Stop', { /* missing session_id */ }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('includes zod issues in BadRequestException for malformed body', async () => {
      controller = new HooksController(buildFakeService({}));
      try {
        await controller.receiveHook('PreCompact', {
          session_id: 'sess-abc',
          // missing compact_uuid
        });
        fail('Expected BadRequestException');
      } catch (err) {
        expect(err).toBeInstanceOf(BadRequestException);
        const exc = err as BadRequestException;
        const response = exc.getResponse() as { issues?: unknown[] };
        expect(response.issues).toBeDefined();
        expect(Array.isArray(response.issues)).toBe(true);
        expect((response.issues as unknown[]).length).toBeGreaterThan(0);
      }
    });

    it('throws InternalServerErrorException when service throws DomainError', async () => {
      controller = new HooksController(
        buildFakeService({
          throwError: new DomainError('TEST_ERROR', 'something went wrong'),
        }),
      );
      await expect(
        controller.receiveHook('Stop', { session_id: 'sess-abc' }),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
    });

    it('throws InternalServerErrorException when service throws unexpected error', async () => {
      controller = new HooksController(
        buildFakeService({
          throwError: new Error('unexpected'),
        }),
      );
      await expect(
        controller.receiveHook('Stop', { session_id: 'sess-abc' }),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
    });

    it('does not include deduped key when deduped=false', async () => {
      controller = new HooksController(buildFakeService({}));
      const result = await controller.receiveHook('Stop', { session_id: 'sess-abc' });
      expect('deduped' in result).toBe(false);
    });

    it('handles all 11 valid event types including SessionStart', async () => {
      const validPayloads: Record<string, Record<string, unknown>> = {
        SessionStart: { session_id: 'sess' },
        PreToolUse: { session_id: 'sess', tool_name: 'Bash' },
        PostToolUse: { session_id: 'sess', tool_name: 'Bash' },
        UserPromptSubmit: { session_id: 'sess', prompt: 'do something' },
        Notification: { session_id: 'sess', message: 'hello' },
        Stop: { session_id: 'sess' },
        SessionEnd: { session_id: 'sess' },
        SubagentStop: { session_id: 'sess', subagent_id: 'sub-1' },
        PreCompact: { session_id: 'sess', compact_uuid: 'uuid-1' },
        PostCompact: { session_id: 'sess', compact_uuid: 'uuid-1' },
        ApiError: { session_id: 'sess', error_type: 'overloaded_error', error_message: 'err' },
      };

      for (const [eventType, payload] of Object.entries(validPayloads)) {
        controller = new HooksController(buildFakeService({}));
        const result = await controller.receiveHook(eventType, payload);
        expect(result.ok).toBe(true);
      }
    });

    it('POST /hooks/SessionStart with valid body returns 200 and session transition triggered', async () => {
      // Exercises Fix 2 (SessionStart schema) + Fix 1 (claudeSessionId lookup path).
      // The fake service returns Running state (simulating Idle/Starting → Running).
      const fakeService = buildFakeService({
        processResult: {
          deduped: false,
          domainEvent: {
            kind: 'SessionStart',
            sessionId: 'orch-internal-id',
            recordedAt: new Date().toISOString(),
            claudeSessionId: 'claude-uuid-distinct',
          } as DomainEvent,
          newState: SessionState.Running,
        },
      });
      controller = new HooksController(fakeService);

      // session_id = Claude Code UUID (not the Orch internal cuid)
      const result = await controller.receiveHook('SessionStart', {
        session_id: 'claude-uuid-distinct',
        claude_session_id: 'claude-uuid-distinct',
        model: 'claude-opus-4-5',
        source: 'startup',
      });

      expect(result).toEqual({ ok: true });
      expect(fakeService.processEvent).toHaveBeenCalledWith(
        'SessionStart',
        expect.objectContaining({ session_id: 'claude-uuid-distinct' }),
      );
    });

    it('POST /hooks/SessionStart with invalid source value returns 400', async () => {
      controller = new HooksController(buildFakeService({}));
      await expect(
        controller.receiveHook('SessionStart', {
          session_id: 'sess-abc',
          source: 'invalid-source', // not in enum
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
