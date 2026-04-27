# Command Handlers, Callbacks, and Confirmation Flow

## Command Handlers

```typescript
export function registerCommands(bot: Bot<OrchContext>) {
  bot.command('status', async (ctx) => {
    const status = await orchClient.getStatus();
    await ctx.reply(formatStatus(status), { parse_mode: 'Markdown' });
  });

  bot.command('queue', async (ctx) => {
    const arg = ctx.match?.toString().trim();
    if (!arg) {
      await ctx.reply('Usage: /queue <plan-path-or-name>');
      return;
    }
    // Proceed with enqueue (no confirmation -- non-destructive)
    const item = await orchClient.enqueue({ source: 'telegram', path: arg });
    await ctx.reply(`Queued: ${item.id}`);
  });

  bot.command('stop', async (ctx) => {
    // Destructive -- require confirmation (Invariant I-6)
    const active = await orchClient.getActiveSession();
    if (!active) {
      await ctx.reply('No active session.');
      return;
    }
    ctx.session.pendingConfirmation = {
      action: `stop_session:${active.id}`,
      expiresAt: Date.now() + 60_000,
    };
    await ctx.reply(
      `Stop active session ${active.id}?`,
      {
        reply_markup: {
          inline_keyboard: [[
            { text: 'Yes, stop', callback_data: `confirm:stop:${active.id}` },
            { text: 'Cancel', callback_data: 'cancel' },
          ]],
        },
      },
    );
  });
}
```

## Commands Required by Phase 2

Minimum set (see phase-2-interfaces.md):
- /start, /help
- /status, /queue, /queue-list, /projects
- /pause, /resume
- /tail, /logs, /switch-profile
- /stop (with confirmation)

## Confirmation Callback (Invariant I-6)

```typescript
bot.callbackQuery(/^confirm:stop:(.+)$/, async (ctx) => {
  const sessionId = ctx.match[1];
  const pending = ctx.session.pendingConfirmation;

  if (!pending || pending.expiresAt < Date.now()) {
    await ctx.answerCallbackQuery({ text: 'Confirmation expired.' });
    return;
  }
  if (pending.action !== `stop_session:${sessionId}`) {
    await ctx.answerCallbackQuery({ text: 'Invalid confirmation.' });
    return;
  }

  await orchClient.stopSession(sessionId);
  ctx.session.pendingConfirmation = undefined;
  await ctx.editMessageText(`Session ${sessionId} stopped.`);
  await ctx.answerCallbackQuery();
});

bot.callbackQuery('cancel', async (ctx) => {
  ctx.session.pendingConfirmation = undefined;
  await ctx.editMessageText('Cancelled.');
  await ctx.answerCallbackQuery();
});
```

## Anti-Patterns for Handlers

- Auth check missing on commands (hard security bug)
- Destructive command without confirmation (violates I-6)
- Long-running work in command handler -- acknowledge + enqueue, let core process
- Direct DB/filesystem access from bot (use orchClient HTTP client)
