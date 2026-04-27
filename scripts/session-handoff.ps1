# session-handoff.ps1 — spawn a fresh Claude Code session that resumes the current Orch work
# Usage:
#   .\scripts\session-handoff.ps1              # uses latest checkpoint
#   .\scripts\session-handoff.ps1 -Slug name   # uses specific checkpoint by slug
#   $env:ORCH_CCS_PROFILE="work"; .\scripts\session-handoff.ps1   # route through ccs profile

param(
    [string]$Slug = ""
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = Split-Path -Parent $ScriptDir
$CheckpointDir = Join-Path $ProjectDir "agent-workspace\memory\checkpoints"

# Pick checkpoint
if ($Slug) {
    $Checkpoint = Get-ChildItem -Path $CheckpointDir -Filter "*$Slug*.md" |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
} else {
    $Checkpoint = Get-ChildItem -Path $CheckpointDir -Filter "*.md" |
        Where-Object { $_.BaseName -ne "latest" } |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
}

if (-not $Checkpoint) {
    Write-Error "No checkpoint found in $CheckpointDir"
    exit 1
}

Write-Host "[INFO] Resuming from checkpoint: $($Checkpoint.Name)"

$Bootstrap = @"
You are Claude (Opus 4.7) resuming a FULL AUTONOMOUS Orch execution session.

STEP 1 — read these files in order before any other action:
- $($Checkpoint.FullName)    (the handoff checkpoint — has current phase/task/next-action)
- $ProjectDir\CLAUDE.md    (project instructions)
- $ProjectDir\PROJECT_CHARTER.md    (immutable vision + invariants)
- $ProjectDir\agent-workspace\memory\current-execution.md    (routing)
- $ProjectDir\agent-workspace\memory\budget-tracker.md    (budget discipline — reset your counter to 0, cliff rules apply)
- $ProjectDir\agent-workspace\session-plans\pending\phase-1-core.md    (current-phase plan)

STEP 2 — honor hard project rules:
- Fully autonomous; never ask the user — resolve ambiguity via charter + decisions/NNN-*.md
- Every Agent dispatch MUST use run_in_background=true
- Hook commands use `$CLAUDE_PROJECT_DIR
- Every spawn of a fresh claude session MUST use --rc (Remote Control); scripts/session-handoff.sh handles this
- At YOUR ~200K mark: write a new checkpoint, update latest.md, then invoke 'ORCH_HEADLESS=1 scripts/session-handoff.sh' IN BACKGROUND before ending your turn. This chains the autonomous loop.
- Never commit (I-6); stage only

STEP 3 — resume at the 'next_action' section of the checkpoint. Dispatch the next subagent via Agent tool (run_in_background=true). Continue the task loop until Phase 4 complete or your own 200K mark.

Begin now.
"@

# Spawn fresh claude session in Remote Control ACTIVE mode (required by project rule).
# --rc makes the session controllable from claude.ai / Claude app.
$RcName = if ($env:ORCH_RC_NAME) { $env:ORCH_RC_NAME } else { "orch-$($Checkpoint.BaseName)" }

# Strip CLAUDECODE so a nested claude-from-claude spawn doesn't trip the nested-session guard.
$env:CLAUDECODE = $null
Remove-Item Env:CLAUDECODE -ErrorAction SilentlyContinue

Set-Location $ProjectDir

# Autonomous mode (ORCH_HEADLESS=1): use -p headless so the session runs without TTY.
if ($env:ORCH_HEADLESS -eq "1") {
    $LogDir = Join-Path $ProjectDir "agent-workspace\memory\handoff-logs"
    New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
    $LogFile = Join-Path $LogDir ("{0}-{1}.log" -f (Get-Date -Format "yyyyMMddTHHmmssZ"), $RcName)
    Write-Host "[INFO] Headless handoff → $LogFile"
    if ($env:ORCH_CCS_PROFILE) {
        & ccs $env:ORCH_CCS_PROFILE claude --rc $RcName -p $Bootstrap *>&1 | Out-File -FilePath $LogFile
    } else {
        & claude --rc $RcName -p $Bootstrap *>&1 | Out-File -FilePath $LogFile
    }
    exit $LASTEXITCODE
}

# Interactive mode (default):
if ($env:ORCH_CCS_PROFILE) {
    & ccs $env:ORCH_CCS_PROFILE claude --rc $RcName $Bootstrap
} else {
    & claude --rc $RcName $Bootstrap
}
