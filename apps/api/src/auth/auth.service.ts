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
import { JwtService } from '@nestjs/jwt';
import {
  LedgerAccountType,
  Prisma,
  User,
  UserRole,
  UserStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomInt, randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SmsService } from '../notifications/sms.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RequestOtpDto, VerifyOtpDto } from './dto/otp.dto';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import {
  createRefreshToken,
  parseRefreshToken,
  refreshTokenMatches,
} from './refresh-token';

const OTP_LENGTH = 6;
const OTP_MAX_ATTEMPTS = 5;

export interface SessionContext {
  userAgent?: string;
  ipAddress?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly sms: SmsService,
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

    if (dto.purpose === 'login' && !existingUser) {
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
    const otp = await this.prisma.otpCode.findFirst({
      where: { identifier: dto.phone, purpose: dto.purpose, consumedAt: null },
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

    const isValid = await bcrypt.compare(dto.code, otp.codeHash);

    if (!isValid) {
      await this.prisma.otpCode.update({
        where: { id: otp.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException('کد تایید نادرست است.');
    }

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

    return this.issueSessionTokens(user, context);
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

    return this.issueSessionTokens(user, context);
  }

  async logout(userId: string, refreshToken?: string) {
    if (!refreshToken) {
      return { message: 'خروج با موفقیت انجام شد.' };
    }

    const parsed = parseRefreshToken(refreshToken);
    if (!parsed) {
      return { message: 'خروج با موفقیت انجام شد.' };
    }

    const session = await this.prisma.session.findUnique({
      where: { id: parsed.sessionId },
    });
    if (
      session &&
      session.userId === userId &&
      refreshTokenMatches(refreshToken, session.refreshTokenHash)
    ) {
      await this.prisma.session.updateMany({
        where: { familyId: session.familyId, userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    return { message: 'خروج با موفقیت انجام شد.' };
  }

  async refresh(refreshToken: string, context: SessionContext = {}) {
    const parsed = parseRefreshToken(refreshToken);
    if (!parsed) {
      throw new UnauthorizedException('نشست منقضی شده است. دوباره وارد شوید.');
    }

    const now = new Date();
    const next = createRefreshToken();
    let result:
      { kind: 'invalid' | 'reuse' | 'expired' } | { kind: 'ok'; user: User };
    try {
      result = await this.prisma.$transaction(
        async (tx) => {
          const session = await tx.session.findUnique({
            where: { id: parsed.sessionId },
            include: { user: true },
          });

          if (
            !session ||
            !refreshTokenMatches(refreshToken, session.refreshTokenHash)
          ) {
            return { kind: 'invalid' as const };
          }

          if (session.revokedAt) {
            await tx.session.updateMany({
              where: { familyId: session.familyId, revokedAt: null },
              data: { revokedAt: now },
            });
            return { kind: 'reuse' as const };
          }

          if (session.expiresAt <= now) {
            await tx.session.update({
              where: { id: session.id },
              data: { revokedAt: now },
            });
            return { kind: 'expired' as const };
          }

          this.assertLoginAllowed(session.user);

          const rotated = await tx.session.updateMany({
            where: { id: session.id, revokedAt: null },
            data: { revokedAt: now, replacedById: next.sessionId },
          });
          if (rotated.count !== 1) {
            await tx.session.updateMany({
              where: { familyId: session.familyId, revokedAt: null },
              data: { revokedAt: now },
            });
            return { kind: 'reuse' as const };
          }

          await tx.session.create({
            data: {
              id: next.sessionId,
              userId: session.userId,
              familyId: session.familyId,
              refreshTokenHash: next.tokenHash,
              userAgent: context.userAgent,
              ipAddress: context.ipAddress,
              expiresAt: this.refreshExpiry(),
            },
          });

          return { kind: 'ok' as const, user: session.user };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2034'
      ) {
        const conflicted = await this.prisma.session.findUnique({
          where: { id: parsed.sessionId },
          select: { familyId: true },
        });
        if (conflicted) {
          await this.prisma.session.updateMany({
            where: { familyId: conflicted.familyId, revokedAt: null },
            data: { revokedAt: new Date() },
          });
        }
        throw new UnauthorizedException(
          'استفاده هم‌زمان یا مجدد از نشست شناسایی شد؛ دوباره وارد شوید.',
        );
      }
      throw error;
    }

    if (result.kind !== 'ok') {
      const message =
        result.kind === 'reuse'
          ? 'استفاده مجدد از توکن نشست شناسایی شد؛ دوباره وارد شوید.'
          : 'نشست منقضی یا نامعتبر است. دوباره وارد شوید.';
      throw new UnauthorizedException(message);
    }

    return {
      accessToken: await this.signAccessToken(result.user),
      refreshToken: next.token,
    };
  }

  async me(userId: string) {
    return this.loadAuthenticatedUser(userId);
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

  private async issueSessionTokens(user: User, context: SessionContext = {}) {
    const accessToken = await this.signAccessToken(user);
    const refresh = createRefreshToken();
    const familyId = randomUUID();

    await this.prisma.session.create({
      data: {
        id: refresh.sessionId,
        userId: user.id,
        familyId,
        refreshTokenHash: refresh.tokenHash,
        userAgent: context.userAgent,
        ipAddress: context.ipAddress,
        expiresAt: this.refreshExpiry(),
      },
    });

    return {
      accessToken,
      refreshToken: refresh.token,
      user: await this.loadAuthenticatedUser(user.id),
    };
  }

  private refreshExpiry() {
    const ttlDays = Number(this.config.get('REFRESH_TOKEN_TTL_DAYS') ?? 30);
    return new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
  }

  private async signAccessToken(user: User) {
    return this.jwt.signAsync(
      { sub: user.id, role: user.role, adminScope: user.adminScope },
      {
        secret: this.config.get('JWT_ACCESS_SECRET'),
        audience: 'niazat-api',
        issuer: 'niazat-auth',
        algorithm: 'HS256',
        expiresIn: this.config.get('JWT_ACCESS_TTL') ?? '15m',
      },
    );
  }

  async loadAuthenticatedUser(userId: string): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { capabilities: true },
    });

    if (!user) {
      throw new NotFoundException('کاربر یافت نشد.');
    }

    return {
      id: user.id,
      role: user.role,
      adminScope: user.adminScope,
      capabilities: user.capabilities.map((c) => c.capability),
      fullName: user.fullName,
      phone: user.phone,
      email: user.email,
    };
  }
}
