---
name: otel-tracing
description: Use when editing `packages/core/src/modules/tracing/**` or any code that creates spans, records metrics, propagates TRACEPARENT, or reads/writes OTEL env vars. Also use when the user mentions Langfuse, SigNoz, OTLP, or trace export.
tools: [Read, Bash, Grep, Edit]
archetype: reference
---

# OpenTelemetry — Orch Patterns

## When to Use

- Setting up OTEL SDK
- Adding spans around new operations
- Propagating `TRACEPARENT` to spawned processes
- Recording metrics
- Debugging missing spans or trace gaps
- Configuring exporters (Langfuse, SigNoz, generic OTLP)

## Reference Index

| Topic | File | When to read |
|-------|------|--------------|
| Spans | `.claude/skills/otel-tracing/references/spans.md` | adding/debugging spans, TracingService API, metrics, log correlation |
| Config | `.claude/skills/otel-tracing/references/config.md` | SDK init, bootstrap in main.ts, env vars, shutdown |
| Exporters | `.claude/skills/otel-tracing/references/exporters.md` | Langfuse / SigNoz / OTLP collector wiring |
| Propagation | `.claude/skills/otel-tracing/references/propagation.md` | subprocess TRACEPARENT, e2e verification, Claude Code native OTEL |

## Quick Reference: withSpan

```typescript
async processItem(itemId: string): Promise<void> {
  await this.tracing.withSpan(
    'orch.queue_item',
    { 'queue_item.id': itemId, 'project.id': item.projectId },
    async (span) => {
      const result = await this.handle(item);
      span.addEvent('handled', { 'result.size': result.length });
      span.setAttribute('outcome', 'ok');
      return result;
    },
  );
}
```

`withSpan` handles: start span, set OK status on success, record exception + ERROR status on throw, end span. Always use it instead of manual span lifecycle.

## Quick Reference: Subprocess TRACEPARENT

```typescript
const child = execa('ccs', [profile, '-p', prompt], {
  env: {
    ...process.env,
    TRACEPARENT: this.tracing.getActiveTraceparent(),
    OTEL_SERVICE_NAME: `claude-code.${projectName}`,
    CLAUDE_CODE_ENABLE_TELEMETRY: '1',
  },
});
```

Claude Code reads `TRACEPARENT` and nests its spans under ours.

## Anti-Patterns (top 3)

- Creating spans without ending them (memory leak — use `withSpan`)
- Forgetting OTEL env vars in spawned subprocess env (breaks propagation)
- Recording secrets as span attributes (`prompt` may contain secrets)

See `.claude/skills/otel-tracing/references/spans.md` for full anti-patterns list.
