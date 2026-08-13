const UNSAFE_SECRET_VALUES = new Set([
  'change-me',
  'secret',
  'development-secret',
]);

function requireValue(config: Record<string, unknown>, key: string) {
  const value = config[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${key} is required.`);
  }
  return value;
}

export function validateEnvironment(config: Record<string, unknown>) {
  const nodeEnv =
    typeof config.NODE_ENV === 'string' ? config.NODE_ENV : 'development';
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

  return config;
}
