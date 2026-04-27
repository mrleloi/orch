# Research Note: claude-session-dashboard

**Repo**: https://github.com/dlupiak/claude-session-dashboard
**Tier**: C (minimal passive observability reference)
**Date scanned**: 2026-04-24
**License**: MIT
**Language**: TypeScript (Node.js 20+)
**Stack**: TanStack Start (SSR/Vite), TanStack Router (file-based), TanStack React Query, Tailwind CSS v4, Recharts, Zod

---

## 1. What It Does

Read-only local observability dashboard for Claude Code sessions. Reads `~/.claude/**` JSONL files
directly — no webhook, no daemon, no hook injection. Parses session transcripts on demand, caches
by mtime, and renders a browser UI on localhost. No data leaves the machine.

---

## 2. Architecture at a Glance

```
~/.claude/projects/<project>/<sessionId>.jsonl
~/.claude/projects/<project>/<sessionId>/subagents/agent-<id>.jsonl
~/.claude/stats-cache.json
        |
        v
lib/scanner/
  session-scanner.ts   -- fs.stat + mtime cache, polls by HTTP request
  active-detector.ts   -- mtime < 2min + lock dir existence
  project-scanner.ts   -- readdir ~/.claude/projects/
lib/parsers/
  session-parser.ts    -- readline, head+tail 15 lines for summary; full stream for detail
  subagent-discovery.ts -- scans <sessionDir>/subagents/ then /agents/ for agent-*.jsonl
  stats-parser.ts      -- reads stats-cache.json (precomputed by claude CLI)
        |
        v
Server Functions (createServerFn / TanStack Start SSR)
        |
        v
React Query + UI components
```

Data flow is **pull-only** (HTTP request → fs read → response). No file watchers. No push events.
Active session polling at 3-second intervals via React Query `refetchInterval`.

---

## 3. What We Borrow

### BORROW: Active-session detection heuristic
`apps/web/src/lib/scanner/active-detector.ts` — two-signal check:
1. JSONL file mtime within last 120 seconds
2. Lock directory exists at `<projectDir>/<sessionId>/` (no .jsonl extension)

This is the documented Claude Code session liveness signal. We should use the same logic in Orch's
session-tracker service rather than inventing our own.

### BORROW: JSONL field schema (RawJsonlMessage interface)
`apps/web/src/lib/parsers/types.ts` lines 200-277 — exhaustive typed shape of Claude Code JSONL
messages. Key facts:
- `type`: user | assistant | system | progress | file-history-snapshot
- `message.usage`: input_tokens, output_tokens, cache_read/creation tokens
- `toolUseResult.totalTokens`, `totalToolUseCount`, `totalDurationMs`, `agentId` — subagent result envelope
- `parentToolUseID` — links subagent result back to parent tool call
- `type === 'queue-operation'` identifies non-interactive (subagent-spawned) sessions
- Note in types.ts (line 203-208): behavior changed at CLI v2.1.68. Before: agent dispatch via "Task" tool
  + progress messages. After: "Agent" tool, no progress messages — subagent files are the only source.

### LEARN: Head+tail parse for summaries
`session-parser.ts` reads only first 15 and last 15 lines for the session list view, full stream
for detail. Good pattern for keeping the summary scan fast on large (500MB+) JSONL files.

### LEARN: Subagent file discovery
`subagent-discovery.ts` — checks `<sessionDir>/subagents/` then `<sessionDir>/agents/` fallback.
Pattern: `agent-<id>.jsonl`. Relevant if Orch ever needs to correlate subagent output back to a
parent session without hooks.

---

## 4. What We Skip

### SKIP: Entire UI layer
TanStack Start, Recharts, Gantt chart, stats views — out of scope for Orch's active approach.
Orch has its own React+Vite web UI; no need to borrow UI patterns from here.

### SKIP: Stats-cache reader
`stats-parser.ts` reads `~/.claude/stats-cache.json` which Claude CLI writes. Orch collects
metrics via hooks → HTTP receiver, not from a stale precomputed cache.

### SKIP: Project scanner for session discovery
Orch knows which sessions it spawned (tracks them in Prisma). It does not need to scan the whole
`~/.claude/projects/` tree.

### SKIP: CSV/JSON export, privacy mode, contribution heatmap
Pure UI/analytics features irrelevant to orchestration.

---

## 5. Stack Compatibility

- TypeScript: compatible
- Node.js fs/readline: compatible, we use the same
- TanStack/Recharts: not imported into Orch
- No Anthropic SDK usage in this repo (pure file reading)

---

## 6. License

MIT — no restrictions on borrowing patterns or types.

---

## 7. Key Insights

1. **This is 100% passive (pull-only) — opposite of Orch's approach.** It never receives a hook;
   it polls filesystem. Orch's active approach (hooks → HTTP POST receiver) is strictly better for
   real-time daemon use: no polling delay, no missed events between polls, no mtime race. The
   passive approach suits a local UI viewer; the active approach suits a daemon. No design change
   needed for Orch.

2. **The JSONL schema changed at CLI v2.1.68** (Task tool → Agent tool, progress messages dropped
   for subagents). Any parser Orch writes for JSONL must handle both variants. The `RawJsonlMessage`
   type in this repo already handles both — worth borrowing as a reference schema.

3. **The lock directory trick for liveness detection is the cleanest signal available.** Mtime
   alone can lie (background tool writes). Mtime + lock dir is a two-factor check that matches what
   Claude CLI actually does. Orch should use this same dual check in its session-tracker if it ever
   needs to detect orphaned sessions without a hook event.

---

## Verdict

Overall: **LEARN** — not a primary borrowing source, but the JSONL type schema and liveness
heuristic are directly reusable reference material. No behavioral or design changes to Orch's
active architecture.
