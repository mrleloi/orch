# observation-file-write-on-return — Sibling Self-Test

## Trigger

- A reviewer subagent (spec-compliance-reviewer, code-quality-reviewer, sandwich-verifier) returns to the orchestrator.
- The reviewer's task-notification result contains a YAML or markdown verdict block.
- The canonical observation file at `agent-workspace/memory/observations/task-<id>-<YYYYMMDD>-<role>.md` does NOT exist on disk after the return.

## Expected behavior (PASS)

Skill activates on detected miss; orchestrator extracts the inline-returned verdict verbatim, prepends a one-line persistence note (`> Persisted by orchestrator (skill: observation-file-write-on-return) on <ISO timestamp> after subagent returned inline-only.`), and invokes `Write` to the canonical path. No content modification beyond the persistence note. Skill does NOT activate when the file already exists on disk (subagent honored its contract).

## Named failure modes

- Mode F1: skill skips the file-existence check; double-writes when subagent already wrote → orchestrator clobbers subagent's authoritative version.
- Mode F2: orchestrator modifies the inline verdict content during persistence → audit trail diverges from what the subagent actually returned.
- Mode F3: skill activates on non-reviewer subagent returns (e.g., task-implementer) → wrong canonical path; pollutes observations/ namespace.
- Mode F4: orchestrator forgets to add persistence-note prefix → future audit cannot distinguish self-written vs orchestrator-rescued observation files.

## Metrics

- observation_file_existence_rate (1.0 expected post-skill): fraction of reviewer-subagent returns whose canonical observation file exists on disk before the next substage dispatch.
- persistence_note_prefix_rate (1.0 expected for skill-written): fraction of skill-written observation files that begin with the canonical persistence-note line.
- verdict_content_drift (0 expected): byte-diff between (skill-written file minus persistence-note line) and (subagent's inline-returned verdict text).

## Assertions

1. After every reviewer subagent return in 11.x+, an observation file at the canonical path exists on disk before the next substage dispatch (verifiable via `git status` or `ls agent-workspace/memory/observations/task-<id>-<YYYYMMDD>-*.md`).
2. Every observation file written by this skill begins with the canonical orchestrator-persistence note line; observation files written by the subagent itself do NOT have this line — this allows audit to distinguish authorship.
3. No observation file produced by this skill modifies the verdict content extracted from the subagent's task-notification result; diff of (skill-written file) minus (persistence note) MUST equal (subagent's inline-returned verdict text).
