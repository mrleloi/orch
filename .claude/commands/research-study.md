---
name: research-study
description: Use to invoke research-scanner subagent to study one reference repo and produce structured notes. Used extensively in Phase 0.
allowed-tools: [Read, Bash, Glob]
---

# /research-study — Study a Reference Repo

> Invokes research-scanner subagent to produce notes on ONE repo.
> Used extensively in Phase 0.

## Input

`$ARGUMENTS`: repo identifier (e.g., "claudegram" or "NachoSEO/claudegram")

## Steps

### 1. Resolve Target
Map identifier to:
- URL (from agent-workspace/session-plans/pending/phase-0-research.md target list)
- Clone path: `reference-repos/<repo-name>/`
- Priority tier (A/B/C)

If unknown: ask user or STOP-3 (ambiguity).

### 2. Ensure Cloned
```bash
if [ ! -d reference-repos/<name> ]; then
  mkdir -p reference-repos
  cd reference-repos
  git clone --depth 1 <url> <name>
fi
```

Record in `agent-workspace/research/_cloned.md`:
```markdown
| Repo | URL | Commit | Cloned Date |
|---|---|---|---|
| claudegram | (repo-url) | abc123 | 2026-04-24 |
```

### 3. Invoke research-scanner Subagent
```
Task tool:
- agent: research-scanner
- description: Study <repo-name>, produce research note
- prompt: |
    Study <clone-path> per research-protocol.md.
    Focus areas (from phase-0-research.md): <list>.
    Budget: <per tier: A=25K, B=15K, C=10K>.
    Output: agent-workspace/research/<repo-name>.md.
    Return: top borrow items + skip items + verdict.
```

### 4. Verify Output
Check `agent-workspace/research/<repo-name>.md` exists with all required sections.

### 5. Report
```markdown
## Research: <repo-name>

- Note: agent-workspace/research/<repo-name>.md
- Stack: <language + frameworks>
- License: <MIT/etc>
- Tokens spent: ~X K

### Top Borrows
1. <item>
2. <item>
3. <item>

### Top Skips
1. <item>
2. <item>

### Verdict: <INTEGRATE_STRUCTURE | BORROW_PATTERNS | LEARN_ONLY | SKIP>
```

Anti-patterns: don't re-study a repo already in `research/` (check first); don't go over budget; always use `--depth 1`.

## Spawned Session Handling

In Phase 0 Tasks 0.6, 0.7, 0.8: invoke this command (or directly the subagent) for each target repo in sequence.
