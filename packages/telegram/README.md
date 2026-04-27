# @orch/telegram

Standalone Telegram bot process for the Orch daemon.

## Architecture

This is a **standalone Node.js process** — it does NOT run inside the core NestJS daemon.
It communicates with the core daemon exclusively via HTTP API (never via `@orch/core` imports).

See: `packages/core/` for the daemon; `packages/shared/` for shared types.

## Run instructions

### Prerequisites

- Node.js >= 20.10
- pnpm >= 9
- Orch core daemon running (`pnpm run dev` in root, or `pnpm --filter @orch/core start:dev`)
- Telegram bot token from [@BotFather](https://t.me/BotFather)

### Environment variables

Copy `.env.example` (or set directly):

```env
TELEGRAM_BOT_TOKEN=bot<number>:<hash>          # required — from BotFather
ORCH_TG_ALLOWED_CHAT_IDS=123456789,987654321   # required — comma-separated numeric chat IDs
ORCH_API_BEARER_TOKEN=your-bearer-token        # required — matches core daemon token
ORCH_API_BASE_URL=http://127.0.0.1:4141        # optional — default shown
```

### Development (with hot-reload via tsx)

```bash
pnpm --filter @orch/telegram dev
```

### Production (after build)

```bash
pnpm --filter @orch/telegram build
pnpm --filter @orch/telegram start
```

## Commands (Phase 2.2+)

| Command | Description |
|---|---|
| `/status` | Active session + queue depth |
| `/queue` | List pending/in-flight queue items |
| `/projects` | List registered projects |
| `/tail [N]` | Last N lines of active session stdout (default 20, max 100) |
| `/pause` | Pause queue processing |
| `/resume` | Resume queue processing |
| `/cancel` | Cancel active session (requires confirmation) |
| `/stop <id>` | Stop specific session (requires confirmation) |
| `/start <project> <plan-path>` | Enqueue a plan |

## Security

- Only whitelisted chat IDs (from `ORCH_TG_ALLOWED_CHAT_IDS`) can issue commands
- Destructive operations (`/cancel`, `/stop`) require inline-keyboard confirmation (I-6)
- All outbound messages pass through `redactSecrets()` before send
