/**
 * HooksController — thin HTTP layer for POST /hooks/:event.
 *
 * Responsibilities:
 *  1. Extract :event path param
 *  2. Validate body via HOOK_SCHEMAS[event] (zod) → 400 if invalid (I-10)
 *  3. Hand off to HooksService.processEvent()
 *  4. Return 200 immediately — no blocking on state side effects
 *
 * Auth is handled upstream by HookSecretMiddleware (applied in HooksModule).
 *
 * Error handling:
 *  - ZodError / HookValidationError → 400
 *  - UnknownHookEventError → 400
 *  - DomainError → 500 (unexpected; the controller logs it)
 *
 * I-10: Every external body goes through zod before touching domain logic.
 * I-12: DomainError subclasses propagate; raw errors do not.
 */

import {
  BadRequestException,
  Body,
  Controller,
  InternalServerErrorException,
  Logger,
  Param,
  Post,
  HttpCode,
} from '@nestjs/common';
import type { ZodError } from 'zod';
import {
  HOOK_SCHEMAS,
  isValidHookEventType,
} from './schemas/hook-event.schema.js';
import { HooksService } from './hooks.service.js';
import { DomainError } from '../../domain/errors.js';

/** Response shape for a successful hook acknowledgment. */
interface HookAckResponse {
  ok: boolean;
  deduped?: boolean;
}

@Controller('hooks')
export class HooksController {
  private readonly logger = new Logger(HooksController.name);

  constructor(private readonly hooksService: HooksService) {}

  /**
   * Receive a Claude Code hook event.
   *
   * Returns 200 with `{ ok: true }` on success.
   * Returns 200 with `{ ok: true, deduped: true }` on duplicate (not 409 — hooks retry on failure).
   * Returns 400 with zod error details on validation failure.
   * Returns 401 via middleware on missing/wrong secret (before this handler runs).
   */
  @Post(':event')
  @HttpCode(200)
  async receiveHook(
    @Param('event') eventParam: string,
    @Body() body: unknown,
  ): Promise<HookAckResponse> {
    // ── Validate event type ─────────────────────────────────────────────────
    if (!isValidHookEventType(eventParam)) {
      throw new BadRequestException(
        `Unknown hook event type: "${eventParam}". Valid types: ${Object.keys(HOOK_SCHEMAS).join(', ')}`,
      );
    }

    const eventType = eventParam;

    // ── Validate body (I-10) ────────────────────────────────────────────────
    const schema = HOOK_SCHEMAS[eventType];
    const parseResult = schema.safeParse(body);

    if (!parseResult.success) {
      const zodError = parseResult.error as ZodError;
      throw new BadRequestException({
        message: `Hook payload validation failed for event "${eventType}"`,
        issues: zodError.issues.map((i) => ({
          path: i.path,
          message: i.message,
        })),
      });
    }

    const validatedPayload = parseResult.data as Record<string, unknown>;

    // ── Delegate to service ─────────────────────────────────────────────────
    try {
      const result = await this.hooksService.processEvent(
        eventType,
        validatedPayload,
      );

      const response: HookAckResponse = { ok: true };
      if (result.deduped) {
        response.deduped = true;
      }
      return response;
    } catch (err) {
      if (err instanceof DomainError) {
        this.logger.error({
          msg: 'hooks:domain-error',
          event: eventType,
          code: err.code,
          error: err.message,
        });
        throw new InternalServerErrorException(
          `Hook processing failed: ${err.code}`,
        );
      }

      this.logger.error({
        msg: 'hooks:unexpected-error',
        event: eventType,
        error: String(err),
      });
      throw new InternalServerErrorException('Hook processing failed');
    }
  }
}
