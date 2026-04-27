# Auth, Logging, and Rate-Limit Middleware

## Auth Middleware (Required)

```typescript
import { MiddlewareFn } from 'grammy';

const ALLOWED = (process.env.TELEGRAM_ALLOWED_USERS ?? '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

export const authMiddleware: MiddlewareFn<OrchContext> = async (ctx, next) => {
  const uid = ctx.from?.id?.toString();
  if (!uid || !ALLOWED.includes(uid)) {
    await ctx.reply('Not authorized.');
    return; // do NOT call next
  }
  ctx.userId = uid;
  return next();
};
```

Never log denial payloads with PII beyond user ID.

## Logging Middleware

```typescript
import { MiddlewareFn } from 'grammy';
import { logger } from '../logger';

export const loggingMiddleware: MiddlewareFn<OrchContext> = async (ctx, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  logger.info({
    update_type: ctx.updateType,
    user_id: ctx.userId,
    ms,
  }, 'bot update handled');
};
```

## Rate-Limit Middleware

```typescript
import { MiddlewareFn } from 'grammy';

const rateLimitMap = new Map<string, number>();
const RATE_LIMIT_MS = 1000; // 1 req/sec per user

export const rateLimitMiddleware: MiddlewareFn<OrchContext> = async (ctx, next) => {
  const uid = ctx.userId ?? ctx.from?.id?.toString() ?? 'unknown';
  const last = rateLimitMap.get(uid) ?? 0;
  if (Date.now() - last < RATE_LIMIT_MS) {
    await ctx.reply('Slow down. One request per second.');
    return;
  }
  rateLimitMap.set(uid, Date.now());
  return next();
};
```

## Middleware Registration Order

Order matters -- always register in this sequence:
1. session()
2. authMiddleware (first check -- no userId set before this)
3. loggingMiddleware (logs authenticated userId)
4. rateLimitMiddleware (rate limit after auth, before handlers)
5. command/callback/message handlers
