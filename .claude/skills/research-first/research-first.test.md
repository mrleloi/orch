# research-first — Sibling Self-Test

## Trigger

- About to Edit/Write code integrating with an external dependency not represented in `packages/*`
- Adding a library to `package.json` (dependencies or devDependencies)
- Designing a subprocess or hook contract without a clear precedent in `agent-workspace/research/`
- User asks "how should we do X" where X touches external behavior or an unfamiliar library

## Expected Behavior

Skill blocks Edit/Write tool_use. Agent opens official docs via WebFetch or context7 MCP.
Agent writes `agent-workspace/research/<topic>.md` covering version, API shape, known issues,
and integration decision. Integration file starts with `// Research: agent-workspace/research/<topic>.md`.

## Failure Modes

- F1: Edit/Write tool_use fires before `agent-workspace/research/<topic>.md` exists (Block condition violation)
- F2: Stale-memory rationalization accepted ("I remember how this library works") instead of opening docs
- F3: Research file written but no `// Research: agent-workspace/research/<topic>.md` comment at top of
  integration file (Step 5 violation)

## Metrics

- activation_count_per_session: 0-2
- success_rate: TBD (Phase 5.5)
- token_cost_p50: TBD (Phase 5.5)
- duration_ms_p50: TBD (Phase 5.5)

## Assertions

1. For every PR touching a `package.json` `dependencies` add, `agent-workspace/research/` contains a
   matching topic file: `grep -r "<dep-name>" agent-workspace/research/` must return at least one hit.
2. When `component_name=research-first` `outcome=ok` appears in `component-telemetry.jsonl`, the next
   Edit/Write within the session targets a file whose top-of-file contains
   `// Research: agent-workspace/research/` (grep transcript JSONL for the Edit/Write tool_use path,
   then confirm the file starts with the comment).
3. NO `Edit` or `Write` tool_use precedes the first `WebFetch` or `Read` of a path under `research/`
   in any session transcript that activated this skill (audit by scanning tool_use ordering in the
   session's transcript JSONL for the skill activation window).
