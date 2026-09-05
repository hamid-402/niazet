import { MetricsRegistry } from './metrics-registry.service';
import { errorRate } from './observability-alert.service';
import { redact } from './redaction';
import { createTraceContext } from './trace-context';
import { validateEnvironment } from '../config/validate-env';

describe('observability primitives', () => {
  it('redacts nested credentials, PII and bearer values', () => {
    const output = redact({
      password: 'plain',
      profile: { email: 'person@example.com' },
      note: 'Authorization: Bearer abc.def.ghi',
    });
    expect(output).toEqual({
      password: '[REDACTED]',
      profile: { email: '[REDACTED]' },
      note: 'Authorization: Bearer [REDACTED]',
    });
  });

  it('continues a valid W3C trace with a fresh server span', () => {
    const traceId = '1'.repeat(32);
    const parent = `00-${traceId}-${'2'.repeat(16)}-01`;
    const context = createTraceContext(parent);
    expect(context.traceId).toBe(traceId);
    expect(context.spanId).toMatch(/^[0-9a-f]{16}$/);
    expect(context.traceparent).toBe(`00-${traceId}-${context.spanId}-01`);
  });

  it('rejects a W3C parent with an all-zero span', () => {
    const traceId = '1'.repeat(32);
    const context = createTraceContext(`00-${traceId}-${'0'.repeat(16)}-01`);
    expect(context.traceId).not.toBe(traceId);
  });

  it('requires an independent observability token in production', () => {
    const base = {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://example.invalid/niazat',
      JWT_ACCESS_SECRET: 'a'.repeat(32),
      DOWNLOAD_TOKEN_SECRET: 'b'.repeat(32),
      WEB_URL: 'https://example.invalid',
      PAYMENT_GATEWAY_DRIVER: 'real',
      SMS_DRIVER: 'real',
      EMAIL_DRIVER: 'real',
      FILE_SCAN_DRIVER: 'clamav',
      CLAMAV_HOST: 'clamav.internal',
      CLAMAV_PORT: 3310,
    };
    expect(() => validateEnvironment(base)).toThrow(
      'OBSERVABILITY_TOKEN is required',
    );
    expect(
      validateEnvironment({ ...base, OBSERVABILITY_TOKEN: 'c'.repeat(32) }),
    ).toMatchObject({ ALERT_HTTP_5XX_RATE: 0.1, ALERT_MIN_REQUESTS: 20 });
    expect(() =>
      validateEnvironment({
        ...base,
        OBSERVABILITY_TOKEN: 'c'.repeat(32),
        ALERT_HTTP_5XX_RATE: 2,
      }),
    ).toThrow('ALERT_HTTP_5XX_RATE');
  });

  it('renders bounded Prometheus HTTP and job metrics', () => {
    const registry = new MetricsRegistry();
    registry.requestStarted();
    registry.requestCompleted('GET', '/v1/orders/:id', 200, 0.12);
    registry.jobCompleted('cleanup', 'succeeded');
    const output = registry.render();
    expect(output).toContain(
      'niazat_http_requests_total{method="GET",route="/v1/orders/:id",status="200"} 1',
    );
    expect(output).toContain(
      'niazat_background_jobs_total{job="cleanup",status="succeeded"} 1',
    );
    expect(output).toContain('niazat_http_requests_active 0');
  });

  it('calculates the rolling failure rate', () => {
    expect(
      errorRate([{ failed: true }, { failed: false }, { failed: true }]),
    ).toBeCloseTo(2 / 3);
    expect(errorRate([])).toBe(0);
  });
});
