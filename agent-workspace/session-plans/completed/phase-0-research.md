# Phase 0 — Research & Verify

> **Session type**: RESEARCH (multiple sessions likely)
> **Goal**: Ground implementation decisions in concrete evidence from reference repos and primitive-level verification.
> **Estimated duration**: 1-2 autonomous days (split across several RESEARCH sessions)
> **Budget per session**: 60-120K tokens

---

## Phase Goal (Success Criteria)

Phase 0 is COMPLETE when ALL of these are true:

- [ ] All Tier A + Tier B reference repos cloned into `reference-repos/` (gitignored)
- [ ] One research note per repo in `agent-workspace/research/<repo-name>.md`
- [ ] `agent-workspace/research/SYNTHESIS.md` produced
- [ ] Primitive verification: Claude Code hooks roundtrip confirmed (document in `research/verification/hooks.md`)
- [ ] Primitive verification: `ccs + claude --resume` cross-account continuity confirmed OR limitations documented (in `research/verification/ccs-resume.md`)
- [ ] Primitive verification: OTEL traces streaming to local backend confirmed (in `research/verification/otel.md`)
- [ ] Primitive verification: Claude Code `-p` headless + `TRACEPARENT` propagation confirmed (in `research/verification/headless-trace.md`)
- [ ] Phase 1 master plan refined based on synthesis findings
- [ ] `current-execution.md` updated to Phase 1

---

## Task Breakdown

### Task 0.1: Scaffold Repo Structure (FOCUSED_IMPL)
**Session type**: FOCUSED_IMPL
**Budget**: 50K

- Create `.gitignore` (node_modules, dist, reference-repos, .env, ~/.orch, etc.)
- Create root `package.json` as pnpm workspace root
- Create `pnpm-workspace.yaml`
- Create `tsconfig.base.json` with strict settings
- Create `.nvmrc` with Node 20
- Create `LICENSE` (MIT)
- Create `README.md` (initial — will be refined in Phase 4)
- Commit? No. Stage only.

**Verify**: `ls` shows structure. `pnpm -v` confirms pnpm available. Don't run `pnpm install` yet (no deps yet).

### Task 0.2: Primitive Verification — Hooks Roundtrip (RESEARCH)
**Session type**: RESEARCH
**Budget**: 30K

1. Start a tiny HTTP server (Node `http` module, 20 lines) on port 4820 logging POST requests
2. Find an existing project with `.claude/settings.json` OR create throwaway test project
3. Add hook: `SessionEnd → curl http://localhost:4820/test`
4. Start a Claude Code session in test project, let it end
5. Confirm HTTP server received the POST
6. Document what payload Claude Code actually sends (field by field)
7. Write `agent-workspace/research/verification/hooks.md`

**Success**: Payload structure documented with example JSON.

### Task 0.3: Primitive Verification — ccs + Resume (RESEARCH)
**Session type**: RESEARCH
**Budget**: 30K

1. With `ccs` configured for at least 2 Claude accounts:
   - Start a session on profile A: `ccs <A> -p "remember the number 42"`
   - Note the session ID (from ~/.claude/sessions or OTEL if enabled)
   - Exhaust profile A quota OR simulate switch by ending session
   - Resume on profile B: `ccs <B> --resume <session-id> "what number did I tell you?"`
2. Observe:
   - Does it remember "42"?
   - Any error/warning?
   - Token usage reset or continued?
3. Document findings in `agent-workspace/research/verification/ccs-resume.md`
4. If continuity broken: document workaround (maybe re-inject summary prompt)

**Success**: Clear yes/no on cross-account resume, with workaround if needed.

**Note**: If user can't test this locally (no second account), document AS ASSUMPTIONS and flag for user verification. Do NOT block Phase 1 on this.

### Task 0.4: Primitive Verification — OTEL End-to-End (RESEARCH)
**Session type**: RESEARCH
**Budget**: 40K

1. Deploy Langfuse self-hosted via docker-compose (reference: Langfuse docs)
   - Alternative: SigNoz if Langfuse has issues
2. Set env vars in `~/.claude/settings.json`:
   ```json
   "env": {
     "CLAUDE_CODE_ENABLE_TELEMETRY": "1",
     "OTEL_METRICS_EXPORTER": "otlp",
     "OTEL_LOGS_EXPORTER": "otlp",
     "OTEL_TRACES_EXPORTER": "otlp",
     "OTEL_EXPORTER_OTLP_PROTOCOL": "grpc",
     "OTEL_EXPORTER_OTLP_ENDPOINT": "http://localhost:4317"
   }
   ```
3. Run a sample Claude Code session
4. Verify traces appear in Langfuse UI
5. Document: what spans appear, what attributes, cost attribution visible?
6. Write `agent-workspace/research/verification/otel.md`

**Success**: Screenshot of traces in backend (saved to `research/verification/otel-screenshots/` if possible, else described in markdown). Span names and key attributes documented.

### Task 0.5: Primitive Verification — Headless + TRACEPARENT (RESEARCH)
**Session type**: RESEARCH
**Budget**: 25K

1. Write tiny Node script that:
   - Generates a TRACEPARENT
   - Spawns `claude -p "say hi"` with env including the TRACEPARENT
2. Verify in OTEL backend that Claude Code's spans are children of the generated trace context
3. Document the TRACEPARENT format Claude Code accepts
4. Write `agent-workspace/research/verification/headless-trace.md`

