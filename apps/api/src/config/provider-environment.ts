const SUPPORTED = {
  PAYMENT_GATEWAY_DRIVER: ['mock', 'zarinpal'],
  SMS_DRIVER: ['mock', 'kavenegar'],
  EMAIL_DRIVER: ['mock', 'smtp'],
  STORAGE_DRIVER: ['local', 's3'],
};

export function validateProviderEnvironment(config: Record<string, unknown>) {
  for (const [name, drivers] of Object.entries(SUPPORTED)) {
    const value = config[name] ?? drivers[0];
    if (typeof value !== 'string' || !drivers.includes(value))
      throw new Error(`${name} is not implemented.`);
  }
  const required: string[] = [];
  if (config.PAYMENT_GATEWAY_DRIVER === 'zarinpal')
    required.push('ZARINPAL_MERCHANT_ID');
  if (config.SMS_DRIVER === 'kavenegar')
    required.push(
      'KAVENEGAR_API_KEY',
      'KAVENEGAR_SENDER',
      'KAVENEGAR_OTP_TEMPLATE',
    );
  if (config.EMAIL_DRIVER === 'smtp')
    required.push('SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM');
  if (config.STORAGE_DRIVER === 's3')
    required.push(
      'S3_BUCKET',
      'S3_REGION',
      'S3_ACCESS_KEY_ID',
      'S3_SECRET_ACCESS_KEY',
    );
  for (const name of required) {
    const value = config[name];
    if (
      typeof value !== 'string' ||
      !value.trim() ||
      /REPLACE_|example\.com/i.test(value)
    )
      throw new Error(`${name} must be configured.`);
  }
  if (required.length && String(config.LIVE_PROVIDERS_ENABLED) !== 'true')
    throw new Error(
      'LIVE_PROVIDERS_ENABLED must explicitly enable external providers.',
    );
  if (config.EMAIL_DRIVER === 'smtp') {
    const port = Number(config.SMTP_PORT ?? 587);
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      throw new Error('SMTP_PORT is invalid.');
    if (
      /[\r\n]/.test(String(config.SMTP_FROM)) ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(config.SMTP_FROM))
    )
      throw new Error('SMTP_FROM must be an email address.');
  }
  if (config.S3_ENDPOINT) {
    if (typeof config.S3_ENDPOINT !== 'string')
      throw new Error('S3_ENDPOINT must be a string.');
    const endpoint = new URL(config.S3_ENDPOINT);
    if (
      endpoint.protocol !== 'https:' ||
      endpoint.username ||
      endpoint.password ||
      endpoint.search ||
      endpoint.hash
    )
      throw new Error(
        'S3_ENDPOINT must be an HTTPS origin without credentials.',
      );
  }
}
