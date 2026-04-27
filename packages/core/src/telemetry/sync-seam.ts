/**
 * Telemetry sync seam — opt-in upstream event forwarding.
 *
 * Default state: DISABLED. No data leaves the machine unless
 * `ORCH_TELEMETRY_SYNC=true` is set or `enabled: true` is passed
 * explicitly in TelemetrySyncOptions.
 *
 * Design: Decision 031 (NDJSON over HTTPS POST; pluggable sink; opt-in default OFF;
 * orthogonal to OTEL local pipeline).
 *
 * SC-46 contract (master plan §1 line 32): seam compiles; default OFF; injectable sink.
 *
 * Domain-pure: ZERO @nestjs/* imports. NestJS wiring is out of scope for 8.7.3.
 *
 * v2.3 note: HttpsNdjsonSink is a stub. It logs to console.debug and resolves
 * without making any network calls. The real endpoint wiring is a v2.4 deliverable
 * (Decision 031 §"Endpoint").
 */

// ── Public types ─────────────────────────────────────────────────────────────

/**
 * A single telemetry event to be forwarded upstream.
 *
 * Redaction is the caller's responsibility — this seam forwards what it receives.
 * See Decision 031 §"Redaction rules" for the PII policy.
 */
export interface TelemetryEvent {
  /** ISO 8601 UTC timestamp, e.g. "2026-04-27T10:00:00.000Z" */
  timestamp: string;
  /** Workflow domain — "coding" in v2.3 (domain-workflow.md §3) */
  domain: string;
  /** Dotted event type, e.g. "orch.task.completed" */
  event_type: string;
  /** Event-specific payload; MUST NOT contain PII per Decision 031 §"Redaction" */
  attributes: Record<string, unknown>;
}

/**
 * Pluggable sink interface — community implementations register here.
 *
 * Decision 031 §"Pluggable sink interface": built-in sinks are NoOpSink
 * (default) and HttpsNdjsonSink (stub). Custom sinks can be injected via
 * TelemetrySyncOptions.sink.
 */
export interface TelemetrySink {
  send(event: TelemetryEvent): Promise<void>;
}

/**
 * Constructor options for TelemetrySyncSeam.
 *
 * All fields are optional — safe to instantiate with no arguments.
 * Default behavior: disabled; NoOpSink; no endpoint configured.
 */
export interface TelemetrySyncOptions {
  /**
   * When true, emit() forwards events to the configured sink.
   * Default false. Also enabled by `ORCH_TELEMETRY_SYNC=true` env var.
   * Decision 031 §"Default state": env-var opt-in is the primary path.
   */
  enabled?: boolean;
  /**
   * Sink implementation to forward events to.
   * Default: NoOpSink (drops all events without side effect).
   */
  sink?: TelemetrySink;
  /**
   * Upstream endpoint URL.
   * Default: stub URL per Decision 031 §"Endpoint" (does not resolve in v2.3).
   * Override via `ORCH_TELEMETRY_ENDPOINT` env var.
   */
  endpoint?: string;
}

// ── Default stub endpoint ─────────────────────────────────────────────────────

/** Stub endpoint URL — does not resolve; v2.4 wires the real URL. */
const STUB_ENDPOINT = 'https://telemetry.orch.local/v1/events';

// ── Sink implementations ──────────────────────────────────────────────────────

/**
 * NoOpSink — discards all events without side effect.
 *
 * This is the default sink when telemetry sync is disabled or no custom sink
 * is provided. Satisfies Decision 031 §"Consequences" 8: "default OFF / failures
 * non-blocking" and "No data leaves local machine without explicit opt-in".
 */
export class NoOpSink implements TelemetrySink {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  send(_event: TelemetryEvent): Promise<void> {
    // intentional no-op — returns a resolved promise without side effect
    return Promise.resolve();
  }
}

/**
 * HttpsNdjsonSink — stub for v2.3.
 *
 * In v2.3 this sink logs the event to console.debug and resolves without making
 * any network calls. The real `fetch()` implementation is a v2.4 deliverable
 * (Decision 031 §"Endpoint" + §"Consequences" 11).
 *
 * Wire format (v2.4): NDJSON over HTTPS POST per Decision 031 §"Wire format".
 * One JSON event per line; server consumes line-by-line.
 */
export class HttpsNdjsonSink implements TelemetrySink {
  private readonly endpoint: string;

  constructor(endpoint: string) {
    this.endpoint = endpoint;
  }

  send(event: TelemetryEvent): Promise<void> {
    // v2.3 stub: log intent; no real network call (C9 — no fetch in tests or impl).
    // v2.4 will replace this body with a real fetch() to this.endpoint.
    console.debug(
      `[TelemetrySyncSeam] stub: would POST to ${this.endpoint} — ${JSON.stringify(event)}`,
    );
    return Promise.resolve();
  }
}

// ── TelemetrySyncSeam ─────────────────────────────────────────────────────────

/**
 * TelemetrySyncSeam — the primary public surface of this module.
 *
 * Instantiate once per process; inject a custom sink via opts.sink for testing
 * or for community sink implementations.
 *
 * Default behavior (no constructor arguments):
 *   - Disabled (emit() is a no-op).
 *   - Reads ORCH_TELEMETRY_SYNC env var to auto-enable.
 *   - Uses NoOpSink as the default sink.
 *   - Errors from sink.send() are swallowed (non-blocking per Decision 031 §"Consequences" 8).
 *
 * @example
 *   const seam = new TelemetrySyncSeam(); // disabled by default
 *   const seam = new TelemetrySyncSeam({ enabled: true, sink: myCustomSink });
 */
export class TelemetrySyncSeam {
  private readonly enabled: boolean;
  private readonly sink: TelemetrySink;

  constructor(opts?: TelemetrySyncOptions) {
    // Resolve enabled: explicit opt wins; then env var; then default OFF.
    const envEnabled = process.env['ORCH_TELEMETRY_SYNC'] === 'true';
    this.enabled = opts?.enabled ?? envEnabled;

    // Resolve sink: explicit injection wins; then derive from endpoint/default.
    if (opts?.sink !== undefined) {
      this.sink = opts.sink;
    } else if (this.enabled) {
      const endpoint =
        opts?.endpoint ??
        process.env['ORCH_TELEMETRY_ENDPOINT'] ??
        STUB_ENDPOINT;
      this.sink = new HttpsNdjsonSink(endpoint);
    } else {
      this.sink = new NoOpSink();
    }
  }

  /**
   * Emit a telemetry event.
   *
   * When disabled: returns immediately without calling sink.send().
   * When enabled: delegates to the configured sink; errors are swallowed
   * (graceful degradation — a failed sync must never crash the daemon).
   *
   * Decision 031 §"Consequences" 8: "default OFF / failures non-blocking".
   */
  async emit(event: TelemetryEvent): Promise<void> {
    if (!this.enabled) {
      return;
    }
    try {
      await this.sink.send(event);
    } catch {
      // Swallow: telemetry sync failure must not bubble up to daemon logic.
      // Caller can observe failures by injecting a sink that records errors.
    }
  }

  /**
   * Returns true if telemetry sync is currently enabled.
   *
   * Callers (e.g. startup logs) can use this to print:
   * "telemetry sync: disabled (set ORCH_TELEMETRY_SYNC=true to enable)"
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}
