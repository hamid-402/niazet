import { Global, Module } from '@nestjs/common';
import { MetricsRegistry } from './metrics-registry.service';
import { ObservabilityAlertService } from './observability-alert.service';
import { ObservabilityController } from './observability.controller';
import { ObservabilityTokenGuard } from './observability-token.guard';
import { RequestContextService } from './request-context.service';
import { RequestTelemetryMiddleware } from './request-telemetry.middleware';
import { StructuredLogger } from './structured-logger.service';

@Global()
@Module({
  controllers: [ObservabilityController],
  providers: [
    MetricsRegistry,
    ObservabilityAlertService,
    ObservabilityTokenGuard,
    RequestContextService,
    RequestTelemetryMiddleware,
    StructuredLogger,
  ],
  exports: [
    MetricsRegistry,
    ObservabilityAlertService,
    RequestContextService,
    RequestTelemetryMiddleware,
    StructuredLogger,
  ],
})
export class ObservabilityModule {}
