# Research Protocol

> How to study reference repos systematically in Phase 0. Prevents "going down rabbit holes" and ensures consistent extraction of useful patterns.

---

## Goal of Research Phase

Produce, for each reference repo, a markdown note in `agent-workspace/research/<repo-name>.md` that answers:

1. **What it does** (1 paragraph)
2. **Architecture at a glance** (diagram or bullet list)
3. **What we borrow** (specific files/patterns + rationale)
4. **What we skip** (and why)
5. **Stack compatibility** (language, runtime, ToS)
6. **License** (MIT? Apache? GPL?)
7. **Key insights** (1-3 bullets, non-obvious learnings)

---

## How to Not Waste Tokens

### DO
- Scan `README.md` first
- List top-level directories (`ls`)
- Read `package.json` (or equivalent) for dependencies
- Read the main entry point (`src/main.ts`, `src/index.ts`)
- Read ONE feature module fully to understand patterns
- Read `CLAUDE.md` or `AGENTS.md` if present
- Check `LICENSE`
- Note any interesting architectural docs in `docs/`

### DO NOT
- Read every file
- Re-read files you already understood
- Open generated code, compiled output, lock files
- Get distracted by interesting but irrelevant features
- Clone enormous repos fully if only a subset is relevant (use sparse checkout)

### Time/Token Budget per Repo

| Repo Size | Approach | Token Budget |
|---|---|---|
| Small (< 20 files) | Read all | ~8-15K |
| Medium (20-100 files) | Structural scan + 1-2 deep reads | ~15-25K |
| Large (> 100 files) | README + architecture doc + 1 feature module | ~15-30K |

Anything over 40K for a single repo = you're going too deep.

---

## Target Repos for Orch Phase 0

In priority order:

### Tier A (Must study — deep relevance)

**1. NachoSEO/claudegram** (TypeScript + Grammy)
- Why: Closest stack match. Likely skeleton source.
- Focus: `src/bot/`, `src/claude/session-manager.ts`, `src/claude/request-queue.ts`, `src/claude/agent-watchdog.ts`
- Budget: 25K
- Key questions:
  - How do they manage Claude Agent SDK sessions?
  - How does request-queue handle concurrent Telegram messages?
  - How does agent-watchdog detect stuck sessions?
  - Can we adapt their pattern to CLI subprocess instead of SDK?

**2. op7418/Claude-to-IM** (TypeScript library)
- Why: DI-based bridge abstraction — reusability pattern we want.
- Focus: `src/lib/bridge/context.ts` (DI), `src/lib/bridge/host.ts` (interfaces), `src/lib/bridge/bridge-manager.ts` (orchestrator)
- Budget: 20K
- Key questions:
  - How do they abstract storage (BridgeStore) with 30 methods?
  - What's their session lock mechanism for multi-process safety?
  - Is their channel-adapter pattern useful for our Telegram/Web UI separation?

**3. hoangsonww/Claude-Code-Agent-Monitor** (Node + React + WebSockets)
- Why: Claude Code hooks → dashboard pattern is exactly what we need.
- Focus: hook receiver HTTP handler, WebSocket broadcast, React dashboard layout
- Budget: 20K
- Key questions:
  - How do they deduplicate hook events?
  - What's the state machine from hook events?
  - How does WebSocket auto-reconnect?
  - What Dashboard views are most useful?

### Tier B (Should study — architectural reference)

**4. mtzanidakis/praktor** (Go binary)
- Why: Most complete orchestration architecture. Swarms, routing, dashboard.
- Focus: `README.md` architecture diagram, agent container lifecycle, Mission Control UI layout, `/commands`
- Budget: 15K (architecture only, code is Go — not copied)
- Key questions:
  - How is routing done (AI routing vs prefix routing)?
  - What Telegram commands are most useful?
  - What does Mission Control show (kanban? graphs?)?
  - Is their swarm concept worth adopting in v2?

**5. RichardAtCT/claude-code-telegram** (Python, but reference)
- Why: Feature-complete scope check. Tells us what features users want.
- Focus: `CLAUDE.md`, commands list, project-registry pattern, event bus
- Budget: 15K (scope reference, not code copy)
- Key questions:
  - What does MessageOrchestrator route?
  - How does APScheduler integrate for cron?
  - What security layers (auth, rate limit, audit) do they have?
  - Multi-project pattern — is it similar to ours?

### Tier C (Quick scan — pattern check)

**6. qwibitai/nanoclaw** (TypeScript)
- Why: Small enough to understand. Channel → SQLite → Container pattern.
- Budget: 15K
- Key questions:
  - How does group-queue + global-concurrency-limit work?
  - Container runner pattern: useful for us?
  - Skill-based customization: how does it integrate?

