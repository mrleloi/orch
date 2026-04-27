# Propagation

Subprocess TRACEPARENT propagation, log correlation, verifying e2e propagation.

## Subprocess Propagation

```typescript
async spawn(req: SpawnRequest): Promise<SpawnResult> {
  return this.tracing.withSpan(
    'orch.session_spawn',
    { ccs_profile: req.ccsProfile, runtime: 'claude-code' },
    async (span) => {
      const child = execa('ccs', [req.ccsProfile, '-p', req.prompt], {
        cwd: req.projectPath,
        env: {
          ...process.env,
          TRACEPARENT: req.tracingContext.traceparent,
          OTEL_SERVICE_NAME: `claude-code.${req.projectName}`,
          CLAUDE_CODE_ENABLE_TELEMETRY: '1',
          // Strip the nested-session guard
          CLAUDECODE: undefined,
        } as NodeJS.ProcessEnv,
      });

      span.setAttribute('process.pid', child.pid ?? -1);
      // ... handle child
    },
  );
}
```

Claude Code reads `TRACEPARENT` env var and nests its own spans as children of ours.

## Verifying Propagation

End-to-end check:
1. Start Orch daemon with OTEL enabled
2. Trigger queue item processing
3. Open Langfuse UI
4. Look for trace with `orch.queue_item` root span
5. Drill in — should see `orch.session_spawn` child
6. Should see `claude_code.interaction` nested under that (Claude Code's native span)

If `claude_code.interaction` is NOT nested → TRACEPARENT propagation broke. Check env vars passed to execa.

## Context: Claude Code Native OTEL

Claude Code emits:
- `claude_code.interaction` — root per user prompt
- `claude_code.llm_request` — each API call
- `claude_code.tool` — tool use (with permission + execution child spans)
- `claude_code.hook` — hook executions (if beta tracing enabled)

Attributes of interest:
- `gen_ai.request.model` — model used
- `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`
- `gen_ai.usage.cache_creation_input_tokens`, `gen_ai.usage.cache_read_input_tokens`

Orch reads these (via Langfuse API or OTEL collector) to compute:
- Context-full detection (Phase 3)
- Cost attribution
- Session duration
