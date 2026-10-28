import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

export interface StandardErrorResponse {
  statusCode: number;
  timestamp: string;
  path: string;
  correlationId: string;
  error: string;
  message: string | string[];
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { correlationId?: string }>();

    const correlationId =
      request.correlationId ||
      (request.headers?.['x-correlation-id'] as string) ||
      'unknown-correlation-id';

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let error = 'Internal Server Error';
    let message: string | string[] = 'An unexpected error occurred.';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
        error = exception.name.replace('Exception', '');
      } else if (
        typeof exceptionResponse === 'object' &&
        exceptionResponse !== null
      ) {
        const resObj = exceptionResponse as Record<string, any>;
        message = resObj.message || exception.message;
        error = resObj.error || exception.name.replace('Exception', '');
      }
    } else if (exception instanceof Error) {
      // In production/test, do not leak raw database errors or stack traces to clients
      this.logger.error(
        `[${correlationId}] Unhandled exception at ${request.method} ${request.url}: ${exception.message}`,
        exception.stack,
      );
      error = 'Internal Server Error';
      message = 'An unexpected server error occurred.';
    }

    const errorPayload: StandardErrorResponse = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url?.split('?')[0] || request.url,
      correlationId,
      error,
      message,
    };

    if (status >= 400 && status < 500) {
      this.logger.warn(
        `[${correlationId}] HTTP ${status} ${error} at ${request.method} ${request.url}: ${JSON.stringify(message)}`,
      );
    }

    response.status(status).json(errorPayload);
  }
}
