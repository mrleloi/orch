#!/usr/bin/env bash
# diagnostic-pretooluse-stash.sh — PreToolUse stdin capturer (Task probe, ephemeral).
# Writes verbatim stdin to .diag-pretooluse/<ISO_TS>.json; echoes stdin back to stdout.
set -uo pipefail
trap 'exit 0' ERR
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
DIAG_DIR="$PROJECT_DIR/agent-workspace/memory/.diag-pretooluse"
mkdir -p "$DIAG_DIR"
PAYLOAD="$(cat)"
[ -z "$PAYLOAD" ] && exit 0
TS="$(date -u +%Y%m%dT%H%M%S%N 2>/dev/null || date -u +%Y%m%dT%H%M%S)"
printf '%s' "$PAYLOAD" > "$DIAG_DIR/${TS}.json"
printf '%s' "$PAYLOAD"
exit 0
