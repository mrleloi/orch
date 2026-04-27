/**
 * ITracer — domain-level tracing contract, decoupled from any specific OTEL SDK.
 *
 * Domain code instruments spans without importing `@opentelemetry/api` directly;
 * the NestJS TracingModule provides the concrete impl wired to the LGTM stack (D6).
 */

/**
 * ISpan — single unit of tracing work.
 *
 * Modelled after the OpenTelemetry Span API; concrete impl delegates to OTEL.
 */
export interface ISpan {
  /** Attach a key/value attribute to this span. */
  setAttribute(key: string, value: string | number | boolean): void;

  /** Add a named event to the span timeline with optional structured attributes. */
  addEvent(name: string, attrs?: Record<string, unknown>): void;

  /** Mark the span as succeeded or failed. */
  setStatus(status: 'ok' | 'error'): void;

  /** Record an exception on the span without ending it. */
  recordException(err: unknown): void;

  /** Finalize the span and flush to the exporter. */
  end(): void;
}

/**
 * ITracer — the tracing entry-point used by domain services and adapters.
 *
 * `withSpan` is the preferred API; `startSpan` is available for cases where
 * the span must outlive a single async call (e.g. long-running stream consumers).
 */
export interface ITracer {
  /**
   * Start a new span manually.
   *
   * Caller is responsible for calling `span.end()` in all code paths.
   */
  startSpan(name: string, attrs?: Record<string, unknown>): ISpan;

  /**
   * Execute `fn` inside a new child span, ending the span when `fn` settles.
   *
   * Preferred over `startSpan` because end() is guaranteed even on rejection.
   */
  withSpan<T>(
    name: string,
    fn: (span: ISpan) => Promise<T>,
    attrs?: Record<string, unknown>,
  ): Promise<T>;
}
