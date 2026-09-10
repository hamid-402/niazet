import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { MetricsRegistry } from './metrics-registry.service';
import { ObservabilityTokenGuard } from './observability-token.guard';

@Controller()
export class ObservabilityController {
  constructor(private readonly metrics: MetricsRegistry) {}

  @Public()
  @UseGuards(ObservabilityTokenGuard)
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  @Get('metrics')
  metricsEndpoint() {
    return this.metrics.render();
  }
}
