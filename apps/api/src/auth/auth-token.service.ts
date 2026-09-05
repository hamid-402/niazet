import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { User } from '@prisma/client';

@Injectable()
export class AuthTokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  refreshExpiry(now = new Date()) {
    const ttlDays = Number(this.config.get('REFRESH_TOKEN_TTL_DAYS') ?? 30);
    return new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000);
  }

  signAccessToken(user: User, sessionId: string) {
    return this.jwt.signAsync(
      {
        sub: user.id,
        sid: sessionId,
        role: user.role,
        adminScope: user.adminScope,
      },
      {
        secret: this.config.get('JWT_ACCESS_SECRET'),
        audience: 'niazat-api',
        issuer: 'niazat-auth',
        algorithm: 'HS256',
        expiresIn: this.config.get('JWT_ACCESS_TTL') ?? '15m',
      },
    );
  }
}
