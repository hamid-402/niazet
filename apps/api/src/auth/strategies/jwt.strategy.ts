import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthSessionService } from '../auth-session.service';

interface JwtPayload {
  sub: string;
  sid: string;
  role: string;
  adminScope: string | null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly config: ConfigService,
    private readonly sessions: AuthSessionService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_ACCESS_SECRET') as string,
      audience: 'niazat-api',
      issuer: 'niazat-auth',
      algorithms: ['HS256'],
    });
  }

  async validate(payload: JwtPayload) {
    if (!payload.sid) return null;
    return this.sessions.loadSessionUser(payload.sub, payload.sid);
  }
}
