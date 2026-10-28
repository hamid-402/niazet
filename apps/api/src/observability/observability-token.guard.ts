import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

function equal(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

@Injectable()
export class ObservabilityTokenGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext) {
    const expected = this.config.get<string>('OBSERVABILITY_TOKEN');
    if (!expected) return this.config.get<string>('NODE_ENV') !== 'production';
    const request = context.switchToHttp().getRequest<Request>();
    const authorization = request.header('authorization');
    const presented = authorization?.startsWith('Bearer ')
      ? authorization.slice(7)
      : request.header('x-observability-token');
    return Boolean(presented && equal(presented, expected));
  }
}
