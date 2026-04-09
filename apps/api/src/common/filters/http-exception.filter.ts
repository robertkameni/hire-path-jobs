import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const correlationId = request.headers['x-correlation-id'];
    const body = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      correlationId,
      error: this.extractError(exception),
      message: this.extractMessage(exception),
    };
    this.logger.error(
      `[${correlationId ?? 'no-id'}] ${request.method} ${request.url} → ${status}`,
      exception instanceof Error ? exception.stack : String(exception),
    );
    response.status(status).json(body);
  }

  private extractMessage(exception: unknown) {
    if (exception instanceof HttpException) {
      const res = exception.getResponse();
      if (typeof res === 'string') return res;
      if (typeof res === 'object' && res !== null && 'message' in res) {
        // @ts-ignore
        return res.message;
      }
    }
    return 'Internal server error';
  }

  private extractError(exception: unknown) {
    if (exception instanceof HttpException) {
      const res = exception.getResponse();
      if (typeof res === 'object' && res !== null && 'error' in res) {
        // @ts-ignore
        return res.error;
      }
      return exception.constructor.name;
    }
    return 'InternalServerError';
  }
}
