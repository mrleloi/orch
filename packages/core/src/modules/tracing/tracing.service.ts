/**
 * TracingService — injectable wrapper around the OpenTelemetry tracing API.
 *
 * Provides three high-level operations:
 *  1. withSpan()             — run an async fn inside a named span
 *  2. getActiveTraceparent() — build W3C traceparent from current context
 *  3. injectTraceparentIntoEnv() — inject TRACEPARENT into a subprocess env copy (D7)
 *  4. getTracer()            — raw Tracer for callers that need fine-grained control
 *
 * D7: TRACEPARENT uses W3C propagation ONLY via propagation.inject(ctx, carrier).
 *     No custom string concatenation.
 *
 * I-9: Structured log calls that use this service's withSpan will automatically
 *      carry trace_id via pino-otel (pino-otel.ts) — no manual injection needed.
 *
 * I-12: All SDK errors are caught and either logged or re-thrown as DomainError.
 */

import { Injectable } from '@nestjs/common';
import {
  context,
  propagation,
  SpanStatusCode,
  trace,
  type AttributeValue,
  type Span,
  type Tracer,
} from '@opentelemetry/api';
import type { ISpan, ITracer } from '../../domain/types/tracer.js';

/** Attribute value type alias matching the OTel API surface. */
export type AttrValue = AttributeValue;

/** Build a domain ISpan wrapper around a raw OTEL Span. */
function wrapSpan(otelSpan: Span): ISpan {
  return {
    setAttribute(key: string, value: string | number | boolean): void {
      otelSpan.setAttribute(key, value);
    },
    addEvent(name: string, attrs?: Record<string, unknown>): void {
      otelSpan.addEvent(
        name,
        attrs as Record<string, AttributeValue> | undefined,
      );
    },
    setStatus(status: 'ok' | 'error'): void {
      otelSpan.setStatus({
        code: status === 'ok' ? SpanStatusCode.OK : SpanStatusCode.ERROR,
      });
    },
    recordException(err: unknown): void {
      otelSpan.recordException(
        err instanceof Error ? err : new Error(String(err)),
      );
    },
    end(): void {
      otelSpan.end();
    },
  };
}

@Injectable()
export class TracingService implements ITracer {
  /**
   * Execute `fn` inside a new span named `name`.
   *
   * On success, span is ended with OK status.
   * On error, exception is recorded and span status is set to ERROR; then the
   * error is re-thrown so the caller can handle it.
   *
   * @param name   Span name (human-readable, e.g. "session.spawn")
   * @param fn     Async function receiving the active ISpan
   * @param attrs  Optional span attributes applied on creation
   */
  async withSpan<T>(
    name: string,
    fn: (span: ISpan) => Promise<T>,
    attrs?: Record<string, AttributeValue>,
  ): Promise<T> {
    const tracer = this.getTracer('@orch/core');
    const options = attrs !== undefined ? { attributes: attrs } : {};
    return tracer.startActiveSpan(name, options, async (otelSpan) => {
      const span = wrapSpan(otelSpan);
      try {
        const result = await fn(span);
        otelSpan.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (err) {
        otelSpan.recordException(
          err instanceof Error ? err : new Error(String(err)),
        );
        otelSpan.setStatus({
          code: SpanStatusCode.ERROR,
          message: err instanceof Error ? err.message : String(err),
        });
        throw err;
      } finally {
        otelSpan.end();
      }
    });
  }

  /**
   * Returns the W3C traceparent string for the currently active span, or
   * `undefined` if no span is active.
   *
   * Format: `00-<traceId>-<spanId>-<flags>` (55 chars)
   *
   * D7: Uses propagation.inject to build the value — no custom string formatting.
   */
  getActiveTraceparent(): string | undefined {
    const carrier: Record<string, string> = {};
    propagation.inject(context.active(), carrier);
    return carrier['traceparent'];
  }

  /**
   * Returns a copy of `env` with W3C TRACEPARENT (and TRACESTATE if present)
   * injected from the currently active span context.
   *
   * The original `env` object is NOT mutated (I-14 principle: no surprise side effects).
   *
   * D7: Uses propagation.inject — standard W3C propagation only.
   *
   * @param env  Process environment to augment (typically `process.env` clone)
   */
  injectTraceparentIntoEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
    const carrier: Record<string, string> = {};
    propagation.inject(context.active(), carrier);

    // Return a new env object — original untouched
    const result: NodeJS.ProcessEnv = { ...env };
    for (const [key, value] of Object.entries(carrier)) {
      result[key.toUpperCase()] = value;
    }
    return result;
  }

  /**
   * Start a new span manually (ITracer contract).
   *
   * Returns a thin ISpan wrapper around the OTEL Span.
   * Caller is responsible for calling end() in all code paths.
   */
  startSpan(name: string, attrs?: Record<string, unknown>): ISpan {
    const tracer = this.getTracer('@orch/core');
    const options =
      attrs !== undefined
        ? { attributes: attrs as Record<string, AttributeValue> }
        : {};
    const otelSpan = tracer.startSpan(name, options);
    return wrapSpan(otelSpan);
  }

  /**
   * Returns a Tracer scoped to the given `name` (typically the module name).
   *
   * Callers that need fine-grained span control should use this instead of
   * `withSpan` when the span lifecycle is not async-scoped.
   */
  getTracer(name: string): Tracer {
    return trace.getTracer(name);
  }
}
