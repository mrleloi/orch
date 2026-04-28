---
name: observation-file-write-on-return
description: Use after every reviewer subagent (spec-compliance, code-quality, sandwich-verifier) returns. If the subagent returned inline-only without writing the canonical observations/<task>-<date>-<role>.md file, the orchestrator MUST persist the verdict before dispatching the next substage.
allowed-tools: [Write]
archetype: discipline
model: sonnet
---

# Observation File Write On Return

## When to invoke

Triggers immediately after a reviewer subagent (spec-compliance-reviewer, code-quality-reviewer, sandwich-verifier) returns its verdict to the orchestrator. The skill checks:

1. Does the canonical observation file exist on disk?
   - Pattern: `agent-workspace/memory/observations/task-<id>-<YYYYMMDD>-<role>.md`
   - Where `<role>` ∈ `{spec-compliance, code-quality, sandwich-verifier}`
2. If NO → orchestrator MUST persist the inline-returned verdict via `Write` before proceeding to the next substage.
3. If YES → no action; the subagent honored its contract.

## How to apply

The reviewer agent contract (post-v2.6) requires the subagent itself to write the file via its `Write` tool. This skill is the orchestrator-side safety net for cases where:

- Subagent runs out of context budget before reaching its Write phase.
- Subagent's tool permissions are denied at runtime (rare; observed in early v2.6).
- Reviewer returns through an early-stop path (e.g., trivial APPROVED verdict) and skips its own write.

The orchestrator extracts the inline-returned YAML/markdown verdict and writes it to the canonical path with one extra line: `> Persisted by orchestrator (skill: observation-file-write-on-return) on <ISO timestamp> after subagent returned inline-only.`

## Anti-patterns

- DO NOT skip the file-existence check on the assumption that the subagent honored its contract — every v2.5 reviewer subagent that returned inline-only triggered this CF.
- DO NOT modify the inline verdict content; copy verbatim and add only the orchestrator-persistence note.
- DO NOT use this skill to substitute for the subagent's own write when the subagent has runtime budget — let the subagent do its job; only intervene on miss.
- DO NOT broaden the canonical path pattern; reviewer-role subagents have a single, deterministic naming scheme.

## Canonical paths (post-v2.6)

| Reviewer role | Canonical path |
|---|---|
| spec-compliance-reviewer | `agent-workspace/memory/observations/task-<id>-<YYYYMMDD>-spec-compliance.md` |
| code-quality-reviewer | `agent-workspace/memory/observations/task-<id>-<YYYYMMDD>-code-quality.md` |
| sandwich-verifier | `agent-workspace/memory/observations/task-<id>-<YYYYMMDD>-sandwich-verifier.md` |

## Provenance

Authored in Phase 11 substage 11.2 (v2.6) to close `CF-V2.6-AUDIT-TRAIL-INLINE-RETURN-PATTERN`. Source finding: `agent-workspace/memory/observations/task-10.5-20260428-sandwich-verifier.md`.
