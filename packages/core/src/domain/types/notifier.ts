/**
 * INotifier — structured notification delivery for daemon-level events.
 *
 * Domain code notifies the operator without knowing which channel (Telegram,
 * Web UI, log-only) handles delivery — adapters are wired by the NestJS layer.
 */
export interface INotifier {
  /**
   * Emit a notification at the given severity level.
   *
   * `context` carries structured fields surfaced alongside the message in logs
   * and channel adapters (e.g. sessionId, projectId) without string-interpolation.
   */
  notify(
    level: 'info' | 'warn' | 'error',
    message: string,
    context?: Record<string, unknown>,
  ): Promise<void>;
}
