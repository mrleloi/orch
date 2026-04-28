#!/usr/bin/env bash
# dispatch-jsonl-recorder.sh — Decision 023 v2 dispatch event log (10 fields).
# PreToolUse (tool_name=Agent) → DISPATCHED; PostToolUse (tool_name=Agent) → sidecar hex-key index;
# SubagentStop → COMPLETED. Model map: opus=planner/architect/verifier/debugger; sonnet=dev/implementer/reviewer/scanner.
# POSIX >> line-atomic; no lock files (Windows Git Bash portability). Background subshell (INV-S9).
# SC-39 Case γ fix: two-key sidecar (toolu_* at PreToolUse; hex agent_id at PostToolUse).
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
    // PostToolUse: extract agentId from result content text (Case γ)
    // Format-stability assumption: Claude Code Agent tool result text contains "agentId: <hex>"
    // as a stable field. If Anthropic changes this format, RESULT_AGENT_ID will be empty,
    // SubagentStop correlation will fall back to graceful-degradation (unknown-agent), and
    // a stderr warning will be emitted so the format change is detectable in hook logs.
    const resultText=(p.tool_response&&p.tool_response.content&&p.tool_response.content[0]&&p.tool_response.content[0].text)||'';
    const m=resultText.match(/agentId:\\s*([a-f0-9]{10,20})/i);
    console.log('RESULT_AGENT_ID='+q(m?m[1]:''));
  } catch { console.log('HOOK_EVENT=\"\"'); }
});" 2>/dev/null || echo 'HOOK_EVENT=""')"
# Bug 1 fix: filter by "Agent" (not "Task") — the actual tool name for sub-agent dispatches.
# Also allow PostToolUse so we can write the hex-key sidecar index entry.
[ "$HOOK_EVENT" = "PreToolUse" ] && [ "$TOOL_NAME" != "Agent" ] && exit 0
[ "$HOOK_EVENT" = "PostToolUse" ] && [ "$TOOL_NAME" != "Agent" ] && exit 0
[ "$HOOK_EVENT" != "PreToolUse" ] && [ "$HOOK_EVENT" != "PostToolUse" ] && [ "$HOOK_EVENT" != "SubagentStop" ] && exit 0
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
  # DISPATCHED: tool_use_id is the primary key (toolu_* format)
  DID="${TOOL_USE_ID:-}"
  [ -z "$DID" ] && DID="$(node -e 'const c=require("crypto");console.log(c.randomUUID())' 2>/dev/null || echo "gen-$(date +%s)")"
  ATYPE="${SUBAGENT_TYPE:-unknown-agent}"
  [ -z "$ATYPE" ] && ATYPE="unknown-agent"
  # Write sidecar entry keyed by tool_use_id (toolu_*) — no hex agent_id yet (Case γ)
  # Field name: agent_type per Decision 023 schema. IMP-1 deferred a rename to subagent_type
  # for schema parity with tool_input.subagent_type; kept as agent_type for dispatch.jsonl stability.
  printf '%s\n' "{\"dispatch_id\":\"${DID}\",\"tool_use_id\":\"${DID}\",\"agent_type\":\"${ATYPE}\",\"model\":\"${MODEL}\"}" >> "$SIDECAR"
  # DISPATCHED row: 10 fields (Decision 023 + tool_use_id extension)
  printf '%s\n' "{\"event\":\"DISPATCHED\",\"dispatch_id\":\"${DID}\",\"agent_type\":\"${ATYPE}\",\"model\":\"${MODEL}\",\"parent_session_id\":\"${PARENT_SID}\",\"bg\":true,\"ts_ms\":${TS_MS},\"outcome\":null,\"tokens_used\":null,\"tool_use_id\":\"${DID}\"}" >> "$DISPATCH_JSONL"
elif [ "$HOOK_EVENT" = "PostToolUse" ]; then
  # PostToolUse-Agent: extract hex agentId from result text and write second sidecar index entry.
  # This enables SubagentStop to look up by hex agent_id → retrieve tool_use_id.
  HEX_ID="${RESULT_AGENT_ID:-}"
  # Warn if agentId could not be extracted — indicates format change in Agent tool result text.
  if [ -z "$HEX_ID" ]; then
    printf '[WARN] dispatch-jsonl-recorder: PostToolUse-Agent: RESULT_AGENT_ID empty — agentId pattern not found in result text. SubagentStop correlation will degrade to unknown-agent.\n' >&2
  fi
  ORIG_TID="${TOOL_USE_ID:-}"
  if [ -n "$HEX_ID" ] && [ -n "$ORIG_TID" ] && [ -f "$SIDECAR" ]; then
    # Find the sidecar entry for this tool_use_id to retrieve agent_type + model
    MATCH="$(grep "\"tool_use_id\":\"${ORIG_TID}\"" "$SIDECAR" | tail -1 || true)"
    if [ -n "$MATCH" ]; then
      eval "$(printf '%s' "$MATCH" | node -e "
