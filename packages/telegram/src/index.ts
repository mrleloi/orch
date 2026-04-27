/**
 * @orch/telegram — public API.
 *
 * Phase 2.0: createBot factory.
 * Phase 2.2: auth middleware, CoreApiClient, /status handler exported.
 *
 * I-4: this package NEVER imports @orch/core.
 *      It communicates with the daemon via HTTP API only.
 */

export { createBot } from './bot.js';
export type { TelegramEnv } from './env.js';
export { whitelistMiddleware } from './auth/whitelist.middleware.js';
export { CoreApiClient } from './api/core-client.js';
export type { CoreApiClientOptions, CoreApiError } from './api/core-client.js';
export { registerStatusHandler } from './handlers/status.js';
