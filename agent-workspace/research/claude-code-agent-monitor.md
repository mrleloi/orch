# Research Note: Claude-Code-Agent-Monitor

Repo: https://github.com/hoangsonww/Claude-Code-Agent-Monitor
Clone path: reference-repos/Claude-Code-Agent-Monitor/
Tier: A (deep) | Date: 2026-04-24 | Analyst: research-scanner (claude-sonnet-4-6)

---

## Metadata

| Field | Value |
|---|---|
| Author | Son Nguyen (hoangsonww) |
| License | MIT |
| Language | JavaScript (CJS server) + TypeScript (React client) |
| Stack | Node.js 18+, Express 4.21, ws 8.18, React 18.3, Vite 6.1, Tailwind 3.4 |
| Notable deps | uuid, web-push (VAPID), D3.js, i18next, React Router 6 |
| License compat | MIT - fully compatible, no copyleft |

---

## Architecture Summary

Claude Code CLI hooks -> HTTP POST /api/hooks/event
-> hooks.js processEvent (db.transaction) -> SQLite (WAL) + broadcast()
-> WebSocketServer at /ws -> React (useWebSocket -> eventBus -> pages)

Server is flat Express, not NestJS. Adapt patterns, not copy verbatim.

---

## Focus Question Answers

### 1. Deduplication of hook events

Three strategies, all server-side before INSERT:

COMPACTION ENTRIES (hooks.js lines 349-350):
Deterministic agent ID = sessionId + compact + entry.uuid
Gate: stmts.getAgent.get(compactId) -- if row exists, skip. No separate dedup table.

API ERRORS (hooks.js lines 412-416):
SELECT 1 FROM events WHERE session_id=? AND event_type=APIError AND summary=? LIMIT 1
summary = type+message. Identical errors suppressed. Content hash is key (no UUID).

TURN DURATIONS (hooks.js lines 444-447):
Dedup by (session_id, created_at=timestamp) pair.

GENERAL HOOK EVENTS: No dedup. Claude Code does not retry hooks on failure.

BORROW: Compaction UUID dedup (deterministic ID from session+uuid) clean, zero-overhead.
Content-hash dedup for error events. Apply same patterns in Orch HooksService.

---

### 2. State machine derived from hook events

Session states: active | completed | error | abandoned
Agent states: idle | connected | working | completed | error

| Hook | Session | Main agent |
|---|---|---|
| PreToolUse (normal) | stays active | -> working |
| PreToolUse (Agent tool) | stays active | stays working; new subagent -> working |
| PostToolUse | stays active | clears current_tool (stays working) |
| Stop (normal) | stays active | -> idle |
| Stop (error) | -> error | -> idle |
| SubagentStop | stays active | matching subagent -> completed |
| SessionStart | reactivate if needed | idle -> connected |
| SessionEnd | -> completed | ALL agents -> completed |
| Notification (compaction) | stays active | Compaction pseudo-agent created |

KEY INSIGHTS:
- Stop does NOT end the session. Claude finished a turn; user can still type.
- PostToolUse for Agent tool fires when subagent BACKGROUNDS, not when it finishes.
- Subagent completion is ONLY from SubagentStop or SessionEnd.
- Stale sweep: every 2 min + on SessionStart marks 5-min-idle sessions abandoned.

REACTIVATION (hooks.js lines 66-82):
Non-terminal hook on completed/abandoned session reactivates it.
Stop only reactivates completed/abandoned (handles pre-import case).
SessionEnd never reactivates.

BORROW: Transition table + reactivation logic directly.
Subagent parent heuristic (deepest working subagent when main is idle) is best available.

---

### 3. WebSocket auto-reconnect on client

File: client/src/hooks/useWebSocket.ts (72 lines)

Pattern:
- Single useRef<WebSocket> per mount -- one WS connection for whole app
- mountedRef guards all callbacks against post-unmount updates
- onclose: setTimeout(connect, 2000) -- fixed 2s backoff, no exponential
- onerror: ws.close() triggers onclose -> reconnect
- connect() is useCallback([]) -- stable reference, never re-created
- Protocol auto-detect: https -> wss, http -> ws

ARCHITECTURE (App.tsx):
useWebSocket at App root only. onMessage = eventBus.publish(msg).
Pages subscribe: eventBus.subscribe(handler) returns unsubscribe fn for useEffect cleanup.
No Redux, no Zustand, no Context -- plain singleton module (40 lines).

eventBus API (client/src/lib/eventBus.ts, 40 lines):
- subscribe(fn): returns unsubscribe fn
- publish(msg): fans out to all subscribers
- setConnected(bool) + onConnection(fn): separate connection status channel

BORROW: Entire pattern. One WS, fan-out via singleton. Adapt path for NestJS gateway.

---

### 4. Most useful Dashboard views