**7. kaitranntt/ccs** (TypeScript — our dependency)
- Why: Understand its CLI surface, not to copy.
- Focus: `README.md` commands, env var handling (`CLAUDECODE` stripping), `--resume` and account switching behavior
- Budget: 8K
- Key questions:
  - How to invoke `ccs` programmatically?
  - What does `--target droid` mean — is it relevant for us?
  - How does cross-profile continuity work (`CLAUDE_CONFIG_DIR`)?
  - Exit codes for rate limit / account switch?

**8. tradchenko/claude-sessions** (TypeScript CLI)
- Why: Session memory extraction pattern.
- Budget: 8K
- Only if Phase 3 intelligence phase needs memory extraction; skip if tight.

**9. dlupiak/claude-session-dashboard** (Node)
- Why: Minimal passive observability. Compare to our active approach.
- Budget: 5K
- Quick scan only.

**10. ColeMurray/claude-code-otel** (Config repo)
- Why: OTEL docker-compose reference.
- Budget: 5K
- Just grab the compose file structure.

### Tier D (Context — skip unless time allows)

- `TechNickAI/claude_telemetry` — wrapper pattern, may inspire CLI invocation
- `vibe-kanban` — dashboard UX reference (commercial product `Nimbalyst` also)
- `SpillwaveSolutions/parallel-worktrees` — worktree pattern (Phase 3+ only)
- `ComposioHQ/agent-orchestrator` — reactions pattern for CI/PR integration (Phase 3+)

---

## Research Output Template

`agent-workspace/research/<repo-name>.md`:

```markdown
# Research Notes: <repo-name>

**URL**: https://github.com/<owner>/<repo>
**Stack**: <language + key frameworks>
**License**: <MIT/Apache/etc>
**Last commit at time of research**: <date>
**Stars**: <count>

## What It Does
<1 paragraph>

## Architecture at a Glance
<Bullet list or ASCII diagram of layers/modules>

## What We Borrow

### <Pattern/File 1>
- Location: `path/to/file.ts`
- Why: <why it fits Orch>
- Adaptation needed: <e.g., swap Agent SDK for CLI subprocess>
- Estimated effort: <low/medium/high>

### <Pattern/File 2>
...

## What We Skip

### <Thing skipped>
- Reason: <why not relevant>

## Stack Compatibility
- Language: <match? port? incompatible?>
- Runtime: <Node version etc.>
- ToS considerations: <any concerns>

## License Compatibility
- Orch license: MIT/Apache 2.0
- This repo license: <MIT/etc>
- Compatible? <Yes/No + notes>

## Key Insights
1. <non-obvious learning 1>
2. <non-obvious learning 2>
3. <non-obvious learning 3>

## Code Snippets Worth Studying Later
<Pointers to specific files, not full copies>
```

---

## Synthesis Step

After all repos studied, write `agent-workspace/research/SYNTHESIS.md`:

```markdown
# Research Synthesis

## Recommended Skeleton Source
<Which repo to borrow the initial structure from, usually claudegram>

## Architecture Decisions Informed by Research

### D1: <decision>
- Informed by: <repo X pattern Y>
- Rationale: ...

### D2: ...

## Feature Priority (based on what reference repos included)

MUST HAVE (Phase 1):
- <features that all reference repos agree on>

SHOULD HAVE (Phase 2):
- <features most reference repos have>

NICE TO HAVE (Phase 3+):
- <features only some have, useful but not essential>

OUT OF SCOPE (explicitly rejected):
- <features we actively avoid>

## Patterns Adopted
1. <Pattern from repo X>: we'll use it in module Y
2. ...

## Patterns Rejected
1. <Pattern>: rejected because <reason tied to charter>
2. ...

## Open Questions for Implementation
(Things we know we need to figure out during Phase 1)
1. ...
2. ...
```

---

## Anti-Patterns to Avoid

- **Scope creep**: "Ooh, this repo has a voice transcription feature, let me note that." — not relevant to Orch. Skip.
- **Code copying without understanding**: quoting code without explaining why in your notes
- **Endless deep reads**: going 5 levels deep into someone's implementation details
- **License ignored**: make sure to note license every time
- **No extraction**: "nice repo, moving on" — every repo MUST produce concrete borrow/skip decisions

---

## Rules of Engagement for Cloning

1. Clone into `reference-repos/` (gitignored). Never commit reference repos.
2. Use `--depth 1` to save time: `git clone --depth 1 <url>`
3. For very large repos, use sparse checkout to clone only a subset
4. Never modify cloned repos. If you need to experiment, copy files out to `/tmp`.
5. Track cloned repos in `agent-workspace/research/_cloned.md` with URL, commit hash, date.
