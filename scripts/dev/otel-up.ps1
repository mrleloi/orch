# otel-up.ps1 — bring up the local Grafana LGTM observability stack for Orch on Windows.
# Usage:
#   .\scripts\dev\otel-up.ps1            # start in background
#   .\scripts\dev\otel-up.ps1 down       # stop + remove
#   .\scripts\dev\otel-up.ps1 logs       # follow container logs
param([string]$Cmd = "up")

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = Split-Path -Parent (Split-Path -Parent $ScriptDir)
$ComposeFile = Join-Path $ProjectDir "docker\otel-stack\docker-compose-lgtm.yml"

switch ($Cmd) {
    "up" {
        docker compose -f $ComposeFile up -d
        Write-Host ""
        Write-Host "LGTM stack up. Grafana -> http://127.0.0.1:3000 (admin/admin)"
        Write-Host "OTLP endpoints: gRPC :4317, HTTP :4318"
    }
    "down"   { docker compose -f $ComposeFile down }
    "logs"   { docker compose -f $ComposeFile logs -f }
    "config" { docker compose -f $ComposeFile config }
    default  { Write-Error "Usage: otel-up.ps1 [up|down|logs|config]"; exit 2 }
}
