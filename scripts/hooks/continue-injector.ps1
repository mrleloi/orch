# continue-injector.ps1 -- spawned by SessionStart hook in the FRESH session (after /new).
# Waits for the new session's TUI input field to be ready, then sends "continue" + Enter so
# the new session's LLM gets its first user prompt and begins the autonomous resume loop.
#
# Runs in a detached background process so the hook itself returns quickly; this process
# outlives the hook and continues its timer.
#
# Robustness:
#   - Multiple retries with increasing delays to survive focus races and TUI init jitter
#   - Prefers activating the parent terminal window (claude.exe has no MainWindowHandle)
#   - Logs every attempt for post-mortem

param(
    [int]$InitialDelayMs = 2500,
    [int]$RetryCount = 3,
    [int]$RetryDelayMs = 3000,
    [string]$LogFile = ""
)

$ErrorActionPreference = "Continue"

# Resolve log path if not provided.
if (-not $LogFile) {
    $ProjectDir = (Get-Item $PSScriptRoot).Parent.Parent.FullName
    $LogDir = Join-Path $ProjectDir "agent-workspace\memory\handoff-logs"
    New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
    $LogFile = Join-Path $LogDir ("continue-injector-{0}.log" -f (Get-Date -Format "yyyyMMddTHHmmssZ"))
}
function Log($msg) { Add-Content -Path $LogFile -Value ("[{0}] {1}" -f (Get-Date -Format "o"), $msg) }

Log "start pid=$PID initialDelay=$InitialDelayMs retries=$RetryCount retryDelay=$RetryDelayMs"

# Wait for fresh session's TUI to init (input field ready, status line settled).
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
}
"@

function Try-FocusClaudeTerminal {
    # claude.exe itself has MainWindowHandle=0; the terminal emulator hosting it does not.
    # Walk: claude.exe -> parent (terminal) -> MainWindowHandle.
    try {
        $claudes = Get-Process claude -ErrorAction SilentlyContinue
        if (-not $claudes) { Log "no claude.exe running"; return $false }

        foreach ($c in $claudes) {
            try {
                $parentId = (Get-CimInstance Win32_Process -Filter "ProcessId = $($c.Id)" -ErrorAction Stop).ParentProcessId
                if (-not $parentId) { continue }
                $parent = Get-Process -Id $parentId -ErrorAction SilentlyContinue
                if (-not $parent) { continue }
                Log ("claude pid={0} parent={1}({2}) mainWnd=0x{3:X}" -f $c.Id, $parent.ProcessName, $parent.Id, [int64]$parent.MainWindowHandle)
                if ($parent.MainWindowHandle -ne [IntPtr]::Zero) {
                    [Win32]::ShowWindow($parent.MainWindowHandle, 9) | Out-Null   # SW_RESTORE
                    [Win32]::SetForegroundWindow($parent.MainWindowHandle) | Out-Null
                    Start-Sleep -Milliseconds 400
                    return $true
                }
            } catch { Log "parent-walk error: $_" }
        }

        # Fallback: any window whose process is a common terminal emulator.
        $terminals = @("WindowsTerminal","mintty","ConsoleWindowHost","wt","pwsh","powershell","cmd","bash")
        foreach ($name in $terminals) {
            $p = Get-Process $name -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero } | Select-Object -First 1
            if ($p) {
                Log ("fallback focus {0} pid={1}" -f $name, $p.Id)
                [Win32]::ShowWindow($p.MainWindowHandle, 9) | Out-Null
                [Win32]::SetForegroundWindow($p.MainWindowHandle) | Out-Null
                Start-Sleep -Milliseconds 400
                return $true
            }
        }
    } catch { Log "focus error: $_" }
    return $false
}

function Send-Continue {
    # SendKeys "continue" + Enter. Kept minimal so less can go wrong.
    try {
        [System.Windows.Forms.SendKeys]::SendWait("continue")
        Start-Sleep -Milliseconds 150
        [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
        return $true
    } catch { Log "SendKeys error: $_"; return $false }
}

# Idempotency: if another injector already fired for this session, skip.
$ProjectDir = (Get-Item $PSScriptRoot).Parent.Parent.FullName
$SessionTag = (Get-Item (Join-Path $ProjectDir "agent-workspace\memory\.session-ready") -ErrorAction SilentlyContinue).LastWriteTime.Ticks
$FiredMarker = Join-Path $ProjectDir ("agent-workspace\memory\.continue-fired-{0}" -f $SessionTag)
if (Test-Path $FiredMarker) {
    Log "already fired for this session-ready tick ($SessionTag); exiting"
    exit 0
}
Set-Content -Path $FiredMarker -Value (Get-Date -Format "o") -ErrorAction SilentlyContinue

for ($i = 1; $i -le $RetryCount; $i++) {
    Log "attempt $i/$RetryCount"
    Try-FocusClaudeTerminal | Out-Null
    $fg = [Win32]::GetForegroundWindow()
    [int]$pid_fg = 0
    [Win32]::GetWindowThreadProcessId($fg, [ref]$pid_fg) | Out-Null
    $fgProc = Get-Process -Id $pid_fg -ErrorAction SilentlyContinue
    Log ("foreground pid={0} name={1}" -f $pid_fg, ($fgProc.ProcessName))
    if (Send-Continue) {
        Log "continue+Enter sent (attempt $i)"
    } else {
        Log "send failed (attempt $i)"
    }
    if ($i -lt $RetryCount) { Start-Sleep -Milliseconds $RetryDelayMs }
}

Log "injector done"
