import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const correlationId = request.headers['x-correlation-id'];

    const body = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      correlationId,
      error: this.extractError(exception),
      message: this.extractMessage(exception),
    };

    const logMessage = `[${correlationId ?? 'no-id'}] ${request.method} ${request.url} → ${status}`;
    if (status >= 500) {
      this.logger.error(logMessage, exception instanceof Error ? exception.stack : String(exception));
    } else {
      this.logger.warn(logMessage);
    }

    response.status(status).json(body);
  }

  private extractMessage(exception: unknown) {
    if (exception instanceof HttpException) {
      const res = exception.getResponse();
      if (typeof res === 'string') return res;
      if (typeof res === 'object' && res !== null && 'message' in res) {
        return res.message;
      }
    }
    return 'Internal server error';
  }

  private extractError(exception: unknown) {
    if (exception instanceof HttpException) {
      const res = exception.getResponse();

      if (typeof res === 'object' && res !== null && 'error' in res) {
        return res.error;
      }

      return exception.constructor.name;
    }
    return 'InternalServerError';
  }
}
