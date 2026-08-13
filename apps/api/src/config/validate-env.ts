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
    if (
      accessSecret.length < 32 ||
      downloadSecret.length < 32 ||
      UNSAFE_SECRET_VALUES.has(accessSecret) ||
      UNSAFE_SECRET_VALUES.has(downloadSecret)
    ) {
      throw new Error(
        'Production secrets must be unique random values of at least 32 characters.',
      );
    }
    if (accessSecret === downloadSecret) {
      throw new Error(
        'JWT_ACCESS_SECRET and DOWNLOAD_TOKEN_SECRET must be different.',
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
  };
}
