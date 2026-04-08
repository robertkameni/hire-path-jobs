import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Request, Response, NextFunction } from 'express';

/**
 * Assigns a unique correlation ID to every request.
 * Reads x-correlation-id from the incoming headers if present (allows clients to
 * propagate their own trace ID), otherwise generates a new UUID.
 * The ID is echoed back in the response header and is available to all downstream
 * handlers and log messages via req.headers['x-correlation-id'].
 */
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const correlationId =
      (req.headers['x-correlation-id'] as string | undefined) ?? randomUUID();

    req.headers['x-correlation-id'] = correlationId;
    res.setHeader('x-correlation-id', correlationId);

    next();
  }
}
