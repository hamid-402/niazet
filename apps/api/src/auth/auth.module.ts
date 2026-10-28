import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuthSessionService } from './auth-session.service';
import { AuthTokenService } from './auth-token.service';
import { VerifiedEmailService } from './verified-email.service';
import { VerifiedEmailController } from './verified-email.controller';

@Module({
  imports: [
    ConfigModule,
    PassportModule,
    JwtModule.register({}),
    NotificationsModule,
  ],
  controllers: [AuthController, VerifiedEmailController],
  providers: [
    AuthService,
    AuthSessionService,
    AuthTokenService,
    JwtStrategy,
    VerifiedEmailService,
  ],
  exports: [AuthService, AuthSessionService, AuthTokenService],
})
export class AuthModule {}