let s=''; process.stdin.on('data',c=>s+=c);
process.stdin.on('end',()=>{ try{const p=JSON.parse(s);
  console.log('ATYPE='+JSON.stringify(p.agent_type||'unknown-agent'));
  console.log('MODEL='+JSON.stringify(p.model||'unknown'));
}catch{console.log('ATYPE=\"unknown-agent\"\nMODEL=\"unknown\"');} });" 2>/dev/null || echo 'ATYPE="unknown-agent"')"
      # Write hex-keyed sidecar entry: key = hex agent_id, value includes tool_use_id for back-ref
      # agent_type field name: Decision 023 canonical. IMP-1 deferred rename to subagent_type.
      printf '%s\n' "{\"dispatch_id\":\"${HEX_ID}\",\"tool_use_id\":\"${ORIG_TID}\",\"agent_type\":\"${ATYPE}\",\"model\":\"${MODEL}\"}" >> "$SIDECAR"
    fi
  fi
  # PostToolUse does NOT write to dispatch.jsonl (no event row — only sidecar enrichment)
else
  # SubagentStop: look up hex agent_id in sidecar to retrieve tool_use_id (Case γ)
  LID="${AGENT_ID:-}"; ATYPE="unknown-agent"; MODEL="unknown"; TOOL_USE_ID_FOUND=""
  if [ -n "$LID" ] && [ -f "$SIDECAR" ]; then
    MATCH="$(grep "\"dispatch_id\":\"${LID}\"" "$SIDECAR" | tail -1 || true)"
    if [ -n "$MATCH" ]; then
      eval "$(printf '%s' "$MATCH" | node -e "
let s=''; process.stdin.on('data',c=>s+=c);
process.stdin.on('end',()=>{ try{const p=JSON.parse(s);
  console.log('ATYPE='+JSON.stringify(p.agent_type||'unknown-agent'));
  console.log('MODEL='+JSON.stringify(p.model||'unknown'));
  console.log('TOOL_USE_ID_FOUND='+JSON.stringify(p.tool_use_id||''));
}catch{console.log('ATYPE=\"unknown-agent\"\nMODEL=\"unknown\"\nTOOL_USE_ID_FOUND=\"\"');} });" 2>/dev/null || echo 'ATYPE="unknown-agent"')"
    fi
  fi
  case "${STATUS:-}" in
    DONE|done|ok) OUTCOME='"DONE"' ;; FAIL|fail|error) OUTCOME='"FAIL"' ;;
    BLOCKED|blocked) OUTCOME='"BLOCKED"' ;; *) OUTCOME='"DONE"' ;;
  esac
  # B.B.4: rewrite dispatch_id to tool_use_id so loadTaskFinishRecordsFromDispatchJsonl groupBy still works.
  # If no sidecar match found, fall back to hex agent_id (unknown-agent graceful degradation).
  # B.B.3: tool_use_id must be null (JSON null) on sidecar-miss; dispatch_id stays as hex agent_id.
  if [ -n "$TOOL_USE_ID_FOUND" ]; then
    DID="$TOOL_USE_ID_FOUND"
    TOOL_USE_ID_JSON="\"$TOOL_USE_ID_FOUND\""
  else
    DID="${LID:-unknown}"
    TOOL_USE_ID_JSON="null"
  fi
  # COMPLETED row: 10 fields (Decision 023 + tool_use_id extension)
  printf '%s\n' "{\"event\":\"COMPLETED\",\"dispatch_id\":\"${DID}\",\"agent_type\":\"${ATYPE}\",\"model\":\"${MODEL}\",\"parent_session_id\":\"${PARENT_SID}\",\"bg\":true,\"ts_ms\":${TS_MS},\"outcome\":${OUTCOME},\"tokens_used\":null,\"tool_use_id\":${TOOL_USE_ID_JSON}}" >> "$DISPATCH_JSONL"
fi
) </dev/null >/dev/null 2>&1 &
disown 2>/dev/null || true
exit 0
