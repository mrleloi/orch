/**
 * main.ts — Standalone entry point for the @orch/telegram bot process.
 *
 * Boot sequence:
 *  1. Load .env if present (dotenv)
 *  2. Validate env via telegramEnvSchema (zod — I-10)
 *  3. Create pino logger
 *  4. Create CoreApiClient
 *  5. Create Grammy bot
 *  6. Register whitelist middleware
 *  7. Register confirmation callback handler (must come before command handlers)
 *  8. Register /status, /queue, /projects, /tail, /logs handlers (Phase 2.2 + 2.3)
 *  9. Register /pause, /resume, /cancel, /stop, /start handlers (Phase 2.4)
 * 10. Create SSE client + notification dispatcher (Phase 2.5)
 * 11. Start bot (long-polling) and SSE subscription in parallel
 * 12. Register SIGTERM/SIGINT handlers for graceful shutdown
 *
 * I-4: never imports @orch/core — all daemon communication is via HTTP.
 * I-7: bot binds to no port (it's a polling client, not an HTTP server).
 * I-14: no module-level mutable state.
 */

import 'dotenv/config';
import pino from 'pino';
import { redactSecrets } from '@orch/shared';
import { validateTelegramEnv } from './env.js';
import { createBot } from './bot.js';
import { CoreApiClient } from './api/core-client.js';
import { whitelistMiddleware } from './auth/whitelist.middleware.js';
import { registerConfirmationCallbackHandler } from './handlers/confirm-flow.js';
import { registerStatusHandler } from './handlers/status.js';
import { registerQueueHandler } from './handlers/queue.js';
import { registerProjectsHandler } from './handlers/projects.js';
import { registerTailHandler } from './handlers/tail.js';
import { registerLogsHandler } from './handlers/logs.js';
import { registerPauseHandler } from './handlers/pause.js';
import { registerResumeHandler } from './handlers/resume.js';
import { registerCancelHandler } from './handlers/cancel.js';
import { registerStopHandler } from './handlers/stop.js';
import { registerStartHandler } from './handlers/start.js';
import { createSseClient } from './events/sse-client.js';
import { createNotificationDispatcher } from './notifications/dispatcher.js';

async function main(): Promise<void> {
  // Step 1: validate env — fast fail with clear error
  const env = validateTelegramEnv(process.env as Record<string, unknown>);

  // Step 2: create pino logger
  const logger = pino({ level: 'info', name: 'orch-telegram' });

  logger.info({ msg: 'telegram:starting', apiBase: env.ORCH_API_BASE_URL });

  // Step 3: create CoreApiClient
  const api = new CoreApiClient({
    baseUrl: env.ORCH_API_BASE_URL,
    bearerToken: env.ORCH_API_BEARER_TOKEN,
    logger,
  });

  // Step 4: create Grammy bot
  const bot = createBot(env.TELEGRAM_BOT_TOKEN, logger);

  // Step 5: register whitelist middleware (runs for every update)
  bot.use(whitelistMiddleware(new Set(env.ORCH_TG_ALLOWED_CHAT_IDS), logger));

  // Step 6: register confirmation callback handler FIRST (before commands)
  // This global callback_query handler dispatches confirmation Yes/No presses
  registerConfirmationCallbackHandler(bot);

  // Step 7: register command handlers (Phase 2.2 + Phase 2.3)
  registerStatusHandler(bot, api, redactSecrets, logger);
  registerQueueHandler(bot, api, redactSecrets, logger);
  registerProjectsHandler(bot, api, redactSecrets, logger);
  registerTailHandler(bot, api, redactSecrets, logger);
  registerLogsHandler(bot, api, redactSecrets, logger);

  // Step 8: register control handlers (Phase 2.4)
  registerPauseHandler(bot, api, redactSecrets, logger);
  registerResumeHandler(bot, api, redactSecrets, logger);
  registerCancelHandler(bot, api, redactSecrets, logger);
  registerStopHandler(bot, api, redactSecrets, logger);
  registerStartHandler(bot, api, redactSecrets, logger);

  // Step 10: create SSE client + notification dispatcher (Phase 2.5)
  const sseClient = createSseClient({
    url: `${env.ORCH_API_BASE_URL}/api/v1/events/stream`,
    bearerToken: env.ORCH_API_BEARER_TOKEN,
    logger,
  });

  const dispatcher = createNotificationDispatcher({
    bot,
    primaryChatId: env.ORCH_TG_ALLOWED_CHAT_IDS[0] ?? 0,
    api,
    redactor: redactSecrets,
    logger,
  });

  sseClient.onEvent((env) => {
    dispatcher.handle(env).catch((err: unknown) => {
      logger.error({ err }, 'telegram:dispatcher-error');
    });
  });

  // Step 11: SIGTERM → graceful shutdown (Grammy stop cleans up long-poll)
  process.once('SIGTERM', () => {
    logger.info({ msg: 'telegram:sigterm-received' });
    sseClient
      .stop()
      .then(() => bot.stop())
      .then(() => {
        logger.info({ msg: 'telegram:stopped' });
        process.exit(0);
      })
      .catch((err: unknown) => {
        logger.error({ err }, 'telegram:stop-error');
        process.exit(1);
      });
  });

  process.once('SIGINT', () => {
    logger.info({ msg: 'telegram:sigint-received' });
    sseClient
      .stop()
      .then(() => bot.stop())
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  });

  // Step 12: start SSE client in background (non-blocking) and start bot (long-polling)
  sseClient.start().catch((err: unknown) => {
    logger.error({ err }, 'telegram:sse-client-error');
  });

  logger.info({ msg: 'telegram:bot-starting' });
  await bot.start({
    onStart: (info) => {
      logger.info({
        msg: 'telegram:bot-ready',
        username: info.username,
        allowedChatIds: env.ORCH_TG_ALLOWED_CHAT_IDS,
      });
    },
  });
}

main().catch((err: unknown) => {
  console.error('Failed to start Telegram bot:', err);
  process.exit(1);
});
