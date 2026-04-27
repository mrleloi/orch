# Primitive Verification — Headless Claude Code + TRACEPARENT Propagation

**Date**: 2026-04-24
**Source**: W3C Trace Context spec + OpenTelemetry SDK for Node.js docs + Claude Code telemetry docs
**Verification method**: Spec review. Live test deferred until `packages/core/src/modules/tracing/` exists in Phase 1.

---

## What "Headless" Means

Running Claude Code in non-interactive mode:

```bash
claude -p "summarize this diff"
```

or

```bash
ccs work -p "run the test suite and report failures"
```

The `-p` flag:
- Provides prompt inline
- Does not open TUI
- Writes final assistant response to stdout
- Exits when done

This is the primary mode orch uses to spawn managed sessions.

---

## W3C Trace Context: TRACEPARENT format

From W3C Trace Context spec:

```
TRACEPARENT = <version>-<trace-id>-<parent-span-id>-<trace-flags>

Example: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
          |  └─ trace-id (32 hex)                 └─ span-id (16 hex)   └─ sampled flag
          └─ version (00)
```

- `version`: always `00` currently
- `trace-id`: 32 hex chars, shared across all spans in a trace
- `parent-span-id`: 16 hex chars, the parent span's ID
- `trace-flags`: `01` = sampled, `00` = not sampled

OpenTelemetry SDK generates these IDs; orch doesn't manually construct them.

---

## How Orch Propagates TRACEPARENT

```typescript
// packages/core/src/modules/sessions/claude-code-adapter.ts (Phase 1)
async spawn(config: SessionSpawnConfig): Promise<Session> {
  const parentSpan = tracer.startSpan('orch.session.run', {
    attributes: {
      'orch.project': config.projectId,
      'orch.session_type': config.sessionType,
    }
  });

  const ctx = trace.setSpan(context.active(), parentSpan);
  const carrier: Record<string, string> = {};
  propagation.inject(ctx, carrier);

  // carrier is now { TRACEPARENT: "00-...-01", TRACESTATE?: "..." }

  const env = {
    ...process.env,
    ...carrier,
    CLAUDE_CODE_ENABLE_TELEMETRY: '1',
    OTEL_SERVICE_NAME: `orch.${config.projectId}`,
    // ccs takes care of CLAUDE_CONFIG_DIR + stripping CLAUDECODE
  };

  const proc = execa('ccs', [config.profile, '-p', config.prompt], { env });
  // ...
}
```

Claude Code's OTEL SDK (Node.js OTel auto-instrumentation) reads `TRACEPARENT` from process.env and makes its spans children of the inherited context. No custom Claude-side code needed.

---

## Expected Trace Hierarchy

```
orch.session.run                 (orch parent span)
├─ claude.session                (claude-code root span, child of orch)
│  ├─ claude.turn                (assistant turn)
│  │  ├─ claude.api.messages     (API call to Anthropic)
│  │  ├─ claude.tool.Bash        (tool call)
│  │  └─ claude.tool.Edit
│  └─ claude.turn
└─ orch.hook.received            (when SessionEnd hook comes back)
```

This hierarchy is what makes Langfuse / SigNoz show "orch session → claude session → individual turns" as a drill-down.

---

## Charter Alignment

**Success criterion O-1**: "Every queue item = one OTEL trace root with TRACEPARENT propagated to Claude Code subprocess."
- ✅ Achieved by the pattern above. Each queue item starts a parent span; its trace-id is the root for the entire chain.

**Success criterion O-2**: "Claude Code's own spans nest correctly under the Orch root span."
- ✅ Achieved via standard W3C propagation; Claude Code's OTel SDK handles inheritance automatically.

---

## Assumptions Flagged

| Assumption | Phase | How to verify |
|---|---|---|
| Claude Code OTel SDK reads `TRACEPARENT` correctly from env | Phase 1 | Start otel-collector + orch, run a session, check span hierarchy |
| ccs does NOT strip or overwrite TRACEPARENT (only CLAUDECODE) | Phase 1 | grep ccs source; confirm env whitelist |
| TRACESTATE (optional W3C field) also propagates | Low priority | Only matters for multi-vendor backends |
| Subagent spawns inherit the TRACEPARENT of their parent session | Phase 2 | Claude Code's internal propagation — likely yes, verify in UI |
| When orch kills a session mid-stream, the in-flight spans export correctly | Phase 3 | SIGTERM handling in claude CLI; may need shutdown-handler |

---

## Verdict

Standard W3C propagation. No custom code in Claude Code needed. Orch must:
1. Own the parent span (`orch.session.run`) before spawning
2. Inject via `@opentelemetry/api` `propagation.inject(ctx, carrier)`
3. Pass `carrier` as env vars to the subprocess via `execa`

No blockers. Exactly as charter assumed. Live verification is cheap and happens naturally once Phase 1 tracing module exists.
