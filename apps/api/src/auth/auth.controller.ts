import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RequestOtpDto, VerifyOtpDto } from './dto/otp.dto';
import {
  RequestPasswordResetDto,
  ResetPasswordDto,
} from './dto/password-reset.dto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { RateLimit } from '../common/decorators/rate-limit.decorator';
import { AuthSessionService } from './auth-session.service';

@Controller('v1/auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly sessions: AuthSessionService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('register')
  @RateLimit({
    name: 'auth-register',
    limit: 5,
    windowMs: 60 * 60 * 1000,
    identifierBodyField: 'phone',
  })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @RateLimit({
    name: 'auth-login',
    limit: 10,
    windowMs: 15 * 60 * 1000,
    identifierBodyField: 'phone',
  })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto, this.sessionContext(req));
    this.setRefreshCookie(res, result.refreshToken);
    return { accessToken: result.accessToken, user: result.user };
  }

  @Public()
  @Post('otp/request')
  @HttpCode(HttpStatus.OK)
  @RateLimit({
    name: 'auth-otp-request',
    limit: 5,
    windowMs: 10 * 60 * 1000,
    identifierBodyField: 'phone',
  })
  requestOtp(@Body() dto: RequestOtpDto) {
    return this.authService.requestOtp(dto);
  }

  @Public()
  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  @RateLimit({
    name: 'auth-otp-verify',
    limit: 10,
    windowMs: 10 * 60 * 1000,
    identifierBodyField: 'phone',
  })
  async verifyOtp(
    @Body() dto: VerifyOtpDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.verifyOtp(
      dto,
      this.sessionContext(req),
    );
    this.setRefreshCookie(res, result.refreshToken);
    return { accessToken: result.accessToken, user: result.user };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ name: 'auth-refresh', limit: 20, windowMs: 5 * 60 * 1000 })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = this.readCookie(req, 'niazat_refresh');
    const result = await this.sessions.refresh(
      refreshToken ?? '',
      this.sessionContext(req),
    );
    this.setRefreshCookie(res, result.refreshToken);
    return { accessToken: result.accessToken };
  }

  @Public()
  @Post('password/forgot')
  @HttpCode(HttpStatus.OK)
  @RateLimit({
    name: 'auth-password-forgot',
    limit: 3,
    windowMs: 60 * 60 * 1000,
    identifierBodyField: 'phone',
  })
  forgotPassword(@Body() dto: RequestPasswordResetDto) {
    return this.authService.requestPasswordReset(dto.phone);
  }

  @Public()
  @Post('password/reset')
  @HttpCode(HttpStatus.OK)
  @RateLimit({
    name: 'auth-password-reset',
    limit: 5,
    windowMs: 15 * 60 * 1000,
    identifierBodyField: 'phone',
  })
  async resetPassword(
    @Body() dto: ResetPasswordDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.resetPassword(
      dto,
      this.sessionContext(req),
    );
    res.clearCookie('niazat_refresh', { path: '/v1/auth' });
    return result;
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = this.readCookie(req, 'niazat_refresh');
    res.clearCookie('niazat_refresh', { path: '/v1/auth' });
    return this.sessions.logout(user.id, refreshToken);
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.sessions.loadUser(user.id);
  }

  private sessionContext(req: Request) {
    return {
      userAgent: req.get('user-agent'),
      ipAddress: req.ip,
    };
  }

  private setRefreshCookie(res: Response, token: string) {
    const ttlDays = Number(this.config.get('REFRESH_TOKEN_TTL_DAYS') ?? 30);
    res.cookie('niazat_refresh', token, {
      httpOnly: true,
      secure: this.config.get('NODE_ENV') === 'production',
      sameSite: 'strict',
      path: '/v1/auth',
      maxAge: ttlDays * 24 * 60 * 60 * 1000,
    });
  }

  private readCookie(req: Request, name: string): string | undefined {
    const cookie = req.headers.cookie;
    if (!cookie) return undefined;
    for (const part of cookie.split(';')) {
      const [key, ...value] = part.trim().split('=');
      if (key === name) return decodeURIComponent(value.join('='));
    }
    return undefined;
  }
}
