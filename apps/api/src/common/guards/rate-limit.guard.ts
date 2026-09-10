import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash } from 'crypto';
import type { Request, Response } from 'express';
import type { AuthenticatedUser } from '../types/authenticated-user';
import {
  RATE_LIMIT_KEY,
  type RateLimitPolicy,
} from '../decorators/rate-limit.decorator';

interface Bucket {
  count: number;
  resetsAt: number;
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, Bucket>();
  private lastSweep = Date.now();

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const policy = this.reflector.getAllAndOverride<RateLimitPolicy>(
      RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!policy) return true;

    const http = context.switchToHttp();
    const request = http.getRequest<Request & { user?: AuthenticatedUser }>();
    const response = http.getResponse<Response>();
    const actorKey = request.user?.id ?? request.ip ?? 'unknown';
    const keys = [`${policy.name}:actor:${actorKey}`];

    if (policy.identifierBodyField) {
      const body: unknown = request.body;
      const value =
        body && typeof body === 'object'
          ? (body as Record<string, unknown>)[policy.identifierBodyField]
          : undefined;
      if (typeof value === 'string' && value) {
        const digest = createHash('sha256').update(value).digest('hex');
        keys.push(`${policy.name}:identifier:${digest}`);
      }
    }

    const now = Date.now();
    this.sweep(now);
    let minimumRemaining = policy.limit;
    let latestReset = now + policy.windowMs;

    for (const key of keys) {
      const bucket = this.consume(key, policy, now);
      minimumRemaining = Math.min(
        minimumRemaining,
        Math.max(0, policy.limit - bucket.count),
      );
      latestReset = Math.max(latestReset, bucket.resetsAt);
      if (bucket.count > policy.limit) {
        const retryAfter = Math.max(
          1,
          Math.ceil((bucket.resetsAt - now) / 1000),
        );
        response.setHeader('Retry-After', String(retryAfter));
        throw new HttpException(
          'تعداد درخواست‌ها بیش از حد مجاز است. کمی بعد دوباره تلاش کنید.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    response.setHeader('X-RateLimit-Limit', String(policy.limit));
    response.setHeader('X-RateLimit-Remaining', String(minimumRemaining));
    response.setHeader(
      'X-RateLimit-Reset',
      String(Math.ceil(latestReset / 1000)),
    );
    return true;
  }

  private consume(key: string, policy: RateLimitPolicy, now: number): Bucket {
    const current = this.buckets.get(key);
    if (!current || current.resetsAt <= now) {
      const created = { count: 1, resetsAt: now + policy.windowMs };
      this.buckets.set(key, created);
      return created;
    }
    current.count += 1;
    return current;
  }

  private sweep(now: number) {
    if (now - this.lastSweep < 60_000) return;
    this.lastSweep = now;
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetsAt <= now) this.buckets.delete(key);
    }
  }
}
