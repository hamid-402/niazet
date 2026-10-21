const SENSITIVE_KEY =
  /authorization|cookie|password|passwd|secret|token|otp|shaba|iban|card|phone|mobile|email|national.?id/i;
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const JWT = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;

function redactString(value: string) {
  return value
    .replace(BEARER, 'Bearer [REDACTED]')
    .replace(JWT, '[REDACTED_JWT]')
    .slice(0, 4_000);
}

export function redact(
  value: unknown,
  depth = 0,
  seen = new WeakSet<object>(),
): unknown {
  if (typeof value === 'string') return redactString(value);
  if (typeof value === 'bigint') return value.toString();
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message),
      stack: value.stack ? redactString(value.stack) : undefined,
    };
  }
  if (depth >= 6) return '[TRUNCATED]';
  if (seen.has(value)) return '[CIRCULAR]';
  seen.add(value);
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => redact(item, depth + 1, seen));
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SENSITIVE_KEY.test(key) ? '[REDACTED]' : redact(item, depth + 1, seen),
    ]),
  );
}
