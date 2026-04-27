# @orch/web — Orch Web UI

Local-only React dashboard for the Orch daemon.

## Architecture

This is a **Vite + React + TypeScript** SPA. It communicates with the core daemon exclusively via HTTP API (REST + SSE). It does NOT import `@orch/core` at runtime — only `@orch/shared` for TypeScript DTO types.

Server binds to `127.0.0.1:4142` (I-7 localhost-only). Core daemon runs on `127.0.0.1:4141`.

## Prerequisites

- Node.js >= 20.10
- pnpm >= 9
- Orch core daemon running (`pnpm --filter @orch/core start:dev`)

## Environment variables

Create `packages/web-ui/.env.local` (optional — defaults shown):

```env
VITE_ORCH_API_BASE_URL=http://127.0.0.1:4141
```

## Development

```bash
pnpm --filter @orch/web dev
```

Opens at `http://127.0.0.1:4142`.

## Production build

```bash
pnpm --filter @orch/web build
pnpm --filter @orch/web preview
```

## Authentication

First visit presents a token-input prompt. Enter the `ORCH_API_BEARER_TOKEN` from the daemon's env. Token is stored in `localStorage` and attached as `Authorization: Bearer <token>` to every API request. Logging out clears the stored token.

## Pages (Phase 2.6+)

| Route | Page | Description |
|---|---|---|
| `/` | Dashboard | Stat cards + recent sessions |
| `/activity` | Activity Feed | Live SSE event tail |
| `/kanban` | Kanban | Session queue board |
| `/sessions/:id` | Session Detail | Transcript + token/cost chart |
| `/settings` | Settings | Token management |