**Success**: Trace hierarchy confirmed — parent (our script) → children (Claude Code interaction + tool calls).

### Task 0.6: Study Tier A Repos (RESEARCH)
**Session type**: RESEARCH
**Budget**: 90K (3 repos × ~25K each + synthesis overhead)

Clone and study (per `research-protocol.md`):

- `NachoSEO/claudegram` → `research/claudegram.md`
- `op7418/Claude-to-IM` → `research/claude-to-im.md`
- `hoangsonww/Claude-Code-Agent-Monitor` → `research/claude-code-agent-monitor.md`

**Clone command template**:
```bash
mkdir -p reference-repos
cd reference-repos
git clone --depth 1 https://github.com/NachoSEO/claudegram.git
git clone --depth 1 https://github.com/op7418/Claude-to-IM.git
git clone --depth 1 https://github.com/hoangsonww/Claude-Code-Agent-Monitor.git
```

For EACH repo follow the output template in `research-protocol.md`.

**Verify**: 3 markdown files created, each has all sections filled. Each explicitly states what we borrow, what we skip, license check.

### Task 0.7: Study Tier B Repos (RESEARCH)
**Session type**: RESEARCH
**Budget**: 40K (2 repos, lighter scan)

- `mtzanidakis/praktor` → `research/praktor.md` (architecture focus, skip Go code)
- `RichardAtCT/claude-code-telegram` → `research/claude-code-telegram.md` (feature scope, skip Python details)

### Task 0.8: Study Tier C Repos (RESEARCH)
**Session type**: RESEARCH
**Budget**: 40K (4 repos, quick scan each)

- `qwibitai/nanoclaw` → `research/nanoclaw.md`
- `kaitranntt/ccs` → `research/ccs.md` (dependency understanding, CLI surface)
- `tradchenko/claude-sessions` → `research/claude-sessions.md`
- `dlupiak/claude-session-dashboard` → `research/claude-session-dashboard.md`

### Task 0.9: Clone OTEL Reference
**Session type**: RESEARCH
**Budget**: 10K

- `ColeMurray/claude-code-otel` → extract docker-compose and OTEL Collector config → save to `research/otel-config-reference/`

### Task 0.10: Synthesis (RESEARCH)
**Session type**: RESEARCH
**Budget**: 40K

Produce `agent-workspace/research/SYNTHESIS.md` combining all findings. Follow the synthesis template in `research-protocol.md`.

Specifically:
- Recommended skeleton source (likely claudegram, adapted for CLI subprocess)
- Architecture decisions informed by research
- Feature priority (MUST / SHOULD / NICE / OUT OF SCOPE)
- Patterns adopted + rejected
- Open questions for Phase 1

### Task 0.11: Refine Phase 1 Master Plan
**Session type**: PLAN
**Budget**: 50K

Based on synthesis, update `agent-workspace/session-plans/pending/phase-1-core.md`:
- Confirm task list
- Adjust budget estimates
- Add "inspired by / borrowed from" notes linking research
- Identify first 3 tasks to execute

### Task 0.12: Phase 0 Complete
**Session type**: (housekeeping, ~5K budget)

- Verify all Phase 0 success criteria met
- Write `agent-workspace/memory/phase-0-complete.md` with evidence summary
- Update `current-execution.md`: Phase → 1
- Move `session-plans/pending/phase-0-research.md` → `session-plans/completed/`
- Ready to begin Phase 1

---

## Dependencies

- Network access for `git clone` (allowlist includes github.com)
- Docker available for OTEL backend (optional — document assumption if skipping)
- Claude Code CLI available (`claude --version`)
- ccs available (`ccs --version`)

If any dependency missing → STOP-2 (Environment Error).

---

## Risks

- **Risk**: Anthropic ToS change during research → adapt plan (CLI subprocess path already compliant)
- **Risk**: Reference repo moved/deleted → try fork or skip that repo, document in research
- **Risk**: OTEL setup takes much longer than expected → timebox to 2 hours, if still broken, document limitations and continue (can retry in Phase 3)
- **Risk**: ccs + resume continuity doesn't work → document workaround (re-inject summary), don't block Phase 1

---

## Deliverables Checklist

When Phase 0 is complete:

- [ ] `reference-repos/` contains all cloned repos (gitignored)
- [ ] `agent-workspace/research/claudegram.md`
- [ ] `agent-workspace/research/claude-to-im.md`
- [ ] `agent-workspace/research/claude-code-agent-monitor.md`
- [ ] `agent-workspace/research/praktor.md`
- [ ] `agent-workspace/research/claude-code-telegram.md`
- [ ] `agent-workspace/research/nanoclaw.md`
- [ ] `agent-workspace/research/ccs.md`
- [ ] `agent-workspace/research/claude-sessions.md`
- [ ] `agent-workspace/research/claude-session-dashboard.md`
- [ ] `agent-workspace/research/otel-config-reference/`
- [ ] `agent-workspace/research/verification/hooks.md`
- [ ] `agent-workspace/research/verification/ccs-resume.md`
- [ ] `agent-workspace/research/verification/otel.md`
- [ ] `agent-workspace/research/verification/headless-trace.md`
- [ ] `agent-workspace/research/SYNTHESIS.md`
- [ ] `agent-workspace/session-plans/pending/phase-1-core.md` refined
- [ ] `agent-workspace/memory/phase-0-complete.md` written
- [ ] `agent-workspace/memory/current-execution.md` updated to Phase 1
