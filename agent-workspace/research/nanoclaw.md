# Research Notes: nanoclaw

**URL**: https://github.com/qwibitai/nanoclaw
**Stack**: TypeScript, Node.js 20+, better-sqlite3, ESM modules; container uses Bun + @anthropic-ai/claude-agent-sdk
**License**: MIT
**Last commit at time of research**: 2026 (v2.0.10 active)
**Stars**: Not recorded (self-hosted fork model)

---

## What It Does

NanoClaw is a personal AI assistant daemon that routes messages from chat platforms (Telegram, Discord, WhatsApp, etc.) into per-session SQLite DBs, wakes Docker containers running Claude Agent SDK, and delivers responses back through the originating channel. Design is intentionally minimal: one Node host process, no microservices. Users fork and customize.

---

## Architecture at a Glance

```
messaging platforms
    | channel adapters (self-register on import)
    v
[router.ts] resolve messaging group -> agent group -> session -> write inbound.db -> wake container
    |
    v
[inbound.db] single-writer (host), SQLite, journal_mode=DELETE
    |
[Docker container / Bun agent-runner] polls inbound.db, runs Claude Agent SDK, writes outbound.db
    |
[outbound.db] single-writer (container), SQLite, journal_mode=DELETE
    |
[delivery.ts] polls outbound.db (1s active + 60s sweep), delivers via channel adapter
    |
messaging platforms
```

Key modules:
- src/channels/adapter.ts -- ChannelAdapter interface: setup/teardown/deliver/setTyping/openDM
- src/channels/channel-registry.ts -- registry Map, registerChannelAdapter, initChannelAdapters with retry
- src/session-manager.ts -- session folder structure, inbound/outbound DB open-close-per-op
- src/container-runner.ts -- wakeContainer, wakePromises dedup Map, activeContainers Map
- src/host-sweep.ts -- 60s sweep, stuck detection (absolute ceiling + per-claim), exponential backoff retry
- src/delivery.ts -- dual poll, inflightDeliveries Set prevents double-delivery
- container/agent-runner/src/ -- Bun poll-loop, Claude Agent SDK, MCP tools

---

## What We Borrow

### 1. Channel Adapter Interface Pattern
- Location: src/channels/adapter.ts + src/channels/channel-registry.ts
- Why: Clean interface for multi-channel support. ChannelAdapter with setup/teardown/deliver/setTyping/openDM maps directly to Orch Telegram + WebUI needs. Factory pattern means channels self-register on import -- no switch/case. supportsThreads boolean handles DM-vs-channel differences cleanly.
- Adaptation: Drop containerConfig from ChannelRegistration (Orch does not spawn containers per channel). Keep interface nearly verbatim.
- Estimated effort: LOW

### 2. Wake-dedup + In-flight Promise Map
- Location: src/container-runner.ts lines 50-92 (wakePromises Map + wakeContainer fn)
- Why: The wakePromises Map deduplicates concurrent wake calls during async spawn. Orch IAgentRuntime.spawn has the identical race -- two Telegram messages 50ms apart both try to spawn a ccs subprocess against the same session. Pattern (promise map + .finally cleanup) is the exact fix.
- Adaptation: Replace Docker spawn with execa calling ccs. Keep promise-dedup wrapper as-is.
- Estimated effort: LOW

### 3. Stuck-Session Detection Logic (decideStuckAction)
- Location: src/host-sweep.ts lines 70-106
- Why: Two-tier stuck detection -- absolute ceiling (heartbeat age > 30min) AND per-claim tolerance (message claimed, no heartbeat update since). Pure function with deterministic inputs, easily testable. Orch needs equivalent watchdog for ccs subprocess sessions.
- Adaptation: Replace heartbeat file with process liveness check (child.exitCode !== null). Replace container claims with Orch in-memory session state. Decision tree (ceiling vs. claim-stuck) is directly borrowable.
- Estimated effort: MEDIUM (change inputs, keep decision tree)

### 4. Single-writer SQLite + Open-Close-Per-Op Pattern (LEARN only)
- Location: src/session-manager.ts
- Why: Critical cross-process SQLite safety: journal_mode=DELETE (not WAL) when multiple processes share a DB file; open/close per operation to invalidate page cache across process boundaries. Orch uses Prisma/SQLite -- if worker subprocesses ever access the same DB, WAL mode silently stale-reads. Document now; apply if needed.
- Adaptation: Note constraint in our DB setup docs.
- Estimated effort: LEARN

---

## What We Skip

### Container Runner (Docker spawn)
- Reason: Orch charter mandates CLI subprocess (ccs), not Docker isolation. spawnContainer is coupled to Docker CLI args, OneCLI credential injection, and mount management -- none apply to execa approach. Borrow wake-dedup only.

### Agent SDK Usage (container/agent-runner/)
- Reason: Orch charter prohibits Agent SDK for subscription accounts (Anthropic ToS, April 2026). Entire container/agent-runner/ uses @anthropic-ai/claude-agent-sdk. Irrelevant.

### Two-DB Split (inbound.db + outbound.db)
- Reason: Solves Docker cross-mount contention. Orch is single host process talking to ccs via stdio -- no cross-mount DB needed. One Prisma-managed SQLite per session is simpler.

### OneCLI Credential Vault
- Reason: Orch never handles raw API keys. ccs/claude CLI manages auth. OneCLI is nanoclaw-specific container infra.

### Skills Branch Distribution System
- Reason: Orch uses NestJS modules with profile.yaml project registration. Git-branch-as-skill-distribution is incompatible.

### Bun Runtime
- Reason: Orch is Node.js + NestJS throughout. Bun is nanoclaw-specific to the container runner.

---

## Stack Compatibility

- Language: TypeScript -- full match
- Runtime: Node 20+ -- full match
- Framework: Nanoclaw uses plain Node + ESM (no NestJS). Patterns are framework-agnostic and wrap cleanly into NestJS services.
- ToS: Nanoclaw uses Claude Agent SDK inside containers. Orch avoids this by design. Our CLI subprocess approach is ToS-safer.

---

## License Compatibility

- Nanoclaw license: MIT
- Orch license: MIT (planned)
- Compatible: YES. No restrictions on commercial use, modification, or redistribution.

---

## Key Insights

1. **Promise-map wake deduplication is load-bearing, not optional.** Without wakePromises, any burst of inbound messages during async spawn creates duplicate worker processes writing to the same session state. Nanoclaw explicitly solved this (src/container-runner.ts lines 50-92). Orch must implement the same in IAgentRuntime.spawn or face racy double-execution.

2. **Dual-poll delivery with inflightDeliveries Set is the correct pattern.** A running session appears in both poll sets (1s active + 60s sweep). Without the in-memory Set guard, both timer chains read the same undelivered DB row and invoke the channel adapter twice. This pattern applies directly to Orch session output handling.

3. **Import-based self-registration trades simplicity for operational rigidity.** Nanoclaw uses commented barrel imports to enable/disable channels -- simple but requires code change + restart per deployment. Orch should use config-driven registration (profile.yaml declares adapters) to stay project-agnostic and allow runtime configuration.

---

## Code Pointers Worth Studying Later

- Wake dedup pattern: src/container-runner.ts lines 50-92
- Stuck detection pure function: src/host-sweep.ts lines 70-106
- Channel registry (full, ~108 lines): src/channels/channel-registry.ts
- ChannelAdapter interface + factory types: src/channels/adapter.ts lines 110-178
- Delivery dual-poll + inflight guard: src/delivery.ts lines 30-51
- Session open-close-per-op: src/session-manager.ts lines 186-230