| View | Usefulness | Notes |
|---|---|---|
| Activity Feed | HIGH | Live tail, pause/resume + buffer, expandable payloads |
| Dashboard | HIGH | Stat cards, agent cards with subagent hierarchy auto-expand |
| Kanban Board | HIGH | 5-column per-status fetch, per-column pagination |
| Session Detail | MEDIUM | Parent-child agent tree + event timeline |
| Analytics | LOW | Token charts -- useful post-Phase 1 |
| Workflows | SKIP | D3.js DAG/Sankey -- overkill for Phase 1 |

Activity Feed key pattern (ActivityFeed.tsx lines 38-76):
- pausedRef.current (not state) avoids re-renders when paused
- bufferRef.current collects events while paused
- resume(): flushes buffer as one setState batch, slices to max 200

---

### 5. WebSocket security

Answer: NO AUTH AT ALL.
- cors() with no options = all origins allowed
- WebSocket upgrade has no token check
- Server binds to all interfaces, not localhost-only
- No API key, no shared secret, no session token

This is intentional for a local personal tool.

IMPLICATION FOR ORCH:
Orch is not pure-local (Telegram webhook). Design our own minimal auth:
1. Localhost-only bind: server.listen(port, 127.0.0.1)
2. Shared secret header for hook POST: X-Orch-Hook-Secret in HooksGuard
3. JWT/shared token on WS upgrade for Web UI

Nothing to borrow on security. Design our own.

---

## TranscriptCache Pattern (High Value Bonus)

File: server/lib/transcript-cache.js (415 lines)

Efficiently reads append-only JSONL files:
- LRU eviction: Map delete-then-reinsert (Map preserves insertion order)
- Cache hit requires same mtime AND same size
- File grew: incremental fs.readSync at byte offset -- only new bytes
- File shrunk (compaction rewrote): full re-read
- Same size, different mtime: full re-read
- invalidate(path) for SessionEnd cleanup; clear() for shutdown

BORROW: Port to TypeScript. Keep mtime+size dual-check invalidation.
Useful for Orch extracting tokens from ~/.claude/ JSONL files.

---

## Findings Table

| Finding | Category | File | Notes |
|---|---|---|---|
| eventBus singleton | BORROW | client/src/lib/eventBus.ts | 40 lines, port to TS strict |
| useWebSocket hook | BORROW | client/src/hooks/useWebSocket.ts | 72 lines, mountedRef guard |
| Session/Agent state machine | BORROW | server/routes/hooks.js:54-328 | Full transitions + edge cases |
| Compaction UUID dedup | BORROW | server/routes/hooks.js:349-350 | Deterministic ID = session+uuid |
| Activity Feed pause/buffer | BORROW | client/src/pages/ActivityFeed.tsx:38-76 | bufferRef + flush |
| TranscriptCache JSONL | BORROW | server/lib/transcript-cache.js | Port to TS, mtime+size check |
| Kanban 5-column layout | LEARN | client/src/pages/KanbanBoard.tsx | Adapt to shadcn/ui Card |
| Subagent parent heuristic | LEARN | server/routes/hooks.js:107-118 | Fragile but best available |
| DB schema reference | LEARN | server/db.js:44-112 | Good start for Prisma schema |
| D3.js Workflow viz | SKIP | client/src/pages/Workflows.tsx | Phase 1 overkill |
| i18n infrastructure | SKIP | client/src/i18n/ | Not in Orch charter |
| VAPID web push | SKIP | server/lib/push.js | Telegram is our channel |
| MCP server | SKIP | mcp/ | Not Phase 1 |
| No auth on WS/API | CONCERN | server/index.js:32 | Design our own auth |
| CJS not ESM | CONCERN | package.json | Patterns translate; files do not |

---

## Top 3 Borrow Items

1. eventBus + useWebSocket
   client/src/lib/eventBus.ts + client/src/hooks/useWebSocket.ts
   One WS at App root, fan-out via 40-line pub/sub singleton.
   Port to TypeScript strict. Adapt WS path for NestJS gateway.

2. Hook event state machine
   server/routes/hooks.js lines 54-328
   Complete lifecycle: all hook types + reactivation + stale sweep.
   Translate to NestJS HooksService + Prisma.

3. Activity Feed pause/buffer pattern
   client/src/pages/ActivityFeed.tsx lines 38-76
   bufferRef (not state) collects events during pause; resume flushes as one batch.

---

## Top 3 Skip Items

1. D3.js Workflow visualizations: Phase 1 overkill.
2. VAPID web push: Orch uses Telegram.
3. i18n: English only in Orch charter.

---

## Concerns

- No auth: Zero auth on WS or HTTP. Orch must design its own minimal auth layer.
- CJS server: NestJS is ESM. Patterns translate, files do not copy verbatim.
- better-sqlite3 vs Prisma: Schema is good reference; query code does not port.
- Flat Express vs NestJS: 543-line hook handler needs decomposition into HooksModule.

---

## License Verdict

MIT - fully compatible. No copyleft. Can borrow patterns and code freely.
