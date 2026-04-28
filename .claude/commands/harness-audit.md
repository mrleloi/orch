---
name: harness-audit
description: Use weekly or after adding/removing agents to audit the harness — subagents, skills, commands, hooks, constitution. Scores A-F and flags drift.
allowed-tools: [Read, Bash, Grep, Glob]
---

# /harness-audit — Reflexive Harness Self-Assessment

## Purpose

Audits the Claude Code harness for drift, orphans, and misconfigurations. Run weekly, after adding/removing agents or skills, or when sessions feel "wrong."

Input: optional `$ARGUMENTS` — a specific area (`agents`, `skills`, `commands`, `hooks`, `constitution`, `all` default).

## Process

### Step 1: Read inventory

```bash
ls .claude/agents/
ls .claude/skills/
ls .claude/commands/
ls agent-workspace/constitution/
```

### Step 2: Grep session usage (orphan detection)

```bash
grep -l "<agent-or-skill-name>" agent-workspace/memory/sessions/*.md | wc -l
```

If 0 over last 10 sessions → flag as orphan candidate.

### Step 3: Compute scorecard

| Category | Check | Score |
|---|---|---|
| Agents — frontmatter complete | N of N | A/B/C/D/F |
| Agents — spawned handling | N of N | A/B/C/D/F |
| Agents — model explicit | N of N | A/B/C/D/F |
| Agents — orphan rate | N orphans / N total | A/B/C/D/F |
| Skills — description discipline | N of N | A/B/C/D/F |
| Skills — rationalization counters (for discipline skills) | N of N | A/B/C/D/F |
| Commands — spawned handling | N of N | A/B/C/D/F |
| Hooks — profile declared | yes/no | A/F |
| Constitution — invariant rationalization | N of critical I-* | A/B/C/D/F |

Scoring: A = 100%, B = 80-99%, C = 60-79%, D = 40-59%, F = <40%.

### Step 4: Write report

`agent-workspace/quality-reports/harness-audit-<YYYY-MM-DD>.md`:

```markdown
# Harness Audit — <date>

## Overall Grade
<A-F>

## Scorecard
[table from Step 3]

## Orphans
- Agents not used in last 10 sessions: [list]
- Skills not used in last 10 sessions: [list]

## Drift
- Agents missing spawned-session section: [list]
- Skills with workflow-summary descriptions: [list]
- Commands missing spawned-session section: [list]

## Recommendations
1. [Action] — Owner: [human|agent] — Priority: [high|med|low]
```

### Step 5: Surface top 3 to orchestrator

Return to invoker: report path + overall grade + top 3 recommendations.

## Spawned Session Handling

If `ORCH_SPAWNED=true`:
- No interactive prompts.
- Write report to disk as above.
- Emit structured completion report:
  ```yaml
  ---
  status: DONE
  report_path: agent-workspace/quality-reports/harness-audit-<date>.md
  overall_grade: <A-F>
  top_recommendations:
    - <one-liner>
    - <one-liner>
    - <one-liner>
  next_action: null  # audit is read-only
  ---
  ```
