# Research Notes: Claude-to-IM

**URL**: https://github.com/op7418/Claude-to-IM
**Stack**: TypeScript, Node 20+, ESM, pure library (no framework)
**License**: MIT
**Last commit at time of research**: 2025
**Stars**: not available from local clone

## What It Does

Claude-to-IM is a host-agnostic TypeScript library that bridges Claude Code SDK to IM platforms (Telegram, Discord, Feishu/Lark). It handles all IM-side complexity -- message routing, streaming previews, permission approval flows, Markdown rendering, chunking, retry, dedup, rate limiting -- while delegating persistence, LLM calls, and permission resolution to the host application through four DI interfaces: BridgeStore, LLMProvider, PermissionGateway, LifecycleHooks. The host calls initBridgeContext() once, then bridgeManager.start(). Bridge modules never import from the host; all access goes through getBridgeContext().

## Architecture at a Glance

IM Platform (Telegram / Discord / Feishu)
        |
        | InboundMessage (from polling/WebSocket queue)
        v
   BaseChannelAdapter (abstract) -- per-platform subclass
        |
        v
   BridgeManager (orchestrator: consumeOne loop, session locks)
     |- ChannelRouter       -> ChannelAddress -> ChannelBinding -> session ID
     |- ConversationEngine  -> streamChat() -> SSE stream consume
     |- PermissionBroker    -> inline button forwarding + callback resolve
     |- DeliveryLayer       -> chunking, retry, dedup, audit
        |
        | BridgeContext (globalThis singleton, DI)
        v
   Host App (implements BridgeStore, LLMProvider, PermissionGateway, LifecycleHooks)

Key invariant: no bridge module imports from the host application directly.

## What We Borrow

### 1. DI Context Pattern (context.ts)
- Location: src/lib/bridge/context.ts (55 lines)
- Why: initBridgeContext() / getBridgeContext() / hasBridgeContext() via globalThis key is the cleanest zero-dependency DI pattern seen. Framework-free. Survives HMR. Testable (re-init with mocks). Maps directly to how we want IAgentRuntime and IChannelAdapter injected in Orch without NestJS DI leaking into domain.
- Adaptation needed: Rename to initOrchContext(). Our context shape differs (store, runtime, notifier vs their store, llm, permissions, lifecycle). Identical mechanism.
- Estimated effort: Low (30-minute port)
- Category: BORROW

### 2. BridgeStore Interface as IOrchStore Shape Reference (host.ts)
- Location: src/lib/bridge/host.ts, lines 143-200
- Why: Most complete enumeration seen of what a session/message/lock/audit persistence layer needs. 30+ methods: settings, session CRUD, message CRUD, lock acquire/renew/release, audit log, dedup, permission links, channel offsets. Use as checklist when defining IOrchStore in packages/core/src/domain/.
- Adaptation needed: Remove PermissionLink methods (different in Orch). Rename codepilotSessionId to sessionId. Keep lock methods verbatim.
- Estimated effort: Low (reference, not direct port)
- Category: LEARN

### 3. Session Lock Mechanism (bridge-manager.ts lines 200-213)
- Location: src/lib/bridge/bridge-manager.ts, processWithSessionLock() function
- Why: Promise-chaining serial lock is exactly what we need for per-session message serialization. Same-session messages queue; different-session messages run concurrently. 13 lines of vanilla JS, no external deps. No Redis, no Postgres advisory locks for single-process. For multi-process they delegate to BridgeStore.acquireSessionLock() (DB-backed).
- Adaptation needed: None -- copy verbatim. Same concurrency requirement (one active claude worker per session, multiple sessions parallel).
- Estimated effort: Trivial
- Category: BORROW

### 4. BaseChannelAdapter Abstract Class + Self-Registration Registry (channel-adapter.ts)
- Location: src/lib/bridge/channel-adapter.ts (137 lines)
- Why: Abstract class + registerAdapterFactory() / createAdapter() / getRegisteredTypes() is exactly our IChannelAdapter need. New channel types self-register via side-effect import (adapters/index.ts). Bridge manager never changes for new adapters. Optional method declarations (sendPreview, onStreamText, onStreamEnd, acknowledgeUpdate, onMessageStart, onMessageEnd) are clean extension points without forced interface bloat.
- Adaptation needed: Medium. Their adapters cover Telegram + Discord + Feishu. Ours covers Telegram + Web UI. Abstract interface stays; we write two concrete adapters. consumeOne() queue pattern is directly reusable.
- Estimated effort: Medium (new adapters, same abstract shape)
- Category: BORROW

