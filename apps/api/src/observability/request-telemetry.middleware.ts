import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { MetricsRegistry } from './metrics-registry.service';
import { ObservabilityAlertService } from './observability-alert.service';
import { StructuredLogger } from './structured-logger.service';

function normalizedRoute(request: Request) {
  return request.path
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':id')
    .replace(/\/\d+(?=\/|$)/g, '/:id')
    .slice(0, 200);
}

@Injectable()
export class RequestTelemetryMiddleware implements NestMiddleware {
  constructor(
    private readonly metrics: MetricsRegistry,
    private readonly alerts: ObservabilityAlertService,
    private readonly logger: StructuredLogger,
  ) {}

  use(request: Request, response: Response, next: NextFunction) {
    const started = process.hrtime.bigint();
    this.metrics.requestStarted();
    let completed = false;
    const finish = () => {
      if (completed) return;
      completed = true;
      const durationMs = Number(process.hrtime.bigint() - started) / 1_000_000;
      const route = normalizedRoute(request);
      this.metrics.requestCompleted(
        request.method,
        route,
        response.statusCode,
        durationMs / 1_000,
      );
      this.alerts.recordHttp(response.statusCode, durationMs, route);
      this.logger.event(
        response.statusCode >= 500 ? 'error' : 'info',
        'http.request.completed',
        {
          method: request.method,
          route,
          statusCode: response.statusCode,
          durationMs: Math.round(durationMs * 100) / 100,
          userAgent: request.header('user-agent')?.slice(0, 200),
        },
      );
    };
    response.once('finish', finish);
    response.once('close', finish);
    next();
  }
}
