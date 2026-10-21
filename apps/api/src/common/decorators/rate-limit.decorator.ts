import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'rate_limit_policy';

export interface RateLimitPolicy {
  limit: number;
  windowMs: number;
  name: string;
  identifierBodyField?: string;
}

export const RateLimit = (policy: RateLimitPolicy) =>
  SetMetadata(RATE_LIMIT_KEY, policy);