## What We Skip

### Agent SDK dependency
- Reason: package.json depends on @anthropic-ai/claude-agent-sdk. Charter hard rule: no Agent SDK for subscription accounts. LLMProvider.streamChat() interface is the right abstraction boundary -- we back it with execa subprocess parsing instead.
- Category: SKIP

### Multi-platform Markdown renderers (markdown/)
- Reason: Telegram only for v1; Grammy handles Telegram HTML natively. Their markdown-it AST pipeline is over-engineered for v1 scope. Revisit if Discord is added.
- Category: SKIP

### Delivery Layer (delivery-layer.ts) as-is
- Reason: Full retry/dedup/audit delivery layer adds complexity. Grammy built-in error handling covers most of this. We borrow the dedup key concept (check before send, insert after) but not the full module.
- Category: LEARN

### Feishu / Discord adapters
- Reason: Out of scope for Orch v1. Telegram + Web UI only.
- Category: SKIP

### Permission Broker (permission-broker.ts)
- Reason: Claude Code tool permissions flow via CLI subprocess output parsing, not an SDK callback. We handle at the worker level, not in a separate broker. Concept noted, implementation does not map.
- Category: SKIP

### Security validators (security/validators.ts)
- Reason: Grammy + NestJS pipes cover input validation. Path-traversal checks useful only if we expose /cwd commands -- borrow if/when we add them.
- Category: SKIP (defer)

## Stack Compatibility

- Language: TypeScript strict, ESM -- exact match.
- Runtime: Node 20+ -- exact match.
- Framework: Pure library (no NestJS). Orch domain layer is also framework-free. DI context pattern deliberately avoids NestJS -- compatible.
- ToS: They use Claude Agent SDK for LLM calls. We replace with CLI subprocess. LLMProvider.streamChat() is the correct abstraction boundary for this swap.

## License Compatibility

- This repo license: MIT (confirmed, LICENSE file)
- Orch license: MIT
- Compatible: Yes, no restriction.

## Key Insights

1. globalThis as DI container is the right pattern for library-style code. NestJS @Injectable() creates coupling if domain code needs to work in tests without starting the NestJS app. getBridgeContext() gives zero-dep DI -- initialize in NestJS bootstrap, test with plain mock objects. We adopt this for packages/core/src/domain/.

2. Session lock via promise chaining beats distributed locks for single-process. processWithSessionLock() uses a Map of chained promises (13 lines): serial-within-session, parallel-across-session. No Redis, no advisory locks, no external state. For multi-process, layer BridgeStore.acquireSessionLock() on top. Implement in this order: promise chain first, DB lock only if we ever run multiple Orch processes.

3. Offset watermark pattern for at-least-once delivery. Telegram adapter persists committedOffset to the store (key: telegram_offset_<botUserId>) and calls acknowledgeUpdate() only after full processing completes in the finally block. On crash-restart, the last in-flight update is replayed. We need this same pattern: ack offset only after the claude worker finishes (success or failure).

## Code Snippets Worth Studying Later

- src/lib/bridge/context.ts -- full file (55 lines). Port initBridgeContext / getBridgeContext / hasBridgeContext triad.
- src/lib/bridge/bridge-manager.ts, lines 200-213 -- processWithSessionLock(). Copy verbatim.
- src/lib/bridge/host.ts, lines 143-200 -- BridgeStore interface. Use as IOrchStore method checklist.
- src/lib/bridge/channel-adapter.ts -- full file (137 lines). Abstract base + registry shape for IChannelAdapter.
- src/lib/bridge/adapters/telegram-adapter.ts, lines 73-120 -- start/stop/queue pattern.
- src/lib/bridge/adapters/index.ts -- side-effect self-registration idiom (4 lines).
