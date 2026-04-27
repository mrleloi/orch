/**
 * Tracing-specific domain errors.
 *
 * I-12: Adapter failures (SDK init, exporter errors) are wrapped here before
 * bubbling to NestJS — raw OTel errors never escape the tracing adapter boundary.
 */

import { DomainError } from '../../domain/errors.js';

/**
 * Thrown when the OpenTelemetry SDK fails to initialise.
 *
 * The daemon MUST continue running without tracing when this error occurs
 * (I-12: adapter failure isolation — warn-and-continue).
 */
export class TracingInitError extends DomainError {
  constructor(message: string, options?: { cause?: unknown }) {
    super('TRACING_INIT_ERROR', message, options);
  }
}
