import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { RateLimit } from '../common/decorators/rate-limit.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { VerifiedEmailService } from './verified-email.service';
import {
  ConfirmVerifiedEmailDto,
  EmailIdentityPasswordDto,
  EmailPasswordLoginDto,
  RequestVerifiedEmailDto,
} from './dto/verified-email.dto';

@Controller('v1/auth/email')
export class VerifiedEmailController {
  constructor(
    private readonly email: VerifiedEmailService,
    private readonly config: ConfigService,
  ) {}

  @Get('status')
  status(@CurrentUser() user: AuthenticatedUser) {
    return this.email.status(user.id);
  }

  @Post('request')
  @RateLimit({
    name: 'verified-email-request',
    limit: 5,
    windowMs: 60 * 60 * 1000,
  })
  request(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RequestVerifiedEmailDto,
    @Req() req: Request,
  ) {
    return this.email.request(user.id, dto, {
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
  }

  @Post('confirm')
  @RateLimit({
    name: 'verified-email-confirm',
    limit: 10,
    windowMs: 15 * 60 * 1000,
  })
  confirm(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ConfirmVerifiedEmailDto,
  ) {
    return this.email.confirm(user.id, dto);
  }

  @Delete('identity')
  @RateLimit({
    name: 'verified-email-unlink',
    limit: 5,
    windowMs: 60 * 60 * 1000,
  })
  unlink(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: EmailIdentityPasswordDto,
    @Req() req: Request,
  ) {
    return this.email.unlink(user.id, dto, {
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  // Same actor bucket as the existing password endpoint: an alias must not
  // multiply the anonymous login budget. User lockout is also shared in service.
  @RateLimit({
    name: 'auth-login',
    limit: 10,
    windowMs: 15 * 60 * 1000,
    identifierBodyField: 'email',
  })
  async login(
    @Body() dto: EmailPasswordLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.email.login(dto, {
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
    const ttlDays = Number(this.config.get('REFRESH_TOKEN_TTL_DAYS') ?? 30);
    res.cookie('niazat_refresh', result.refreshToken, {
      httpOnly: true,
      secure: this.config.get('NODE_ENV') === 'production',
      sameSite: 'strict',
      path: '/v1/auth',
      maxAge: ttlDays * 24 * 60 * 60 * 1000,
    });
    return { accessToken: result.accessToken, user: result.user };
  }
}
