import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AuditSensitivity,
  LedgerAccountType,
  User,
  UserRole,
  UserStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SmsService } from '../notifications/sms.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RequestOtpDto, VerifyOtpDto } from './dto/otp.dto';
import { ResetPasswordDto } from './dto/password-reset.dto';
import { AuthSessionService, SessionContext } from './auth-session.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';

const OTP_LENGTH = 6;
const OTP_MAX_ATTEMPTS = 5;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly sms: SmsService,
    private readonly sessions: AuthSessionService,
  ) {}

  // ---------------------------------------------------------------------
  // Registration / OTP
  // ---------------------------------------------------------------------

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
    });

    if (existing && existing.status !== UserStatus.pending_verification) {
      throw new ConflictException('این شماره موبایل قبلاً ثبت شده است.');
    }

    const passwordHash = dto.password
      ? await bcrypt.hash(dto.password, 10)
      : null;

    const user = existing
      ? await this.prisma.user.update({
          where: { id: existing.id },
          data: { fullName: dto.fullName, passwordHash },
        })
      : await this.prisma.user.create({
          data: {
            phone: dto.phone,
            fullName: dto.fullName,
            passwordHash,
            role: UserRole.customer,
            status: UserStatus.pending_verification,
          },
        });

    const otp = await this.requestOtp({
      phone: user.phone,
      purpose: 'register',
    });

    return {
      ...otp,
      message: 'ثبت‌نام اولیه انجام شد. کد تایید برای شماره موبایل ارسال شد.',
      userId: user.id,
    };
  }

  async requestOtp(dto: RequestOtpDto) {
    const code = randomInt(0, 10 ** OTP_LENGTH)
      .toString()
      .padStart(OTP_LENGTH, '0');
    const codeHash = await bcrypt.hash(code, 10);
    const ttlSeconds = Number(this.config.get('OTP_TTL_SECONDS') ?? 120);

    const existingUser = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
    });

    if (
      (dto.purpose === 'login' || dto.purpose === 'password_reset') &&
      (!existingUser || existingUser.status === UserStatus.pending_verification)
    ) {
      // پاسخ یکسان مانع تشخیص وجود یا عدم وجود حساب با شماره موبایل می‌شود.
      return {
        message: 'اگر حساب فعالی وجود داشته باشد، کد تایید ارسال می‌شود.',
        expiresInSeconds: ttlSeconds,
      };
    }

    await this.prisma.otpCode.updateMany({
      where: {
        identifier: dto.phone,
        purpose: dto.purpose,
        consumedAt: null,
      },
      data: { consumedAt: new Date() },
    });

    await this.prisma.otpCode.create({
      data: {
        userId: existingUser?.id,
        identifier: dto.phone,
        purpose: dto.purpose,
        codeHash,
        expiresAt: new Date(Date.now() + ttlSeconds * 1000),
      },
    });

    await this.sms.send(dto.phone, `کد تایید نیازت با ما: ${code}`);

    const isMockDriver = (this.config.get('SMS_DRIVER') ?? 'mock') === 'mock';

    return {
      message: 'کد تایید ارسال شد.',
      expiresInSeconds: ttlSeconds,
      // در محیط توسعه (درایور mock پیامک)، کد برای راحتی تست در پاسخ برگردانده می‌شود.
      ...(isMockDriver ? { devOtp: code } : {}),
    };
  }

  async verifyOtp(dto: VerifyOtpDto, context: SessionContext = {}) {
    const otp = await this.findValidOtp(dto.phone, dto.purpose, dto.code);

    const consumed = await this.prisma.otpCode.updateMany({
      where: { id: otp.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (consumed.count !== 1) {
      throw new BadRequestException('این کد تایید قبلاً استفاده شده است.');
    }

    let user = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
    });

    if (dto.purpose === 'register') {
      if (!user) {
        throw new BadRequestException(
          'ابتدا باید فرآیند ثبت‌نام را شروع کنید.',
        );
      }
      if (user.status === UserStatus.pending_verification) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: { status: UserStatus.active },
        });
        await this.ensureFinancialAccounts(user.id, user.role);
      }
    }

    if (!user) {
      throw new NotFoundException('حسابی با این شماره موبایل یافت نشد.');
    }

    this.assertLoginAllowed(user);

    return this.sessions.issue(user, context);
  }

  async requestPasswordReset(phone: string) {
    const result = await this.requestOtp({
      phone,
      purpose: 'password_reset',
    });
    return {
      message: 'اگر حساب فعالی وجود داشته باشد، کد بازیابی ارسال می‌شود.',
      expiresInSeconds: result.expiresInSeconds,
      ...('devOtp' in result ? { devOtp: result.devOtp } : {}),
    };
  }

  async resetPassword(dto: ResetPasswordDto, context: SessionContext = {}) {
    const otp = await this.findValidOtp(dto.phone, 'password_reset', dto.code);
    if (!otp.userId) {
      throw new BadRequestException('کد بازیابی معتبر نیست.');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.otpCode.updateMany({
        where: { id: otp.id, consumedAt: null },
        data: { consumedAt: now },
      });
      if (consumed.count !== 1) {
        throw new BadRequestException('این کد بازیابی قبلاً استفاده شده است.');
      }

      const user = await tx.user.findUnique({ where: { id: otp.userId! } });
      if (!user || user.phone !== dto.phone) {
        throw new BadRequestException('کد بازیابی معتبر نیست.');
      }

      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash },
      });
      await tx.session.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.otpCode.updateMany({
        where: {
          userId: user.id,
          consumedAt: null,
        },
        data: { consumedAt: now },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          actorRole: user.role,
          action: 'auth.password_reset',
          entityType: 'user',
          entityId: user.id,
          sensitivity: AuditSensitivity.critical,
          ipAddress: context.ipAddress,
          after: { sessionsRevoked: true, userAgent: context.userAgent },
        },
      });
    });

    return {
      message: 'رمز عبور تغییر کرد. اکنون با رمز جدید وارد شوید.',
    };
  }

  private async findValidOtp(
    identifier: string,
    purpose: string,
    code: string,
  ) {
    const otp = await this.prisma.otpCode.findFirst({
      where: { identifier, purpose, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp) {
      throw new BadRequestException(
        'کد تاییدی برای این شماره یافت نشد. دوباره درخواست دهید.',
      );
    }

    if (otp.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('کد تایید منقضی شده است.');
    }

    if (otp.attempts >= OTP_MAX_ATTEMPTS) {
      throw new BadRequestException(
        'تعداد تلاش مجاز برای این کد به پایان رسیده است.',
      );
    }

    const isValid = await bcrypt.compare(code, otp.codeHash);

    if (!isValid) {
      await this.prisma.otpCode.update({
        where: { id: otp.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException('کد تایید نادرست است.');
    }

    return otp;
  }

  // ---------------------------------------------------------------------
  // Password login
  // ---------------------------------------------------------------------

  async login(dto: LoginDto, context: SessionContext = {}) {
    const user = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('شماره موبایل یا رمز عبور نادرست است.');
    }

    const recentFailures = await this.prisma.loginAttempt.count({
      where: {
        userId: user.id,
        success: false,
        createdAt: { gte: new Date(Date.now() - 15 * 60 * 1000) },
      },
    });
    if (recentFailures >= 5) {
      throw new HttpException(
        'تلاش‌های ناموفق زیاد بوده است. کمی بعد دوباره امتحان کنید.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const passwordMatches = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );

    if (!passwordMatches) {
      await this.prisma.loginAttempt.create({
        data: {
          userId: user.id,
          identifier: dto.phone,
          success: false,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });
      throw new UnauthorizedException('شماره موبایل یا رمز عبور نادرست است.');
    }

    this.assertLoginAllowed(user);

    await this.prisma.loginAttempt.create({
      data: {
        userId: user.id,
        identifier: dto.phone,
        success: true,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });

    return this.sessions.issue(user, context);
  }

  async logout(userId: string, refreshToken?: string) {
    return this.sessions.logout(userId, refreshToken);
  }

  async refresh(refreshToken: string, context: SessionContext = {}) {
    return this.sessions.refresh(refreshToken, context);
  }

  async me(userId: string) {
    return this.sessions.loadUser(userId);
  }

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------

  private assertLoginAllowed(user: User) {
    if (user.status === UserStatus.blocked) {
      throw new ForbiddenException('حساب شما مسدود شده است.');
    }
    if (user.status === UserStatus.suspended) {
      throw new ForbiddenException('حساب شما به‌طور موقت غیرفعال شده است.');
    }
    if (user.status === UserStatus.pending_verification) {
      throw new ForbiddenException(
        'لطفاً ابتدا شماره موبایل خود را تایید کنید.',
      );
    }
  }

  async ensureFinancialAccounts(userId: string, role: UserRole) {
    const accountType =
      role === UserRole.executor
        ? LedgerAccountType.executor_wallet
        : LedgerAccountType.customer_wallet;

    if (role !== UserRole.customer && role !== UserRole.executor) {
      return;
    }

    await this.prisma.ledgerAccount.upsert({
      where: { ownerUserId: userId },
      create: { ownerUserId: userId, accountType },
      update: {},
    });

    await this.prisma.wallet.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
  }

  async loadAuthenticatedUser(userId: string): Promise<AuthenticatedUser> {
    return this.sessions.loadUser(userId);
  }

  async loadAuthenticatedSessionUser(
    userId: string,
    sessionId: string,
  ): Promise<AuthenticatedUser> {
    return this.sessions.loadSessionUser(userId, sessionId);
  }
}
