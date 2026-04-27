/**
 * ConsoleNotifierService — Phase 1 no-op notifier that writes to the process logger.
 *
 * Satisfies INotifier for OrchContext bootstrap without requiring Telegram or Web UI
 * (both are Phase 2 deliverables). Logs structured JSON via pino-compatible output.
 *
 * Replace with TelegramNotifierService / WebUiNotifierService in Phase 2 by swapping
 * the provider binding in NotifierModule — AppModule and domain code are unaffected.
 *
 * I-14: implements INotifier from domain/types — no NestJS in domain/.
 */

import { Injectable, Logger } from '@nestjs/common';
import type { INotifier } from '../../domain/types/notifier.js';

@Injectable()
export class ConsoleNotifierService implements INotifier {
  private readonly logger = new Logger(ConsoleNotifierService.name);

  notify(
    level: 'info' | 'warn' | 'error',
    message: string,
    context?: Record<string, unknown>,
  ): Promise<void> {
    const payload = { msg: message, ...context };
    switch (level) {
      case 'info':
        this.logger.log(payload);
        break;
      case 'warn':
        this.logger.warn(payload);
        break;
      case 'error':
        this.logger.error(payload);
        break;
    }
    return Promise.resolve();
  }
}
