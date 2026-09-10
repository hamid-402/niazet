import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import type { ApiErrorEnvelope } from '../http/api-contract';
import { StructuredLogger } from '../../observability/structured-logger.service';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: StructuredLogger) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const body = isHttpException
      ? exception.getResponse()
      : { message: 'خطای غیرمنتظره سرور رخ داد.' };

    if (!isHttpException) {
      this.logger.error(exception, 'ExceptionFilter');
    }

    const normalized =
      typeof body === 'string'
        ? { message: body }
        : (body as Record<string, unknown>);

    const rawMessage = normalized.message;
    const message =
      typeof rawMessage === 'string' ||
      (Array.isArray(rawMessage) &&
        rawMessage.every((item): item is string => typeof item === 'string'))
        ? rawMessage
        : 'Request failed.';
    const envelope = {
      statusCode: status,
      ...normalized,
      error: {
        code:
          typeof normalized.error === 'string'
            ? normalized.error
            : `HTTP_${status}`,
        message,
        details: normalized.details,
      },
      correlationId: request.correlationId ?? 'unavailable',
      path: request.originalUrl,
      timestamp: new Date().toISOString(),
    } satisfies ApiErrorEnvelope & Record<string, unknown>;

    response.status(status).json(envelope);
  }
}
