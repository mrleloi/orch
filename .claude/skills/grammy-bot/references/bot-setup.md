# Bot Setup

## OrchContext Interface

```typescript
import { Bot, Context, session } from 'grammy';

export interface OrchContext extends Context {
  session: {
    pendingConfirmation?: {
      action: string;
      expiresAt: number;
    };
  };
  userId: string;  // set by auth middleware
}
```

## createBot Factory

```typescript
export function createBot(token: string): Bot<OrchContext> {
  const bot = new Bot<OrchContext>(token);

  // Session (in-memory, no persistence -- ephemeral state per chat)
  bot.use(session({
    initial: () => ({}),
  }));

  // Auth -- must be first after session
  bot.use(authMiddleware);

  // Logging
  bot.use(loggingMiddleware);

  // Rate limiting
  bot.use(rateLimitMiddleware);

  // Handlers
  registerCommands(bot);
  registerCallbacks(bot);
  registerMessages(bot);

  return bot;
}
```

## Package Structure

```
packages/telegram/src/
├── bot/
│   ├── bot.ts                    # create + configure Grammy instance
│   ├── middleware/
│   │   ├── auth.middleware.ts
│   │   ├── logging.middleware.ts
│   │   └── rate-limit.middleware.ts
│   └── handlers/
│       ├── command.handler.ts    # slash commands
│       ├── callback.handler.ts   # inline keyboard callbacks
│       └── message.handler.ts    # fallback text
├── services/
│   ├── notification.service.ts   # outbound to users
│   └── orch-client.service.ts    # talks to core via HTTP
└── main.ts
```

## Launch Mode

For local dev and most users: **long polling**.
```typescript
await bot.start();
```

For production/webhooks: see Grammy docs -- requires public HTTPS endpoint, not recommended for personal daemon.

## Lifecycle in NestJS (if bot runs inside core)

```typescript
@Injectable()
export class TelegramBotService implements OnApplicationBootstrap, OnModuleDestroy {
  private bot: Bot<OrchContext>;

  async onApplicationBootstrap() {
    this.bot = createBot(config.telegramToken);
    // non-blocking start
    this.bot.start().catch(err => this.logger.error({ err }));
  }

  async onModuleDestroy() {
    await this.bot.stop();
  }
}
```

Decision: separate process is safer. Put bot in its own package, connect to core via HTTP.

## Error Handling

```typescript
bot.catch((err) => {
  const ctx = err.ctx;
  logger.error({ err, update: ctx.update }, 'Bot error');

  // Attempt to notify user (do not await -- already in error path)
  ctx.reply('Something went wrong. Check Orch logs.').catch(() => {});
});
```
