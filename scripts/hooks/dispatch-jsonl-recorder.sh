#!/usr/bin/env bash
# dispatch-jsonl-recorder.sh — Decision 023 v1 dispatch event log (9 fields).
# PreToolUse (tool_name=Task) → DISPATCHED; SubagentStop → COMPLETED.
# Model map: opus=planner/architect/verifier/debugger; sonnet=dev/implementer/reviewer/scanner.
# POSIX >> line-atomic; no lock files (Windows Git Bash portability). Background subshell (INV-S9).
set -uo pipefail
trap 'exit 0' ERR
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
MEMORY_DIR="$PROJECT_DIR/agent-workspace/memory"
mkdir -p "$MEMORY_DIR"
PAYLOAD="$(cat)"
[ -z "$PAYLOAD" ] && exit 0
(
eval "$(printf '%s' "$PAYLOAD" | node -e "
let s=''; process.stdin.on('data',c=>s+=c);
process.stdin.on('end',()=>{
  try {
    const p=JSON.parse(s),q=v=>JSON.stringify(String(v||''));
    console.log('HOOK_EVENT='+q(p.hook_event_name));
    console.log('SESSION_ID='+q(p.session_id));
    console.log('TOOL_NAME='+q(p.tool_name));
    console.log('TOOL_USE_ID='+q(p.tool_use_id));
    console.log('AGENT_ID='+q(p.agent_id));
    console.log('STATUS='+q(p.status));
    console.log('SUBAGENT_TYPE='+q((p.tool_input&&p.tool_input.subagent_type)||''));
  } catch { console.log('HOOK_EVENT=\"\"'); }
});" 2>/dev/null || echo 'HOOK_EVENT=""')"
[ "$HOOK_EVENT" = "PreToolUse" ] && [ "$TOOL_NAME" != "Task" ] && exit 0
[ "$HOOK_EVENT" != "PreToolUse" ] && [ "$HOOK_EVENT" != "SubagentStop" ] && exit 0
case "${SUBAGENT_TYPE:-}" in
  master-planner|sandwich-architect|sandwich-verifier|systematic-debugger) MODEL="opus" ;;
  sandwich-dev|task-implementer|spec-compliance-reviewer|code-quality-reviewer|research-scanner) MODEL="sonnet" ;;
  *) MODEL="unknown" ;;
esac
TS_MS="$(node -e 'console.log(Date.now())' 2>/dev/null || echo 0)"
PARENT_SID="${SESSION_ID:-${CLAUDE_SESSION_ID:-main}}"
[ -z "$PARENT_SID" ] && PARENT_SID="main"
SIDECAR="$MEMORY_DIR/.dispatch-pending-${PARENT_SID}.jsonl"
DISPATCH_JSONL="$MEMORY_DIR/dispatch.jsonl"
if [ "$HOOK_EVENT" = "PreToolUse" ]; then
  DID="${TOOL_USE_ID:-}"
  [ -z "$DID" ] && DID="$(node -e 'const c=require("crypto");console.log(c.randomUUID())' 2>/dev/null || echo "gen-$(date +%s)")"
  ATYPE="${SUBAGENT_TYPE:-unknown-agent}"
  [ -z "$ATYPE" ] && ATYPE="unknown-agent"
  printf '%s\n' "{\"dispatch_id\":\"${DID}\",\"agent_type\":\"${ATYPE}\",\"model\":\"${MODEL}\"}" >> "$SIDECAR"
  printf '%s\n' "{\"event\":\"DISPATCHED\",\"dispatch_id\":\"${DID}\",\"agent_type\":\"${ATYPE}\",\"model\":\"${MODEL}\",\"parent_session_id\":\"${PARENT_SID}\",\"bg\":true,\"ts_ms\":${TS_MS},\"outcome\":null,\"tokens_used\":null}" >> "$DISPATCH_JSONL"
else
  LID="${AGENT_ID:-}"; ATYPE="unknown-agent"; MODEL="unknown"
  if [ -n "$LID" ] && [ -f "$SIDECAR" ]; then
    MATCH="$(grep "\"dispatch_id\":\"${LID}\"" "$SIDECAR" | tail -1 || true)"
    if [ -n "$MATCH" ]; then
      eval "$(printf '%s' "$MATCH" | node -e "
let s=''; process.stdin.on('data',c=>s+=c);
process.stdin.on('end',()=>{ try{const p=JSON.parse(s);
  console.log('ATYPE='+JSON.stringify(p.agent_type||'unknown-agent'));
  console.log('MODEL='+JSON.stringify(p.model||'unknown'));
}catch{console.log('ATYPE=\"unknown-agent\"\nMODEL=\"unknown\"');} });" 2>/dev/null || echo 'ATYPE="unknown-agent"')"
    fi
  fi
  case "${STATUS:-}" in
    DONE|done|ok) OUTCOME='"DONE"' ;; FAIL|fail|error) OUTCOME='"FAIL"' ;;
    BLOCKED|blocked) OUTCOME='"BLOCKED"' ;; *) OUTCOME='"DONE"' ;;
  esac
  DID="${LID:-unknown}"
  printf '%s\n' "{\"event\":\"COMPLETED\",\"dispatch_id\":\"${DID}\",\"agent_type\":\"${ATYPE}\",\"model\":\"${MODEL}\",\"parent_session_id\":\"${PARENT_SID}\",\"bg\":true,\"ts_ms\":${TS_MS},\"outcome\":${OUTCOME},\"tokens_used\":null}" >> "$DISPATCH_JSONL"
fi
) </dev/null >/dev/null 2>&1 &
disown 2>/dev/null || true
exit 0
