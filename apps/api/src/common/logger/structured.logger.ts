import { Logger } from '@nestjs/common';

export interface LogFields {
  jobId?: string;
  step?: string;
  durationMs?: number;
  status?: string;
  attempt?: number;
  model?: string;
  error?: string;
  [key: string]: unknown;
}

/**
 * Thin extension of NestJS Logger that writes structured JSON to the message
 * field so log aggregators (Datadog, Loki, CloudWatch, etc.) can index fields
 * without a parsing rule.
 *
 * Usage:
 *   private readonly logger = new StructuredLogger(MyService.name);
 *   this.logger.event('step_complete', { step: 'parse', durationMs: 1200, status: 'success' });
 */
export class StructuredLogger extends Logger {
  event(message: string, fields: LogFields = {}): void {
    super.log(
      JSON.stringify({
        event: message,
        ts: new Date().toISOString(),
        ...fields,
      }),
    );
  }

  warnEvent(message: string, fields: LogFields = {}): void {
    super.warn(
      JSON.stringify({
        event: message,
        ts: new Date().toISOString(),
        ...fields,
      }),
    );
  }

  errorEvent(message: string, fields: LogFields = {}): void {
    super.error(
      JSON.stringify({
        event: message,
        ts: new Date().toISOString(),
        ...fields,
      }),
    );
  }
}
