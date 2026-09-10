import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'crypto';

const TOKEN_PREFIX = 'rt';
const TOKEN_PATTERN = /^rt_([0-9a-f-]{36})\.([A-Za-z0-9_-]{64})$/i;

export interface OpaqueRefreshToken {
  sessionId: string;
  token: string;
  tokenHash: string;
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function createRefreshToken(
  sessionId = randomUUID(),
): OpaqueRefreshToken {
  const secret = randomBytes(48).toString('base64url');
  const token = `${TOKEN_PREFIX}_${sessionId}.${secret}`;
  return { sessionId, token, tokenHash: hashRefreshToken(token) };
}

export function parseRefreshToken(token: string): { sessionId: string } | null {
  const match = TOKEN_PATTERN.exec(token);
  return match ? { sessionId: match[1].toLowerCase() } : null;
}

export function refreshTokenMatches(
  token: string,
  expectedHash: string,
): boolean {
  const actual = Buffer.from(hashRefreshToken(token), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
