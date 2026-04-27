# Tasks

> Ad-hoc task files live here. Unlike `agent-workspace/session-plans/`, which contains phase-structured plans, this folder is for one-off work that doesn't fit a phase (bug fixes, small features post-v1.0, experiments).

## Format

Same as session plans — markdown with frontmatter:

```markdown
---
id: TASK-<date>-<slug>
priority: 5
session_type: FOCUSED_IMPL
budget_tokens: 80000
---

# Task: <title>

## Context
<why this exists>

## Acceptance
- [ ] <criterion>
- [ ] <criterion>

## Steps
<optional outline>
```

## Usage

In v1.0, the queue file watcher does NOT watch this folder by default — it watches `agent-workspace/session-plans/pending/`.

Post-v1.0, once Orch itself is running, you can add `tasks/` to the watched paths in this project's own `.orch/profile.yaml` if you want Orch to dispatch work for the Orch repo itself (meta!).

For now, treat this folder as a scratch pad for human notes and future work.
