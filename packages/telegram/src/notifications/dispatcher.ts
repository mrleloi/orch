/**
 * dispatcher.ts — Notification dispatcher for Orch SSE events → Telegram messages.
 *
 * Formats per-event notifications and sends them to the primary Telegram chat.
 *
 * Features:
 *  - Per-event formatter registry for supported event types
 *  - Sliding-window rate limit: max 10 notifications/min per chat
 *  - Suppressed event counter flushed as a prefix on next successful send
 *  - Redaction applied to all outbound text (never leaks secrets)
 *  - withFloodControl wraps every bot.api.sendMessage call
 *  - A3: queue.empty derived by polling /api/v1/queue after queue.state_changed
 *        (queue.dequeued is not a direct SSE type; we watch queue.state_changed)
 *
 * Supported SSE event types (from plan line 356):
 *  session.started, session.ended, session.rate_limited, session.context_full,
 *  queue.empty (derived), hook.received (UserPromptSubmit only)
 *
 * Invariants:
 *  I-3:  no @anthropic-ai/sdk
 *  I-4:  no @orch/core import
 *  I-14: no NestJS imports
 *  N6:   sliding-window map evicts entries older than 60s on each check
 */

import type { Bot } from 'grammy';
import type { Logger } from 'pino';
import type { SseEnvelope } from '@orch/shared';
import type { CoreApiClient } from '../api/core-client.js';
import type { RedactorFn } from '@orch/shared';
import { withFloodControl } from '../middleware/flood-control.js';
import { clipPlanPath } from '@orch/shared';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface NotificationDispatcher {
  handle(env: SseEnvelope): Promise<void>;
}

export interface NotificationDispatcherOptions {
  bot: Bot;
  primaryChatId: number;
  api: CoreApiClient;
  redactor: RedactorFn;
  logger: Logger;
  /** Injectable clock for deterministic rate-limit tests. Default: Date.now */
  clock?: () => number;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 10; // max notifications per window
/** Maximum number of timestamps to retain in the sliding window (N6: bounded). */
const RATE_LIMIT_MAX_ENTRIES = 100;

// ── Payload shapes (narrow from unknown) ──────────────────────────────────────

interface SessionStartedPayload {
  projectId?: string;
  sessionId?: string;
  id?: string;
  planPath?: string;
}

interface SessionEndedPayload {
  projectId?: string;
  sessionId?: string;
  id?: string;
  status?: string;
  state?: string;
}

interface SessionRateLimitedPayload {
  sessionId?: string;
  id?: string;
  backoffMs?: number;
}

interface SessionContextFullPayload {
  sessionId?: string;
  id?: string;
}

interface HookReceivedPayload {
  hookName?: string;
  [key: string]: unknown;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function shortId(id: string | undefined): string {
  if (!id) return 'unknown';
  return id.slice(0, 8);
}

function formatSessionStarted(payload: SessionStartedPayload): string {
  const project = payload.projectId ?? 'unknown';
  const id = shortId(payload.sessionId ?? payload.id);
  const planRef = payload.planPath ? ` plan=${clipPlanPath(payload.planPath)}` : '';
  return `\u{1F7E2} Session started: ${project} (${id})${planRef}`;
}

function formatSessionEnded(payload: SessionEndedPayload): string {
  const project = payload.projectId ?? 'unknown';
  const id = shortId(payload.sessionId ?? payload.id);
  const status = payload.status ?? payload.state ?? 'unknown';
  return `⚫ Session ended: ${project} (${id}) status=${status}`;
}

function formatSessionRateLimited(payload: SessionRateLimitedPayload): string {
  const session = shortId(payload.sessionId ?? payload.id);
  const backoff = payload.backoffMs !== undefined ? `${payload.backoffMs}ms` : 'unknown';
  return `⏳ Rate-limit hit: ${session} — backoff ${backoff}`;
}

function formatSessionContextFull(payload: SessionContextFullPayload): string {
  const session = shortId(payload.sessionId ?? payload.id);
  return `\u{1F9F1} Context full: ${session} — auto-handoff soon`;
}

function formatQueueEmpty(): string {
  return `\u{1F4ED} Queue drained`;
}

// ── Rate limiter ───────────────────────────────────────────────────────────────

/**
 * Sliding-window rate limiter per chat ID.
 * Entries older than RATE_LIMIT_WINDOW_MS are evicted on each check.
 * Map is bounded to RATE_LIMIT_MAX_ENTRIES entries to comply with N6.
 */
class SlidingWindowRateLimiter {
  // chatId → timestamps of sent notifications within the window
  private readonly windows = new Map<number, number[]>();
  private suppressedCount = 0;
  private readonly clock: () => number;

  constructor(clock: () => number = Date.now.bind(Date)) {
    this.clock = clock;
  }

