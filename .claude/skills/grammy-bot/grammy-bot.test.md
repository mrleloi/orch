# grammy-bot self-test

## Trigger

Any task in `packages/telegram/` involving:
- Command handlers (`bot.command(...)`)
- Middleware (auth, logging, rate-limit)
- Inline keyboards or confirmation flows
- Outbound notifications
- Bot startup or shutdown lifecycle

## Expected Behavior

Skill activates and every `bot.command(...)` is preceded by `bot.use(authMiddleware)` in
`createBot()`. Destructive commands set `ctx.session.pendingConfirmation` before executing
(I-6 confirmation flow). `packages/telegram/` imports nothing from `@orch/core`, `node:fs`
write helpers, or `prisma` client directly -- all external access uses `orchClient` HTTP.

## Failure Modes

- F1: auth check missing on commands -- security bug; `bot.command()` registered before `bot.use(authMiddleware)`
- F2: destructive command executes without setting `ctx.session.pendingConfirmation` -- I-6 invariant violation
- F3: `await bot.start()` used blocking startup -- must use promise-and-continue pattern
- F4: direct DB or filesystem access from bot handler -- must use `orchClient` HTTP client instead

## Metrics

- activation_count_per_session: 0-3
- success_rate: TBD (Phase 5.5)
- token_cost_p50: TBD (Phase 5.5)
- duration_ms_p50: TBD (Phase 5.5)

## Assertions

1. Every `bot.command(...)` registration in `packages/telegram/` is preceded by
   `bot.use(authMiddleware)` in the same `createBot()` factory -- verify by sequence grep
   of `createBot` function bodies for `authMiddleware` appearing before any `bot.command`.
2. Every destructive command handler (bodies containing `stop_session`, `delete`, or
   `switch_account`) sets `ctx.session.pendingConfirmation = {` before executing the
   action -- grep handler bodies in `packages/telegram/src/`.
3. `packages/telegram/` source files contain ZERO imports from `@orch/core` repositories,
   `node:fs` write helpers (`writeFile`, `writeFileSync`), or `prisma` client directly --
   cross-module isolation grep: `grep -rn "from '@orch/core'\|require('fs')\|PrismaClient" packages/telegram/src/`.
