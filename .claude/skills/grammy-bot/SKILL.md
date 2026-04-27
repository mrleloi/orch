---
name: grammy-bot
description: Use when creating, editing, or reviewing any code under `packages/telegram/`, or when the user mentions a Telegram bot handler, command, inline keyboard, middleware, or notification. Do NOT use for non-Grammy Telegram API work.
tools: [Read, Bash, Grep, Edit]
archetype: reference
---

# Grammy Telegram Bot -- Orch Patterns

## When to Use

Any task in `packages/telegram/` involving:
- Command handlers
- Middleware (auth, logging)
- Inline keyboards / confirmation flows
- Outbound notifications
- Bot startup/shutdown

## Reference Index

| Topic | File | When to read |
|-------|------|--------------|
| Bot setup, createBot, lifecycle | `.claude/skills/grammy-bot/references/bot-setup.md` | creating/modifying bot.ts or TelegramBotService |
| Auth, logging, rate-limit middleware | `.claude/skills/grammy-bot/references/middleware.md` | adding/debugging middleware |
| Command handlers, callbacks, confirmation | `.claude/skills/grammy-bot/references/handlers.md` | implementing commands or I-6 confirmation flow |
| Outbound notifications, throttling, testing | `.claude/skills/grammy-bot/references/notifications-and-testing.md` | NotificationService or writing bot tests |

## Quick Reference

```typescript
// Minimal bot factory pattern
export function createBot(token: string): Bot<OrchContext> {
  const bot = new Bot<OrchContext>(token);
  bot.use(session({ initial: () => ({}) }));
  bot.use(authMiddleware);    // auth FIRST after session
  bot.use(loggingMiddleware);
  bot.use(rateLimitMiddleware);
  registerCommands(bot);
  registerCallbacks(bot);
  registerMessages(bot);
  return bot;
}

// Auth guard (required on all commands)
export const authMiddleware: MiddlewareFn<OrchContext> = async (ctx, next) => {
  const uid = ctx.from?.id?.toString();
  if (!uid || !ALLOWED.includes(uid)) {
    await ctx.reply('Not authorized.');
    return;
  }
  ctx.userId = uid;
  return next();
};

// Destructive action: always require confirmation (I-6)
ctx.session.pendingConfirmation = { action: 'stop_session:' + id, expiresAt: Date.now() + 60_000 };
```

## Anti-Patterns

- Auth check missing on commands (hard security bug)
- Destructive command without confirmation (violates I-6)
- `await bot.start()` blocking startup -- use promise and continue
- Throwing from notification (crashes bot)
- Direct DB/filesystem access from bot (use orchClient HTTP client)
- Long-running work in command handler -- acknowledge + enqueue, let core process
