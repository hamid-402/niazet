import { Injectable } from '@nestjs/common';

interface HttpLabels {
  method: string;
  route: string;
}

interface Histogram extends HttpLabels {
  count: number;
  sum: number;
  buckets: number[];
}

const DURATION_BUCKETS = [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

function escapeLabel(value: string) {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('\n', '\\n')
    .replaceAll('"', '\\"');
}

function labels(values: Readonly<Record<string, string>>) {
  return `{${Object.entries(values)
    .map(([key, value]) => `${key}="${escapeLabel(value)}"`)
    .join(',')}}`;
}

@Injectable()
export class MetricsRegistry {
  private activeRequests = 0;
  private readonly requests = new Map<
    string,
    { labels: HttpLabels & { status: string }; value: number }
  >();
  private readonly durations = new Map<string, Histogram>();
  private readonly jobs = new Map<string, number>();
  private readonly alerts = new Map<string, number>();
  private readonly dependencies = new Map<string, number>();

  requestStarted() {
    this.activeRequests += 1;
  }

  requestCompleted(
    method: string,
    route: string,
    status: number,
    durationSeconds: number,
  ) {
    this.activeRequests = Math.max(0, this.activeRequests - 1);
    const statusLabel = String(status);
    const requestKey = JSON.stringify([method, route, statusLabel]);
    const request = this.requests.get(requestKey) ?? {
      labels: { method, route, status: statusLabel },
      value: 0,
    };
    request.value += 1;
    this.requests.set(requestKey, request);

    const durationKey = JSON.stringify([method, route]);
    const histogram = this.durations.get(durationKey) ?? {
      method,
      route,
      count: 0,
      sum: 0,
      buckets: DURATION_BUCKETS.map(() => 0),
    };
    histogram.count += 1;
    histogram.sum += durationSeconds;
    DURATION_BUCKETS.forEach((bucket, index) => {
      if (durationSeconds <= bucket) histogram.buckets[index] += 1;
    });
    this.durations.set(durationKey, histogram);
  }

  jobCompleted(name: string, status: 'failed' | 'skipped' | 'succeeded') {
    const key = JSON.stringify([name, status]);
    this.jobs.set(key, (this.jobs.get(key) ?? 0) + 1);
  }

  alertTriggered(type: string, severity: string) {
    const key = JSON.stringify([type, severity]);
    this.alerts.set(key, (this.alerts.get(key) ?? 0) + 1);
  }

  setDependencyStatus(name: string, ready: boolean) {
    this.dependencies.set(name, ready ? 1 : 0);
  }

  render() {
    const lines = [
      '# HELP niazat_http_requests_active Current in-flight HTTP requests.',
      '# TYPE niazat_http_requests_active gauge',
      `niazat_http_requests_active ${this.activeRequests}`,
      '# HELP niazat_http_requests_total Completed HTTP requests.',
      '# TYPE niazat_http_requests_total counter',
    ];
    for (const item of this.requests.values()) {
      lines.push(
        `niazat_http_requests_total${labels({ method: item.labels.method, route: item.labels.route, status: item.labels.status })} ${item.value}`,
      );
    }
    lines.push(
      '# HELP niazat_http_request_duration_seconds HTTP request duration.',
      '# TYPE niazat_http_request_duration_seconds histogram',
    );
    for (const item of this.durations.values()) {
      DURATION_BUCKETS.forEach((bucket, index) => {
        lines.push(
          `niazat_http_request_duration_seconds_bucket${labels({ method: item.method, route: item.route, le: String(bucket) })} ${item.buckets[index]}`,
        );
      });
      lines.push(
        `niazat_http_request_duration_seconds_bucket${labels({ method: item.method, route: item.route, le: '+Inf' })} ${item.count}`,
        `niazat_http_request_duration_seconds_sum${labels({ method: item.method, route: item.route })} ${item.sum}`,
        `niazat_http_request_duration_seconds_count${labels({ method: item.method, route: item.route })} ${item.count}`,
      );
    }
    lines.push(
      '# HELP niazat_background_jobs_total Completed background job executions.',
      '# TYPE niazat_background_jobs_total counter',
    );
    for (const [key, value] of this.jobs) {
      const [job, status] = JSON.parse(key) as [string, string];
      lines.push(
        `niazat_background_jobs_total${labels({ job, status })} ${value}`,
      );
    }
    lines.push(
      '# HELP niazat_alerts_total Triggered application alerts.',
      '# TYPE niazat_alerts_total counter',
    );
    for (const [key, value] of this.alerts) {
      const [type, severity] = JSON.parse(key) as [string, string];
      lines.push(`niazat_alerts_total${labels({ type, severity })} ${value}`);
    }
    lines.push(
      '# HELP niazat_dependency_ready Whether a critical dependency is ready.',
      '# TYPE niazat_dependency_ready gauge',
    );
    for (const [name, value] of this.dependencies) {
      lines.push(
        `niazat_dependency_ready${labels({ dependency: name })} ${value}`,
      );
    }
    const memory = process.memoryUsage();
    lines.push(
      '# HELP niazat_process_uptime_seconds Process uptime.',
      '# TYPE niazat_process_uptime_seconds gauge',
      `niazat_process_uptime_seconds ${process.uptime()}`,
      '# HELP niazat_process_resident_memory_bytes Resident memory.',
      '# TYPE niazat_process_resident_memory_bytes gauge',
      `niazat_process_resident_memory_bytes ${memory.rss}`,
    );
    return `${lines.join('\n')}\n`;
  }
}
