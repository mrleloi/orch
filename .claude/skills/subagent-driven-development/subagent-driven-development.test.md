# subagent-driven-development self-test

## Trigger

Session plan exists with 3+ tasks; OR session_type=MULTI_TASK_IMPL; OR FOCUSED_IMPL where
tasks touch independent modules. Invoked even at 1% chance of applicability. Not optional,
not rationalizable away.

## Expected Behavior

Skill activates → orchestrator dispatches one task-implementer per task with
`run_in_background=true`. Each implementer is followed by spec-compliance-reviewer then
code-quality-reviewer (two-stage gate, fresh context each). Orchestrator transcript contains
ONLY `Agent` and `Read` tool_uses — no code writing in the main session.

## Failure Modes

- F1: all tasks executed in one subagent ("easier to just do all tasks together") — context
  pollution across task boundaries; implementer assumptions bleed between tasks
- F2: two-stage review collapsed to one ("redundant because I already checked") — same-agent
  echo chamber; implementer's bias goes unchallenged
- F3: orchestrator (main session) writes code instead of dispatching only — violates the
  hard rule "Orchestrator does not write code"; `Edit`/`Write` in main transcript

## Metrics

- activation_count_per_session: 0-1 (binary per session)
- success_rate: TBD (Phase 5.5)
- token_cost_p50: TBD (Phase 5.5)
- duration_ms_p50: TBD (Phase 5.5)

## Assertions

1. For every session_type=MULTI_TASK_IMPL with N tasks, transcript shows >=N
   task-implementer Agent tool_uses each containing `run_in_background=true`
   (grep transcript JSONL for `tool_name=Agent` AND `run_in_background` count >= N).
2. For every task-implementer dispatch returning verdict=DONE, exactly one
   spec-compliance-reviewer dispatch follows AND exactly one code-quality-reviewer
   dispatch follows before the next task-implementer is invoked (two-stage gate order
   audit over transcript JSONL tool_use sequence).
3. NO `Edit` or `Write` tool_use occurs in the orchestrator (main) transcript during
   a MULTI_TASK_IMPL session — only `Agent` and `Read` are permitted (grep transcript
   JSONL `tool_name` values; any `Edit`/`Write` hit is a violation of the
   orchestrator-as-dispatcher invariant).
