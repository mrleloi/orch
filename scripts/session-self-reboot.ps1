# session-self-reboot.ps1 - send /new to the current Claude Code TUI window.
# Invoked by hook scripts (budget-watchdog.sh wind-down/cliff branches and
# autonomous-stop-watchdog.sh Mode-B recovery).
#
# Robustness model (lesson from 2026-04-26 failure):
#   - DO NOT trust Get-Process claude. After a machine restart + new ccs session,
#     PIDs are reassigned. We walk OUR OWN parent chain instead. This script is
#     spawned by powershell.exe <- bash.exe <- bash hook <- node.exe <- claude.exe
#     <- terminal-emulator. The first ancestor with a MainWindowHandle is our
#     target. This is invariant across restarts/reboots.
#   - Retry SendKeys multiple times: "Access is denied" is a transient race.
#   - AttachThreadInput trick to bypass Windows foreground-stealing rules.
#   - Tolerant: $ErrorActionPreference=Continue, try/catch around SendKeys.

param(
    [int]$InitialDelayMs = 400,
    [int]$RetryCount = 4,
    [int]$RetryDelayMs = 800,
    [string]$LogFile = "",
    [string]$FirstPrompt = ""
)

$ErrorActionPreference = "Continue"

if (-not $LogFile) {
    $ProjectDir = (Get-Item $PSScriptRoot).Parent.FullName
    $LogDir = Join-Path $ProjectDir "agent-workspace\memory\handoff-logs"
    New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
    $LogFile = Join-Path $LogDir ("session-self-reboot-{0}.log" -f (Get-Date -Format "yyyyMMddTHHmmssZ"))
}
function Log($msg) { Add-Content -Path $LogFile -Value ("[{0}] {1}" -f (Get-Date -Format "o"), $msg) }

Log "start pid=$PID retries=$RetryCount"
Start-Sleep -Milliseconds $InitialDelayMs

Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32 {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(IntPtr hWnd, out int lpdwProcessId);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
}
"@

function Find-AncestorWindow {
    # Strategy 1: walk THIS process's parent chain.
    # Strategy 2 (fallback): if walk dies (intermediate process exited -- common
    #   when invoked via `timeout 8 bash`), find any claude.exe in our session
    #   and walk ITS chain instead.
    # Strategy 3 (last resort): any visible terminal in our session.
    $mySessionId = (Get-CimInstance Win32_Process -Filter "ProcessId=$PID" -ErrorAction SilentlyContinue).SessionId

    # ----- Strategy 1: walk from $PID -----
    try {
        $current = $PID
        for ($i = 0; $i -lt 12 -and $current -gt 0; $i++) {
            $proc = Get-Process -Id $current -ErrorAction SilentlyContinue
            if ($proc) {
                Log ("S1 hop {0} pid={1} name={2} hwnd=0x{3:X}" -f $i, $current, $proc.ProcessName, [int64]$proc.MainWindowHandle)
                if ($proc.MainWindowHandle -ne [IntPtr]::Zero) {
                    return @{ Handle = $proc.MainWindowHandle; ProcessName = $proc.ProcessName; Pid = $current; Strategy = "S1-ancestor" }
                }
            }
            $cim = Get-CimInstance Win32_Process -Filter "ProcessId=$current" -ErrorAction SilentlyContinue
            if (-not $cim) { Log "S1 no CIM record for $current (intermediate exited)"; break }
            $current = [int]$cim.ParentProcessId
        }
    } catch { Log "S1 error: $_" }

    # ----- Strategy 2: walk from claude.exe in same session -----
    try {
        $claudes = Get-Process claude -ErrorAction SilentlyContinue
        foreach ($c in $claudes) {
            $cSess = (Get-CimInstance Win32_Process -Filter "ProcessId=$($c.Id)" -ErrorAction SilentlyContinue).SessionId
            if ($cSess -ne $mySessionId) { continue }
            $current = $c.Id
            for ($i = 0; $i -lt 8 -and $current -gt 0; $i++) {
                $proc = Get-Process -Id $current -ErrorAction SilentlyContinue
                if ($proc) {
                    Log ("S2 hop {0} pid={1} name={2} hwnd=0x{3:X}" -f $i, $current, $proc.ProcessName, [int64]$proc.MainWindowHandle)
                    if ($proc.MainWindowHandle -ne [IntPtr]::Zero) {
                        return @{ Handle = $proc.MainWindowHandle; ProcessName = $proc.ProcessName; Pid = $current; Strategy = "S2-claude-ancestor" }
                    }
                }
                $cim = Get-CimInstance Win32_Process -Filter "ProcessId=$current" -ErrorAction SilentlyContinue
                if (-not $cim) { Log "S2 no CIM record for $current"; break }
                $current = [int]$cim.ParentProcessId
            }
        }
    } catch { Log "S2 error: $_" }

    # ----- Strategy 3: any visible terminal in our session -----
    try {
        $terminals = @("WindowsTerminal","mintty","ConsoleWindowHost","wt","pwsh","powershell","cmd","bash")
        foreach ($name in $terminals) {
            $matches = Get-Process $name -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero }
            foreach ($p in $matches) {
                $pSess = (Get-CimInstance Win32_Process -Filter "ProcessId=$($p.Id)" -ErrorAction SilentlyContinue).SessionId
                if ($pSess -eq $mySessionId) {
                    Log ("S3 candidate {0} pid={1}" -f $name, $p.Id)
                    return @{ Handle = $p.MainWindowHandle; ProcessName = $p.ProcessName; Pid = $p.Id; Strategy = "S3-terminal-fallback" }
                }
            }
        }
    } catch { Log "S3 error: $_" }
    return $null
}

