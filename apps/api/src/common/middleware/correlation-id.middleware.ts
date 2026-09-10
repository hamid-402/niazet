import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { RequestContextService } from '../../observability/request-context.service';
import { createTraceContext } from '../../observability/trace-context';

export const CORRELATION_ID_HEADER = 'x-correlation-id';

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  constructor(private readonly context: RequestContextService) {}

  use(request: Request, response: Response, next: NextFunction) {
    const incoming = request.header(CORRELATION_ID_HEADER)?.trim();
    const correlationId =
      incoming && /^[A-Za-z0-9._:-]{1,128}$/.test(incoming)
        ? incoming
        : randomUUID();
    const trace = createTraceContext(request.header('traceparent'));
    request.correlationId = correlationId;
    request.traceId = trace.traceId;
    request.spanId = trace.spanId;
    response.setHeader(CORRELATION_ID_HEADER, correlationId);
    response.setHeader('traceparent', trace.traceparent);
    this.context.run(
      { correlationId, traceId: trace.traceId, spanId: trace.spanId },
      next,
    );
  }
}

declare module 'express-serve-static-core' {
  interface Request {
    correlationId?: string;
    traceId?: string;
    spanId?: string;
  }
}
