# Model Routing

> Which model runs which role, and why. Inspired by ECC's `CLAUDE_CODE_SUBAGENT_MODEL` pattern + Gstack's role specialization + Anthropic's guidance on model selection.

Default: **Opus** for planning/review where depth matters; **Sonnet** for execution where the plan carries the reasoning.

---

## Roles × Models Table

| Role / subagent | Model | Why |
|---|---|---|
| `master-planner` | opus | Cross-cutting decomposition, critical-path identification, tradeoff reasoning |
| `sandwich-architect` | opus | API/interface design, signature decisions, test design |
| `sandwich-verifier` | opus | Adversarial whole-session review; needs deep pattern recognition |
| `systematic-debugger` | opus | Root-cause reasoning, architecture stop (Phase 4.5) |
| `sandwich-dev` | sonnet | Executes a detailed plan; plan carries the reasoning |
| `task-implementer` | sonnet | Per-task fresh-context execution; scope is narrow |
| `spec-compliance-reviewer` | sonnet | Contract matching against Part B — structured comparison, not deep reasoning |
| `code-quality-reviewer` | sonnet | Invariant grep + test quality audit — mostly pattern match |
| `research-scanner` | sonnet | Structured read + categorize (BORROW/SKIP/LEARN) |

---

## Session Types × Default Model

| Session type | Orchestrator | Default subagent | Exception |
|---|---|---|---|
| PLAN | opus | sonnet (researchers) | master-planner always opus |
| FOCUSED_IMPL | sonnet | sonnet | — |
| MULTI_TASK_IMPL | sonnet | sonnet (task-implementer, reviewers) | sandwich-architect if replan mid-session = opus |
| VERIFY | opus | sonnet (reviewers) | sandwich-verifier opus |
| RESEARCH | sonnet | sonnet | synthesis step = opus |
| RECOVERY | opus | sonnet | opus for the architecture stop |

---

## Why not all opus?

Cost + latency. Sonnet is sufficient for execution when:
- The plan is detailed at subtask level (signatures, tests)
- Fresh context isolates the agent from ambiguity
- Reviewers catch deviations

Opus for planning + review is where correctness depends on *synthesis*, not just execution.

## Why not all sonnet?

Planning at phase level requires tradeoff reasoning Sonnet is less reliable at. Adversarial review requires catching subtle patterns Opus is better at. Underspending on these two loses the whole downstream.

---

## Effort mode (thinking tokens)

Claude Code supports `MAX_THINKING_TOKENS` env or `thinking` headers for extended reasoning. Apply selectively:

| Role | Thinking budget | Reason |
|---|---|---|
| master-planner | high (8-16K) | Phase decomposition benefits from extended thinking |
| sandwich-verifier | high (8-16K) | Adversarial review benefits from slowing down |
| systematic-debugger | high (8-16K) | Hypothesis selection benefits from careful reasoning |
| sandwich-architect | medium (4-8K) | Task breakdown benefits but less than planner |
| All other (sonnet) | off or low | Execution doesn't need extended thinking |

---

## Overrides

Role authors can set `model:` in YAML frontmatter to override the default. Example:

```yaml
---
name: custom-reviewer
model: opus   # escalate from default sonnet because this reviewer touches invariants
tools: [...]
---
```

When overriding, document the reason in the agent's first section (`## Persona` typically).

---

## Cross-harness note

If running under Codex or other harnesses alongside Claude Code, model names may differ. This table assumes Anthropic models by default. For cross-model parallel work (e.g., independent bear-case review by Codex), the mapping is defined per-harness; see `AGENTS.md`.

---

## Verification

Run `/harness-audit agents` weekly:
- Every agent has explicit `model:` field (no missing → default opus — not acceptable)
- Model matches this table or documents the override
- Orchestrator dispatches with the declared model (Claude Code respects frontmatter `model:`)

A PR drifts this if it:
- Introduces an agent without `model:` frontmatter
- Escalates sonnet → opus without justification note
- Downgrades opus → sonnet for planning/review roles
