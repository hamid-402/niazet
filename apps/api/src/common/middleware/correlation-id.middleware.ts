import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export const CORRELATION_ID_HEADER = 'x-correlation-id';

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction) {
    const incoming = request.header(CORRELATION_ID_HEADER)?.trim();
    const correlationId = incoming?.slice(0, 128) || randomUUID();
    request.correlationId = correlationId;
    response.setHeader(CORRELATION_ID_HEADER, correlationId);
    next();
  }
}

declare module 'express-serve-static-core' {
  interface Request {
    correlationId?: string;
  }
}
