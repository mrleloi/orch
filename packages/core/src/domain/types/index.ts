/**
 * Barrel re-export for all domain-level interface types.
 *
 * Domain modules and feature modules import from this single entry point
 * rather than from individual type files, so internal file moves don't
 * break consumers.
 */
export type {
  IOrchStore,
  Session,
  SessionDraft,
  QueueItem,
  QueueItemDraft,
  HookEvent,
  QueueFilter,
} from './store.js';

export type {
  IAgentRuntime,
  SpawnConfig,
  RuntimeHandle,
  TerminationReason,
} from './runtime.js';

export type {
  IChannelAdapter,
  ChannelAddress,
  SendOptions,
} from './channel-adapter.js';

export type { INotifier } from './notifier.js';

export type { ITracer, ISpan } from './tracer.js';
