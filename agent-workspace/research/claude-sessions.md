# Research Notes: claude-sessions

**URL**: https://github.com/tradchenko/claude-sessions
**Stack**: TypeScript, Node.js 18+, zero runtime dependencies (compiled to plain JS)
**License**: MIT
**Last commit at time of research**: 2026 (v2.4.0)
**Stars**: not recorded

---

## What It Does

Multi-agent session manager TUI that unifies Claude Code, Codex, Qwen, and Gemini CLI sessions in a single picker. Its secondary system — which is the part relevant to Orch — is a structured memory pipeline: L0 (regex-based instant extraction from JSONL), L1 (LLM-driven structured extraction using any available CLI), and L2 (original file reference). Memories are stored in a shared JSON index with hotness scoring and deduplicated across agents and projects.

---

## Architecture at a Glance

```
src/
  cli.ts                  CLI entry point
  sessions/
    loader.ts             Unified session loading (all agents via adapter registry)
    cache.ts              Sub-second startup cache
    lazy-extract.ts       Background L0+L1 trigger on discovery
  memory/
    types.ts              L0Data, MemoryEntry, MemoryIndex, MemoryCandidate typedefs
    extract-l0.ts         Regex-based JSONL parser → L0Data (instant, no LLM)
    extract-l0-multi.ts   Multi-agent variant
    extract-l1.ts         LLM extraction: builds prompt, calls CLI, parses JSON response
    snapshot.ts           first-15 + last-35 message markdown snapshot (crash recovery)
    hotness.ts            recency*0.3 + frequency*0.4 + relevance*0.3 scoring
    dedup.ts              Fuzzy dedup of LLM-generated memories
    catalog.ts            Memory catalog CRUD
    index.ts              index.json read/write with file locking
    config.ts             Config for max memories, hotness threshold, etc.
  agents/
    registry.ts           Active adapter registry (Claude/Codex/Qwen/Gemini/Companion)
    claude.ts             Claude-specific adapter
  hooks/                  Stop/SessionStart hook handlers
  mcp/                    MCP server exposing memory-recall, memory-save, save-snapshot tools
  commands/               CLI subcommands (install, extract-memory, cleanup, restore, etc.)
```

---

## What We Borrow

### BORROW: L0Data type shape and JSONL parse pattern

- Location: `src/memory/types.ts` (L0Data), `src/memory/extract-l0.ts` (extractL0FromJSONL)
- Why: Directly answers "what do we extract from a Claude session JSONL for a handoff seed?" The fields — `summary`, `files`, `commands`, `errors`, `failures`, `next_step`, `decisions`, `git_status` — map almost exactly to what Orch's handoff-builder needs to seed session N+1.
- Adaptation needed: Strip multi-agent complexity; Orch only handles Claude Code JSONL. Keep the `ChatMessage[]` → `L0Data` pipeline as-is.
- Estimated effort: Low (essentially a copy + prune)

### BORROW: L1 extraction prompt template

- Location: `src/memory/extract-l1.ts`, function `buildExtractionPrompt` (lines 33-64)
- Why: Six-category schema (profile, preferences, entities, events, cases, patterns) with explicit instruction to extract FAILED approaches and DECISIONS with reasoning. This is the exact signal Orch's handoff-builder must surface so session N+1 doesn't retry the same dead ends.
- Adaptation needed: Orch does not need a shared memory index. Strip catalog/dedup/hotness; just produce the JSON array as the handoff seed object. Wrap in our own `HandoffBuilder.extractL1(session)` service.
- Estimated effort: Low (prompt text is ready; caller code is ~30 lines)

### BORROW: Snapshot strategy (first-15 + last-35)

- Location: `src/memory/snapshot.ts`, constants HEAD_COUNT=15, TAIL_COUNT=35
- Why: Proven windowing for long sessions. Avoids token blowup when feeding full history to LLM. Orch should adopt the same window for handoff context generation.
- Adaptation needed: None in concept; implement same constants in our `HandoffBuilder`.
- Estimated effort: Trivial

---

## What We Skip

### SKIP: Shared memory index (index.json, hotness, dedup, catalog)

- Why: Orch does not need a persistent cross-session memory pool. Handoff is point-to-point (session N → seed for session N+1 in the same project). The full hotness/dedup/catalog stack adds ~400 lines of infra we don't need.

### SKIP: Multi-agent adapter registry (agents/ directory)

- Why: Orch only manages Claude Code subprocesses. Codex/Qwen/Gemini adapters are irrelevant. The session loader pattern is useful conceptually but our session loading is already handled by the daemon watching Claude's JSONL file directly.

### SKIP: TUI picker, MCP server, i18n

- Why: None of these serve Orch. We have Telegram + Web UI. MCP server pattern noted but Orch exposes no MCP surface in Phase 3.

### SKIP: Snapshot restore flow (cs restore command)

- Why: Orch doesn't need session restoration from snapshot. If a session JSONL is lost, the daemon re-spawns a fresh session with the handoff seed. Snapshot as a fallback for the picker is not relevant to us.

---

## Stack Compatibility

- TypeScript, Node 18+ — identical to our stack.
- Zero runtime dependencies at runtime (all dev deps). This means we can lift individual functions without pulling in the whole package as a dep.
- No Agent SDK anywhere — uses execFileSync to call `claude`/`codex`/etc. CLI directly. Consistent with Orch's CLI-subprocess rule.

---

## License

MIT — full borrow rights, no attribution requirement beyond license file.

---

## Key Insights

1. **L0 is pure regex, zero LLM cost.** `extractL0FromJSONL` runs in microseconds and yields files, commands, errors, failures, next_step — all without an LLM call. Orch can run L0 synchronously inside the Stop hook handler; L1 (LLM) fires in background.

2. **The six-category L1 prompt is the real value.** The extraction prompt's explicit emphasis on FAILED APPROACHES ("prevents wasting time retrying") is the killer feature for Orch handoff-builder. This is non-obvious and we would not have invented it from scratch.

3. **First-15 + last-35 windowing is a solved problem.** Long sessions have irrelevant middle exchanges. This window captures intent (first messages) and final state (last messages) within ~50 messages. Use it verbatim.

---

## Verdict

BORROW — three concrete artifacts: L0Data type + extractL0FromJSONL, L1 prompt template, 15+35 window constants. All are small, well-typed, MIT-licensed, and solve exactly Phase 3's handoff-builder need without dragging in unwanted infra.
