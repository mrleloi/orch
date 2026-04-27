# Generic Node.js Project Integration

This folder shows the minimal files needed to wire any Node.js project into the Orch daemon. Adjust the values in `profile.yaml` for your project; the hook commands in `settings.json` are project-agnostic and copy verbatim.

---

## Files in this folder

| File | Purpose |
|---|---|
| `profile.yaml` | Minimal `.orch/profile.yaml` — copy to `<your-project>/.orch/profile.yaml` and edit |
| `settings.json` | Four Orch hook entries — merge into `<your-project>/.claude/settings.json` |

---

## 3-Step Setup

### Step 1: Attach your project

```bash
# From the orch-starter directory
orch attach /path/to/your/project
```

The attach command creates `<your-project>/.orch/profile.yaml` with a minimal scaffold and registers the project with the daemon.

### Step 2: Confirm the generated profile

```bash
# Compare the generated file against this example
diff <your-project>/.orch/profile.yaml examples/generic-nodejs-project/profile.yaml
```

Edit `<your-project>/.orch/profile.yaml` and set the two required fields:

```yaml
projectId: your-app-name       # lowercase, hyphens only
rootPath: "/absolute/path/to/your/project"
ccsProfile: "your-ccs-profile" # run: ccs list
```

Add or rename `sessionTypes` to match your actual workload (at least one entry is required).

### Step 3: Start the daemon

```bash
orch start
```

Orch will watch `session-plans/pending/` for incoming plan files and dispatch Claude Code sessions automatically.

---

## Merging hooks into .claude/settings.json

Copy the four entries from `settings.json` in this folder into your project's `.claude/settings.json` under the top-level `"hooks"` key:

```bash
# Back up first
cp /path/to/your/project/.claude/settings.json \
   /path/to/your/project/.claude/settings.json.backup
```

The hook commands use `${CLAUDE_PROJECT_DIR:-.}` so they resolve correctly from any working directory — copy them verbatim.

Example merged result:

```json
{
  "hooks": {
    "SessionStart": [ ... ],
    "Stop":         [ ... ],
    "SubagentStop": [ ... ],
    "PostToolUse":  [ ... ]
  }
}
```

---

## Verification

Start the Orch daemon, then open a Claude Code session inside your project. Hook payloads should arrive at the daemon within seconds.

```bash
# Check daemon health
curl -s http://127.0.0.1:4141/healthz
# Expected: {"status":"ok"}

# Check daemon logs
tail -f ~/.orch/logs/*.log
```

---

## Troubleshooting

**Profile schema mismatch — project not loaded**

The daemon logs will show a `ProfileValidationError` with the failing field. Common causes:
- `projectId` contains uppercase or spaces (must match `^[a-z0-9-]+$`).
- `rootPath` is relative (must be absolute).
- `sessionTypes` array is empty (at least one entry required).
- `ccsProfile` is missing.

Fix the YAML, then reload: `orch reload`.

**Hooks time out or curl fails with "Connection refused"**

The Orch daemon is not running or is on a different port.
- Default port: `4141` (set via `ORCH_HTTP_PORT`).
- Start the daemon: `orch start`.
