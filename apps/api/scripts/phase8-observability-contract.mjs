import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const main = read('src/main.ts');
const moduleSource = read('src/observability/observability.module.ts');
const logger = read('src/observability/structured-logger.service.ts');
const metrics = read('src/observability/metrics-registry.service.ts');
const middleware = read('src/common/middleware/correlation-id.middleware.ts');
const controller = read('src/observability/observability.controller.ts');
const guard = read('src/observability/observability-token.guard.ts');

assert.match(
  main,
  /bufferLogs: true/,
  'Nest startup logs must be buffered until the JSON logger is ready.',
);
assert.match(
  main,
  /useLogger\(app\.get\(StructuredLogger\)\)/,
  'Structured logger must replace the default logger.',
);
assert.match(
  logger,
  /redact\(/,
  'Every structured log record must pass through redaction.',
);
assert.match(
  logger,
  /correlationId:/,
  'Logs must include correlation context.',
);
assert.match(logger, /traceId:/, 'Logs must include trace context.');
assert.match(
  middleware,
  /traceparent/,
  'W3C trace context must be propagated.',
);
assert.match(
  metrics,
  /niazat_http_requests_total/,
  'Prometheus request counter is required.',
);
assert.match(
  metrics,
  /niazat_http_request_duration_seconds/,
  'Prometheus duration histogram is required.',
);
assert.match(
  controller,
  /UseGuards\(ObservabilityTokenGuard\)/,
  'Metrics endpoint must have a dedicated guard.',
);
assert.match(
  guard,
  /timingSafeEqual/,
  'Metrics token comparison must be timing safe.',
);
assert.match(
  moduleSource,
  /ObservabilityAlertService/,
  'Alert evaluation service must be registered.',
);

console.log('Phase 8 observability contract passed.');
