# Research Notes: praktor

**URL**: https://github.com/mtzanidakis/praktor
**Stack**: Go (gateway binary) + TypeScript (agent-runner in Docker) + React/Vite (Mission Control UI)
**License**: MIT
**Last commit at time of research**: 2026 (active)
**Stars**: Not recorded (self-hosted focus)

## What It Does

Single Go binary that bridges Telegram messages to named Claude Code agents running in isolated Docker containers, with a real-time React Mission Control dashboard. Messages flow: Telegram -> Go gateway -> prefix/AI router -> NATS pub/sub -> Docker agent container (TypeScript agent-runner with Claude Agent SDK) -> response back through NATS -> Telegram. The gateway also hosts a REST and WebSocket API consumed by Mission Control. Supports scheduled tasks, graph-based agent swarms, vault-encrypted secrets, and hot config reload.

## Architecture at a Glance

Layers:
- Telegram <-> Go Gateway (single binary)
  - Router: 3-tier (@prefix -> AI classify -> default fallback)
  - NATS: embedded pub/sub bus (nats-io/nats-server)
  - Agent Orchestrator: Docker container lifecycle via Docker SDK
  - Scheduler: cron/interval/one-shot tasks
  - Swarm Coordinator: DAG-based fan-out/pipeline/collaborative
  - HTTP/WS Server: Mission Control API + embedded React SPA
  - SQLite: messages, tasks, swarms, secrets, sessions
  - Vault: AES-256-GCM encrypted secrets
- Docker containers (per agent, spawned on demand):
  - TypeScript agent-runner
    - NATS bridge (agent <-> host IPC)
    - Claude Agent SDK query() loop
    - MCP servers: memory, tasks, nix, swarm-chat, file-send, user-profile

NATS topics (canonical):
- agent.{agentID}.input: host -> container user messages
- agent.{agentID}.output: container -> host agent responses
- agent.{agentID}.control: host -> container shutdown/ping
- agent.{agentID}.route: host -> container AI routing queries
- host.ipc.{agentID}: container -> host IPC commands
- swarm.{swarmID}.chat.{groupID}: inter-agent collaborative chat
- events.>: broadcast to WebSocket clients

## What We Borrow

### 1. 3-Tier Routing Architecture (LEARN - implement in TS)
- Location: internal/router/router.go lines 34-77
- Pattern: (1) @swarm prefix -> swarm coordinator; (2) @agent_name prefix -> named agent; (3) AI classification via default agent; (4) default agent fallback.
- Why: Exact routing model we want. Charter says prefix-only for v1. AI tier 3 deferred to v2.
- Adaptation: Implement in TS as a pure function route(message, config) -> {agentId, cleanedMessage}. No Go code needed.
- Estimated effort: Low (50-80 lines TS, pure logic, unit-testable)

### 2. Swarm Graph Model (LEARN - implement in v2)
- Location: internal/swarm/types.go, internal/swarm/graph.go, ui/src/components/SwarmGraph.tsx
- Pattern: Agents as graph nodes. Synapses define relations: no edge = fan-out; A->B = pipeline (B receives A output); A<->B = collaborative (shared NATS chat topic). DAG topological sort produces ExecutionTier[]. Lead agent always runs last and synthesizes all results.
- Telegram syntax: @swarm a1>a2>a3: task (pipeline), @swarm a1,a2,a3: task (fan-out), @swarm a1<>a2,a3: task (collaborative)
- Why: Most rigorous swarm model in any reference repo. Tier-based execution is clean and testable.
- Adaptation: Port graph builder BuildPlan() logic to TS. SVG graph editor in SwarmGraph.tsx is React -- directly usable for Orch Mission Control v2.
- Estimated effort: Medium (graph builder ~150 lines TS; UI borrowable almost directly)

### 3. Mission Control UI Page Set (LEARN - validate our page list)
- Location: ui/src/pages/: Dashboard, Agents, Conversations, Tasks, Secrets, Swarms, UserProfile
- Pattern: 7 pages covering live agent status, message history, scheduled tasks, vault secrets, swarm runs, user profile
- Why: Validates minimum viable Mission Control. We are missing Tasks and Swarms pages in our current spec.
- Adaptation: React/Vite -- same stack we plan. Can borrow page structure and naming conventions.
- Estimated effort: Low (reference for page inventory, not code copy)

### 4. MCP Server Per-Domain Pattern (BORROW pattern)
- Location: agent-runner/src/mcp-*.ts (memory, tasks, nix, swarm-chat, file-send, user-profile)
- Pattern: Each tool domain in its own file with its own McpServer instance + StdioServerTransport. All registered in index.ts mcpServers map. esbuild bundles each to independent out/mcp-{domain}.js.
- Why: Clean separation. Easy to add/remove MCP capabilities per-agent without touching other domains.
- Adaptation: Same TS stack. Direct pattern adoption for our worker MCP servers.
- Estimated effort: Low (structural pattern, not logic copy)

