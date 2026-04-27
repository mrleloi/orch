# Outbound Notifications, Throttling, and Test Patterns

## NotificationService

```typescript
@Injectable()
export class NotificationService {
  constructor(private bot: Bot<OrchContext>) {}

  async notify(chatId: string, event: OrchEvent): Promise<void> {
    try {
      const text = formatEvent(event);
      await this.bot.api.sendMessage(chatId, text, {
        parse_mode: 'Markdown',
        disable_notification: event.severity === 'info',
      });
    } catch (err) {
      // Log, do not throw -- bot must survive notification failures
      this.logger.error({ err, event }, 'Failed to send notification');
    }
  }
}
```

Rate limit outbound to avoid Telegram throttling (30 msg/sec global, 1 msg/sec per chat).

## Throttling Pattern

```typescript
// packages/telegram/src/services/throttled-sender.ts
export class ThrottledSender {
  private queue: Array<() => Promise<void>> = [];
  private running = false;

  enqueue(fn: () => Promise<void>): void {
    this.queue.push(fn);
    if (!this.running) void this.drain();
  }

  private async drain(): Promise<void> {
    this.running = true;
    while (this.queue.length > 0) {
      const fn = this.queue.shift()!;
      await fn();
      await new Promise(r => setTimeout(r, 35)); // ~28 msg/sec
    }
    this.running = false;
  }
}
```

## Mock-Context Test Patterns

```typescript
import { Bot } from 'grammy';
import { vi, describe, it, expect } from 'vitest';

// Grammy Context mock
const mockCtx = {
  from: { id: 12345 },
  reply: vi.fn(),
  userId: '12345',
  session: {},
} as unknown as OrchContext;

describe('statusHandler', () => {
  it('replies with formatted status', async () => {
    await statusHandler(mockCtx, () => Promise.resolve());
    expect(mockCtx.reply).toHaveBeenCalled();
  });
});

describe('authMiddleware', () => {
  it('blocks unauthenticated users', async () => {
    const next = vi.fn();
    const unauthCtx = {
      from: { id: 99999 }, // not in ALLOWED
      reply: vi.fn(),
    } as unknown as OrchContext;
    await authMiddleware(unauthCtx, next);
    expect(unauthCtx.reply).toHaveBeenCalledWith('Not authorized.');
    expect(next).not.toHaveBeenCalled();
  });
});
```

## NotificationService Test Pattern

```typescript
describe('NotificationService', () => {
  it('does not throw on send failure', async () => {
    const mockBot = {
      api: {
        sendMessage: vi.fn().mockRejectedValue(new Error('network')),
      },
    } as unknown as Bot<OrchContext>;
    const svc = new NotificationService(mockBot);
    // Should not throw
    await expect(svc.notify('123', fakeEvent)).resolves.not.toThrow();
  });
});
```
