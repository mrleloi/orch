/**
 * NotifierModule — provides ConsoleNotifierService as the INotifier implementation.
 *
 * Phase 1: console/log-only notifier (no Telegram or Web UI).
 * Phase 2: swap ConsoleNotifierService for TelegramNotifierService here.
 *
 * AppModule imports this module and injects ConsoleNotifierService into onModuleInit
 * to populate OrchContext.notifier.
 */

import { Module } from '@nestjs/common';
import { ConsoleNotifierService } from './console-notifier.service.js';

@Module({
  providers: [ConsoleNotifierService],
  exports: [ConsoleNotifierService],
})
export class NotifierModule {}
