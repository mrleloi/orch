# Spans

TracingService API + `withSpan` patterns + service usage examples.

## TracingService

```typescript
import { Injectable } from '@nestjs/common';
import { trace, context, SpanKind, SpanStatusCode } from '@opentelemetry/api';
import type { Span, Attributes } from '@opentelemetry/api';

@Injectable()
export class TracingService {
  private tracer = trace.getTracer('orch', '1.0.0');

  async withSpan<T>(
    name: string,
    attrs: Attributes,
    fn: (span: Span) => Promise<T>,
  ): Promise<T> {
    return this.tracer.startActiveSpan(name, { attributes: attrs }, async (span) => {
      try {
        const result = await fn(span);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (err) {
        span.recordException(err as Error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: (err as Error).message,
        });
        throw err;
      } finally {
        span.end();
      }
    });
  }

  addEvent(name: string, attrs?: Attributes): void {
    const span = trace.getActiveSpan();
    span?.addEvent(name, attrs);
  }

  getActiveTraceparent(): string | undefined {
    const span = trace.getActiveSpan();
    if (!span) return undefined;
    const ctx = span.spanContext();
    // W3C format: "00-{traceId}-{spanId}-{flags}"
    const flags = ctx.traceFlags.toString(16).padStart(2, '0');
    return `00-${ctx.traceId}-${ctx.spanId}-${flags}`;
  }
}
```

## Usage in Services

```typescript
async processQueueItem(itemId: string): Promise<void> {
  await this.tracing.withSpan(
    'orch.queue_item',
    {
      'queue_item.id': itemId,
      'project.id': item.projectId,
      'session_type': item.sessionType,
    },
    async (span) => {
      const handoff = await this.handoffBuilder.build(item);
      span.addEvent('handoff_built', { 'handoff.length': handoff.length });

      const session = await this.sessionService.spawn({
        projectId: item.projectId,
        queueItemId: itemId,
        prompt: handoff,
        tracingContext: { traceparent: this.tracing.getActiveTraceparent()! },
      });

      span.setAttribute('session.id', session.id);
      await this.awaitSessionEnd(session.id);
    },
  );
}
```

## Recording Metrics

```typescript
import { metrics } from '@opentelemetry/api';

const meter = metrics.getMeter('orch', '1.0.0');

const queuePendingGauge = meter.createObservableGauge('orch.queue.pending_count');
const sessionDurationHist = meter.createHistogram('orch.session.duration_seconds', {
  unit: 's',
});

// Counter
const completedCounter = meter.createCounter('orch.queue.completed_total');
completedCounter.add(1, { project: 'stockforge', session_type: 'FOCUSED_IMPL' });

// Histogram
sessionDurationHist.record(duration, { project, session_type });

// Observable gauge (callback registered once)
queuePendingGauge.addCallback((observer) => {
  for (const [projectId, count] of this.queueCounts) {
    observer.observe(count, { project: projectId });
  }
});
```

## Log Correlation

`nestjs-pino` with OTEL mixin:

```typescript
// pino config
{
  mixin: () => {
    const span = trace.getActiveSpan();
    if (!span) return {};
    const ctx = span.spanContext();
    return {
      trace_id: ctx.traceId,
      span_id: ctx.spanId,
    };
  },
}
```

Now every log line has `trace_id`. Langfuse or your log UI can join to traces.

## Anti-Patterns

- Creating spans without ending them (memory leak)
- Swallowing exceptions inside `withSpan` (span status stays OK on actual error)
- Recording secrets as span attributes (`prompt` can contain secrets!)
- Using global tracer without version
