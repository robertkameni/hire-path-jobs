import { Logger } from '@nestjs/common';

export class StructuredLogger extends Logger {
  event(message: string, fields: Record<string, unknown> = {}) {
    super.log(
      JSON.stringify({
        event: message,
        ts: new Date().toISOString(),
        ...fields,
      }),
    );
  }

  warnEvent(message: string, fields: Record<string, unknown> = {}) {
    super.warn(
      JSON.stringify({
        event: message,
        ts: new Date().toISOString(),
        ...fields,
      }),
    );
  }

  errorEvent(message: string, fields: Record<string, unknown> = {}) {
    super.error(
      JSON.stringify({
        event: message,
        ts: new Date().toISOString(),
        ...fields,
      }),
    );
  }
}