function Activate-Window([IntPtr]$hwnd) {
    try {
        $fgHwnd = [Win32]::GetForegroundWindow()
        [int]$fgPid = 0
        $fgTid = [Win32]::GetWindowThreadProcessId($fgHwnd, [ref]$fgPid)
        $myTid = [Win32]::GetCurrentThreadId()
        $attached = $false
        if ($fgTid -ne 0 -and $fgTid -ne $myTid) {
            [Win32]::AttachThreadInput($myTid, $fgTid, $true) | Out-Null
            $attached = $true
        }
        [Win32]::ShowWindow($hwnd, 9) | Out-Null
        [Win32]::BringWindowToTop($hwnd) | Out-Null
        [Win32]::SetForegroundWindow($hwnd) | Out-Null
        if ($attached) {
            [Win32]::AttachThreadInput($myTid, $fgTid, $false) | Out-Null
        }
        Start-Sleep -Milliseconds 350
        return $true
    } catch { Log "activate error: $_"; return $false }
}

function Send-NewCommand {
    try {
        [System.Windows.Forms.SendKeys]::SendWait("/new")
        Start-Sleep -Milliseconds 200
        [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
        return $true
    } catch { Log ("SendKeys error: " + $_.Exception.Message); return $false }
}

# Detect "secure desktop" / locked-screen state. SendKeys cannot reach windows
# on the user's interactive desktop while one of these processes owns the
# foreground (Windows Window Station / UIPI isolation). Observed 2026-04-26:
# repeated "Access is denied" errors when LockApp or Idle (pid 0) was foreground.
function Is-Desktop-Locked {
    param([string]$fgName, [int]$fgPid)
    if ($fgPid -le 4) { return $true }                       # Idle (0), System (4)
    $blocked = @("LockApp","LogonUI","Winlogon","WerFault","ApplicationFrameHost+lock")
    foreach ($n in $blocked) { if ($fgName -ieq $n.Split('+')[0]) { return $true } }
    return $false
}

# Clear stale ready marker so the FRESH session SessionStart hook re-fires continue-injector.
$ProjectDir = (Get-Item $PSScriptRoot).Parent.FullName
$ReadyMarker = Join-Path $ProjectDir "agent-workspace\memory\.session-ready"
Remove-Item $ReadyMarker -ErrorAction SilentlyContinue
Get-ChildItem (Join-Path $ProjectDir "agent-workspace\memory") -Filter ".continue-fired-*" -ErrorAction SilentlyContinue |
    Remove-Item -ErrorAction SilentlyContinue

$target = Find-AncestorWindow
if (-not $target) {
    Log "ALL 3 STRATEGIES FAILED - no target window"
    # Write a LOUD escalation marker the operator/LLM can see at next session start.
    $EscDir = Join-Path $ProjectDir "agent-workspace\memory"
    $EscMarker = Join-Path $EscDir ".auto-reboot-FAILED"
    Set-Content -Path $EscMarker -Value (
        "AUTO-REBOOT FAILED at " + (Get-Date -Format "o") + "`n" +
        "Reason: could not locate target terminal window (S1+S2+S3 all failed).`n" +
        "Action required: human/LLM must MANUALLY type /new in the Claude Code TUI.`n" +
        "Logfile: " + $LogFile + "`n" +
        "Architectural backlog: see decisions/011-terminal-management-strategy.md`n"
    ) -ErrorAction SilentlyContinue
    Log "session-self-reboot done success=False reason=no-window-all-strategies-failed"
    exit 0
}
Log ("target window: pid=" + $target.Pid + " name=" + $target.ProcessName + " hwnd=0x" + ("{0:X}" -f [int64]$target.Handle) + " via=" + $target.Strategy)

$success = $false
$lockObserved = $false
for ($i = 1; $i -le $RetryCount; $i++) {
    Log "attempt $i/$RetryCount"
    Activate-Window $target.Handle | Out-Null

    $fg = [Win32]::GetForegroundWindow()
    [int]$fgPid = 0
    [Win32]::GetWindowThreadProcessId($fg, [ref]$fgPid) | Out-Null
    $fgProc = Get-Process -Id $fgPid -ErrorAction SilentlyContinue
    $fgName = if ($fgProc) { $fgProc.ProcessName } else { "?" }
    Log ("foreground pid=" + $fgPid + " name=" + $fgName)

    # If desktop is locked, SendKeys WILL fail with "Access is denied". Don't waste
    # the retry budget on tight-loop failures -- wait longer to give the user time
    # to unlock. The watchdog auto-retry path (budget-watchdog.sh clears the
    # once-only marker on .auto-reboot-FAILED) means we'll get future retries
    # at later Stop hooks anyway.
    if (Is-Desktop-Locked -fgName $fgName -fgPid $fgPid) {
        $lockObserved = $true
        Log ("DESKTOP LOCKED -- foreground=" + $fgName + " pid=" + $fgPid + " -- SendKeys will fail until unlock")
        if ($i -lt $RetryCount) { Start-Sleep -Milliseconds 3000 }  # 3s wait, hoping user unlocks mid-retry
        continue  # skip the SendKeys attempt; retry next iteration
    }

    if (Send-NewCommand) {
        Log "/new+Enter sent on attempt $i"
        $success = $true
        break
    } else {
        Log "send failed on attempt $i"
    }
    if ($i -lt $RetryCount) { Start-Sleep -Milliseconds $RetryDelayMs }
}

$reason = if ($success) { "ok" } else { if ($lockObserved) { "desktop-locked-during-all-retries" } else { "sendkeys-all-attempts-failed" } }
Log ("session-self-reboot done success=" + $success + " reason=" + $reason + " strategy=" + $target.Strategy)
if (-not $success) {
    # LOUD escalation marker so failure is visible.
    $EscDir = Join-Path $ProjectDir "agent-workspace\memory"
    $EscMarker = Join-Path $EscDir ".auto-reboot-FAILED"
    $reasonLine = if ($lockObserved) {
        "Reason: Desktop was LOCKED during all $RetryCount retry attempts (foreground was LockApp / LogonUI / Idle). SendKeys cannot reach interactive-desktop windows when the secure desktop owns foreground. NOT a code bug -- Windows OS-level UIPI isolation."
    } else {
        "Reason: SendKeys all $RetryCount attempts failed (Access denied / foreground race) -- desktop was NOT locked, possibly UAC prompt or other elevated-privilege foreground."
    }
    $actionLine = if ($lockObserved) {
        "Action: UNLOCK the screen. The watchdog will auto-retry the reboot at the next Stop hook (budget-watchdog.sh clears .cliff-fired/.wind-down-fired when this marker exists). If you want immediate reboot: type /new manually in the Claude Code TUI."
    } else {
        "Action required: human/LLM must MANUALLY type /new in the Claude Code TUI."
    }
    Set-Content -Path $EscMarker -Value (
        "AUTO-REBOOT FAILED at " + (Get-Date -Format "o") + "`n" +
        $reasonLine + "`n" +
        "Target was: pid=" + $target.Pid + " name=" + $target.ProcessName + " strategy=" + $target.Strategy + "`n" +
        $actionLine + "`n" +
        "Logfile: " + $LogFile + "`n" +
        "Architectural backlog: see decisions/011-terminal-management-strategy.md`n"
    ) -ErrorAction SilentlyContinue
}
