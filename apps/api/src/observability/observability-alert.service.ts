import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MetricsRegistry } from './metrics-registry.service';
import { StructuredLogger } from './structured-logger.service';

interface Sample {
  at: number;
  failed: boolean;
}

export function errorRate(samples: Array<{ failed: boolean }>) {
  return samples.length === 0
    ? 0
    : samples.filter((sample) => sample.failed).length / samples.length;
}

@Injectable()
export class ObservabilityAlertService {
  private readonly samples: Sample[] = [];
  private readonly lastAlert = new Map<string, number>();

  constructor(
    private readonly config: ConfigService,
    private readonly metrics: MetricsRegistry,
    private readonly logger: StructuredLogger,
  ) {}

  recordHttp(status: number, durationMs: number, route: string) {
    const now = Date.now();
    const windowMs =
      Number(this.config.get('ALERT_WINDOW_SECONDS') ?? 300) * 1_000;
    this.samples.push({ at: now, failed: status >= 500 });
    while (this.samples[0] && this.samples[0].at < now - windowMs)
      this.samples.shift();

    const minimum = Number(this.config.get('ALERT_MIN_REQUESTS') ?? 20);
    const threshold = Number(this.config.get('ALERT_HTTP_5XX_RATE') ?? 0.1);
    const rate = errorRate(this.samples);
    if (this.samples.length >= minimum && rate >= threshold) {
      this.trigger('http_5xx_rate', 'critical', {
        rate,
        requests: this.samples.length,
      });
    }

    const slowMs = Number(this.config.get('ALERT_SLOW_REQUEST_MS') ?? 5_000);
    if (durationMs >= slowMs)
      this.trigger('slow_http_request', 'warning', { durationMs, route });
  }

  recordDependency(name: string, ready: boolean, reason?: string) {
    if (!ready) {
      this.trigger(`dependency_not_ready_${name}`, 'critical', {
        dependency: name,
        reason: reason ?? 'unknown',
      });
    }
  }

  private trigger(
    type: string,
    severity: 'critical' | 'warning',
    evidence: Record<string, unknown>,
  ) {
    const now = Date.now();
    const cooldownMs =
      Number(this.config.get('ALERT_COOLDOWN_SECONDS') ?? 300) * 1_000;
    if (now - (this.lastAlert.get(type) ?? 0) < cooldownMs) return;
    this.lastAlert.set(type, now);
    this.metrics.alertTriggered(type, severity);
    this.logger.event(
      severity === 'critical' ? 'error' : 'warn',
      'alert.triggered',
      {
        alertType: type,
        severity,
        evidence,
      },
    );
  }
}
