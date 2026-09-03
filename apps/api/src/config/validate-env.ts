const UNSAFE_SECRET_VALUES = new Set([
  'change-me',
  'secret',
  'development-secret',
]);

export interface AppEnvironment extends Record<string, unknown> {
  NODE_ENV: 'development' | 'test' | 'production';
  DATABASE_URL: string;
  JWT_ACCESS_SECRET: string;
  DOWNLOAD_TOKEN_SECRET?: string;
  APP_PORT: number;
  REFRESH_TOKEN_TTL_DAYS: number;
  OTP_TTL_SECONDS: number;
  BACKGROUND_JOBS_ENABLED: boolean;
  OBSERVABILITY_TOKEN?: string;
  ALERT_WINDOW_SECONDS: number;
  ALERT_MIN_REQUESTS: number;
  ALERT_HTTP_5XX_RATE: number;
  ALERT_SLOW_REQUEST_MS: number;
  ALERT_COOLDOWN_SECONDS: number;
  READINESS_TIMEOUT_MS: number;
  READINESS_CACHE_TTL_MS: number;
  QUEUE_MAX_PENDING: number;
  QUEUE_MAX_AGE_SECONDS: number;
  QUEUE_MAX_DEAD_LETTERS_24H: number;
}

function integer(
  config: Record<string, unknown>,
  key: string,
  fallback: number,
) {
  const value = Number(config[key] ?? fallback);
  if (!Number.isInteger(value) || value < 1)
    throw new Error(`${key} must be a positive integer.`);
  return value;
}

function requireValue(config: Record<string, unknown>, key: string) {
  const value = config[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${key} is required.`);
  }
  return value;
}

function rate(config: Record<string, unknown>, key: string, fallback: number) {
  const value = Number(config[key] ?? fallback);
  if (!Number.isFinite(value) || value <= 0 || value > 1) {
    throw new Error(`${key} must be greater than zero and at most one.`);
  }
  return value;
}

export function validateEnvironment(
  config: Record<string, unknown>,
): AppEnvironment {
  const nodeEnv = (
    typeof config.NODE_ENV === 'string' ? config.NODE_ENV : 'development'
  ) as AppEnvironment['NODE_ENV'];
  if (!['development', 'test', 'production'].includes(nodeEnv))
    throw new Error('NODE_ENV is invalid.');
  const accessSecret = requireValue(config, 'JWT_ACCESS_SECRET');
  requireValue(config, 'DATABASE_URL');

  if (nodeEnv === 'production') {
    const downloadSecret = requireValue(config, 'DOWNLOAD_TOKEN_SECRET');
    const observabilityToken = requireValue(config, 'OBSERVABILITY_TOKEN');
    if (
      accessSecret.length < 32 ||
      downloadSecret.length < 32 ||
      observabilityToken.length < 32 ||
      UNSAFE_SECRET_VALUES.has(accessSecret) ||
      UNSAFE_SECRET_VALUES.has(downloadSecret) ||
      UNSAFE_SECRET_VALUES.has(observabilityToken)
    ) {
      throw new Error(
        'Production secrets and observability token must be random values of at least 32 characters.',
      );
    }
    if (
      new Set([accessSecret, downloadSecret, observabilityToken]).size !== 3
    ) {
      throw new Error(
        'JWT_ACCESS_SECRET, DOWNLOAD_TOKEN_SECRET and OBSERVABILITY_TOKEN must be different.',
      );
    }
    for (const driver of [
      'PAYMENT_GATEWAY_DRIVER',
      'SMS_DRIVER',
      'EMAIL_DRIVER',
      'FILE_SCAN_DRIVER',
    ]) {
      if (!config[driver] || config[driver] === 'mock') {
        throw new Error(`${driver} must use a production driver.`);
      }
    }
    const webUrl = requireValue(config, 'WEB_URL');
    if (!webUrl.startsWith('https://')) {
      throw new Error('WEB_URL must use HTTPS in production.');
    }
    if (config.FILE_SCAN_DRIVER !== 'clamav') {
      throw new Error('FILE_SCAN_DRIVER must be clamav in production.');
    }
    requireValue(config, 'CLAMAV_HOST');
    const clamAvPort = Number(config.CLAMAV_PORT);
    if (!Number.isInteger(clamAvPort) || clamAvPort < 1 || clamAvPort > 65535) {
      throw new Error('CLAMAV_PORT must be a valid TCP port.');
    }
  }

  return {
    ...config,
    NODE_ENV: nodeEnv,
    DATABASE_URL: String(config.DATABASE_URL),
    JWT_ACCESS_SECRET: accessSecret,
    APP_PORT: integer(config, 'APP_PORT', 3001),
    REFRESH_TOKEN_TTL_DAYS: integer(config, 'REFRESH_TOKEN_TTL_DAYS', 30),
    OTP_TTL_SECONDS: integer(config, 'OTP_TTL_SECONDS', 120),
    BACKGROUND_JOBS_ENABLED: config.BACKGROUND_JOBS_ENABLED !== 'false',
    ALERT_WINDOW_SECONDS: integer(config, 'ALERT_WINDOW_SECONDS', 300),
    ALERT_MIN_REQUESTS: integer(config, 'ALERT_MIN_REQUESTS', 20),
    ALERT_HTTP_5XX_RATE: rate(config, 'ALERT_HTTP_5XX_RATE', 0.1),
    ALERT_SLOW_REQUEST_MS: integer(config, 'ALERT_SLOW_REQUEST_MS', 5_000),
    ALERT_COOLDOWN_SECONDS: integer(config, 'ALERT_COOLDOWN_SECONDS', 300),
    READINESS_TIMEOUT_MS: integer(config, 'READINESS_TIMEOUT_MS', 3_000),
    READINESS_CACHE_TTL_MS: integer(config, 'READINESS_CACHE_TTL_MS', 5_000),
    QUEUE_MAX_PENDING: integer(config, 'QUEUE_MAX_PENDING', 1_000),
    QUEUE_MAX_AGE_SECONDS: integer(config, 'QUEUE_MAX_AGE_SECONDS', 900),
    QUEUE_MAX_DEAD_LETTERS_24H: integer(
      config,
      'QUEUE_MAX_DEAD_LETTERS_24H',
      10,
    ),
  };
}