  /**
   * Try to record a notification send for `chatId`.
   * Returns true if the send is allowed; false if rate-limited.
   */
  tryRecord(chatId: number): boolean {
    const now = this.clock();
    const windowStart = now - RATE_LIMIT_WINDOW_MS;

    // Get or create window for this chat
    let timestamps = this.windows.get(chatId);
    if (timestamps === undefined) {
      timestamps = [];
      this.windows.set(chatId, timestamps);
    }

    // Evict stale entries (N6: never retain unbounded history)
    const fresh = timestamps.filter((t) => t > windowStart);

    // Apply max-entries cap (N6 safety guard)
    const capped = fresh.slice(-RATE_LIMIT_MAX_ENTRIES);
    this.windows.set(chatId, capped);

    if (capped.length >= RATE_LIMIT_MAX) {
      this.suppressedCount++;
      return false;
    }

    capped.push(now);
    return true;
  }

  /** Consume suppressed count and reset to 0. Returns the count consumed. */
  drainSuppressed(): number {
    const count = this.suppressedCount;
    this.suppressedCount = 0;
    return count;
  }
}

// ── Factory ────────────────────────────────────────────────────────────────────

export function createNotificationDispatcher(
  opts: NotificationDispatcherOptions,
): NotificationDispatcher {
  const { bot, primaryChatId, api, redactor, logger } = opts;
  const clock = opts.clock ?? Date.now.bind(Date);
  const rateLimiter = new SlidingWindowRateLimiter(clock);

  /**
   * Send a text message to primaryChatId with rate-limit + flood-control.
   * Prepends suppression summary if previous events were suppressed.
   */
  async function sendNotification(text: string): Promise<void> {
    // Check rate limit
    const allowed = rateLimiter.tryRecord(primaryChatId);
    if (!allowed) {
      logger.debug({ primaryChatId }, 'dispatcher:rate-limited');
      return;
    }

    // Drain any suppressed event count and prepend summary
    const suppressed = rateLimiter.drainSuppressed();
    let finalText = text;
    if (suppressed > 0) {
      finalText = `(${suppressed} events suppressed in last 60s)\n${text}`;
    }

    // Redact secrets from outbound text (I-wiring)
    const safeText = redactor(finalText);

    // Send via bot.api with flood control (Task 2.4 wrapper)
    await withFloodControl(
      () => bot.api.sendMessage(primaryChatId, safeText),
      logger,
    );
  }

  /**
   * A3: After a queue.state_changed event, poll /api/v1/queue.
   * If the queue is empty (no pending or running items), emit a queue.empty notification.
   */
  async function checkQueueEmpty(): Promise<void> {
    try {
      const items = await api.getQueue();
      const activeItems = items.filter(
        (item) => item.state === 'pending' || item.state === 'running',
      );
      if (activeItems.length === 0) {
        await sendNotification(formatQueueEmpty());
      }
    } catch (err: unknown) {
      logger.warn({ err }, 'dispatcher:queue-check-failed');
    }
  }

  // ── Dispatcher implementation ────────────────────────────────────────────────

  return {
    async handle(env: SseEnvelope): Promise<void> {
      try {
        switch (env.type) {
          case 'session.started': {
            const payload = env.payload as SessionStartedPayload;
            await sendNotification(formatSessionStarted(payload));
            break;
          }

          case 'session.ended': {
            const payload = env.payload as SessionEndedPayload;
            await sendNotification(formatSessionEnded(payload));
            break;
          }

          case 'session.rate_limited': {
            const payload = env.payload as SessionRateLimitedPayload;
            await sendNotification(formatSessionRateLimited(payload));
            break;
          }

          case 'session.context_full': {
            const payload = env.payload as SessionContextFullPayload;
            await sendNotification(formatSessionContextFull(payload));
            break;
          }

          case 'queue.state_changed': {
            // A3: derive queue.empty by polling
            await checkQueueEmpty();
            break;
          }

          case 'hook.received': {
            const payload = env.payload as HookReceivedPayload;
            // Only notify for UserPromptSubmit hooks — others are too noisy
            if (payload.hookName !== 'UserPromptSubmit') {
              logger.debug(
                { hookName: payload.hookName },
                'dispatcher:hook-skipped',
              );
              break;
            }
            const sessionRef = typeof payload['sessionId'] === 'string'
              ? shortId(payload['sessionId'])
              : 'unknown';
            const text = `\u{1F4AC} Hook: UserPromptSubmit (session: ${sessionRef})`;
            await sendNotification(text);
            break;
          }

          default: {
            // Unknown/unsupported event types: silently drop
            logger.debug({ type: env.type }, 'dispatcher:event-dropped');
            break;
          }
        }
      } catch (err: unknown) {
        // Never throw — dispatcher errors must not crash the SSE client loop
        logger.error({ err, type: env.type }, 'dispatcher:handle-error');
      }
    },
  };
}
