/**
 * OrchContext — zero-dependency DI container for the four domain-level interfaces.
 *
 * Ported from Claude-to-IM's initBridgeContext / getBridgeContext pattern (MIT).
 * Using Symbol.for ensures the same key survives HMR and module-duplication across
 * packages without a shared singleton module.
 *
 * Feature modules (NestJS) inject concrete impls; domain code retrieves them via
 * getOrchContext() — no NestJS import ever enters packages/core/src/domain/ (I-14).
 */
import type { IOrchStore } from './types/store.js';
import type { IAgentRuntime } from './types/runtime.js';
import type { INotifier } from './types/notifier.js';
import type { ITracer } from './types/tracer.js';

/** The four service boundaries the domain layer depends on. */
export interface OrchContext {
  store: IOrchStore;
  runtime: IAgentRuntime;
  notifier: INotifier;
  tracer: ITracer;
}

/** Survives HMR and cross-package module duplication — always resolves the same slot. */
const ORCH_CONTEXT_KEY = Symbol.for('@orch/context');

/**
 * Populate the globalThis OrchContext slot from NestJS bootstrap (AppModule.onModuleInit).
 *
 * Throws on double-init in production to catch misconfigured bootstrap order.
 * In NODE_ENV=test, re-init is allowed so each test can supply fresh mocks.
 */
export function initOrchContext(ctx: OrchContext): void {
  const store = (globalThis as Record<symbol, unknown>)[ORCH_CONTEXT_KEY];
  if (store !== undefined && process.env['NODE_ENV'] !== 'test') {
    throw new Error(
      '[orch] OrchContext already initialized. initOrchContext() must be called exactly once.',
    );
  }
  (globalThis as Record<symbol, unknown>)[ORCH_CONTEXT_KEY] = ctx;
}

/**
 * Retrieve the OrchContext populated at bootstrap.
 *
 * Throws if called before initOrchContext() — callers should never catch this;
 * it signals a wiring bug (domain code ran before AppModule finished bootstrapping).
 */
export function getOrchContext(): OrchContext {
  const ctx = (globalThis as Record<symbol, unknown>)[ORCH_CONTEXT_KEY] as
    | OrchContext
    | undefined;
  if (!ctx) {
    throw new Error(
      '[orch] OrchContext not initialized. Call initOrchContext() before using domain services.',
    );
  }
  return ctx;
}

/** Guard for optional-access patterns — true only after a successful initOrchContext(). */
export function hasOrchContext(): boolean {
  return (
    (globalThis as Record<symbol, unknown>)[ORCH_CONTEXT_KEY] !== undefined
  );
}

/**
 * Clear the OrchContext slot for test isolation.
 *
 * Only callable when NODE_ENV=test — throws otherwise to prevent accidental
 * production teardown.
 */
export function resetOrchContextForTest(): void {
  if (process.env['NODE_ENV'] !== 'test') {
    throw new Error(
      '[orch] resetOrchContextForTest() must only be called in NODE_ENV=test.',
    );
  }
  (globalThis as Record<symbol, unknown>)[ORCH_CONTEXT_KEY] = undefined;
}