### 5. Telegram Command Set (BORROW - as validated command inventory)
- Commands: /agents, /commands, /start [agent], /stop [agent], /reset [agent], /nix <action> [package] [@agent]
- Inline routing: @agent_name message and @swarm topology: task
- /stop: aborts active run and drains queue (container stays running)
- /reset: clears session context for fresh conversation (distinct from /stop -- important distinction)
- Why: Most complete validated command set from any reference repo studied.
- Adaptation: Implement in Grammy. Skip /nix for v1 (no container isolation in our architecture).
- Estimated effort: Low

### 6. Pre-warm Pattern (LEARN - conceptual)
- Location: agent-runner/src/index.ts lines 60-80 (WarmQuery, startup(), rewarm())
- Pattern: After completing a response, pre-warm the next subprocess so it is ready when the next message arrives. Discard pre-warmed handle if session changes while warming.
- Why: Reduces first-token latency for sequential conversations.
- Adaptation: Conceptual borrow. Our ClaudeCodeAdapter can pre-warm a ccs process after each response completes.
- Estimated effort: Medium (design work to apply to CLI subprocess safely)

## What We Skip

### Go implementation details
- Reason: We are TS/Node. All Go code is architecture-reference only. Do not attempt to port.

### Docker container-per-agent isolation
- Reason: Charter says subprocess-per-session, not container-per-agent. Managed projects have their own environments. Container isolation valid for multi-tenant setups (praktor use case) but Orch serves known projects with trusted configs. Adds Docker-in-Docker complexity with no benefit.

### NATS message bus
- Reason: Praktor needs NATS because agents run in separate containers with no shared memory. Orch workers are subprocesses on the same host -- EventEmitter or simple IPC pipe is sufficient. NATS adds 40MB+ overhead for a problem we do not have.

### AI routing (tier 3 of praktor router)
- Reason: Charter explicitly states daemon is dumb. LLM calls ONLY inside Claude Code workers, NEVER in daemon logic. AI routing tier violates this invariant. Orch v1 implements prefix routing only (tiers 1-2).

### Swarm Coordinator (v1 scope)
- Reason: Phase 3+ feature. Architecture is worth learning (see BORROW section) but building swarm coordination in v1 is scope creep.

### AgentMail, voice STT/TTS, Nix package manager, browser automation
- Reason: Per-assistant features, not orchestration infrastructure. Out of scope for Orch at any phase.

### Vault (AES-256-GCM secrets)
- Reason: Orch does not manage secrets for managed projects. Projects hold their own secrets. YAGNI.

### Per-agent persistent memory (SQLite + vector search)
- Reason: Managed projects maintain their own memory in CLAUDE.md and working files. Orch routes and schedules -- it does not manage cross-session memory for workers.

### Hot config reload via file polling
- Reason: For v1 restart daemon on config change. Revisit in v2 if operational pain emerges.

## Stack Compatibility
- Language: Go (gateway, incompatible -- no porting) + TypeScript (agent-runner, directly applicable)
- Runtime: Node 24 in agent containers. Our target: Node 20+. Compatible.
- ToS considerations: praktor uses Claude Agent SDK inside containers. Our charter requires CLI subprocess (ccs) due to Anthropic ToS (April 2026) for subscription accounts. Do NOT copy the Agent SDK import pattern.

## License Compatibility
- This repo: MIT
- Orch: MIT (planned)
- Compatible: Yes, unrestricted use and adaptation.

## Key Insights

1. Routing is the daemon only non-trivial logic. Praktor router.go is 80 lines implementing the full 3-tier chain. The key boundary: @prefix is O(1) string ops in daemon; AI classify is O(tokens) in a worker. Never cross that line. Implement as a pure TS function, test exhaustively, and treat as stable.

2. The @swarm topology syntax via Telegram is the standout design. The Synapse model -- directed/bidirectional graph edges mapping to execution semantics (pipeline/collaborative/fan-out) -- is the cleanest swarm design in any reference repo studied. The graph builder producing ordered ExecutionTier[] is the right abstraction. Worth borrowing verbatim for v2.

3. Container-per-agent vs subprocess-per-session is a design fork determined by persistence requirements, not technical preference. Praktor uses containers because personal AI agents need persistent filesystems across conversations. Orch workers already have project filesystems -- nothing to persist at orchestrator level. This justifies skipping Docker container lifecycle entirely. The complexity saved is enormous (container/, natsbus/, vault/, registry/ modules all avoided).

## Code Snippets Worth Studying Later
- internal/router/router.go lines 34-77: 3-tier routing function (port to TS for Orch router module)
- internal/swarm/types.go: Synapse, SwarmRequest, SwarmAgent types (data model for v2 swarm feature)
- internal/swarm/graph.go: BuildPlan() function signature (topological sort + tier assignment algorithm)
- agent-runner/src/index.ts lines 54-80: pre-warm pattern (WarmQuery, startup(), discard-on-session-change)
- ui/src/components/SwarmGraph.tsx: SVG graph editor for swarm topology (v2 Mission Control reference)
- ui/src/pages/: page inventory (Dashboard, Agents, Conversations, Tasks, Secrets, Swarms, UserProfile)
