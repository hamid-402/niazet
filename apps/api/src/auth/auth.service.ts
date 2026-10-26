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
  Prisma,
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
import { registrationProof } from './registration-proof';

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
    const fullName = dto.fullName?.trim();
    if (!fullName || fullName.length < 2)
      throw new BadRequestException('نام نمایشی معتبر لازم است.');
    const code = randomInt(0, 10 ** OTP_LENGTH)
      .toString()
      .padStart(OTP_LENGTH, '0');
    const codeHash = await bcrypt.hash(
      registrationProof(dto.phone, fullName, dto.password, code),
      12,
    );
    const ttlSeconds = Number(this.config.get('OTP_TTL_SECONDS') ?? 120);
    const result = await this.prisma.$transaction(async (tx) => {
      let user = await tx.user.findUnique({ where: { phone: dto.phone } });
      if (user) {
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`,
        );
        user = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
        if (
          user.status !== UserStatus.pending_verification ||
          user.role !== UserRole.customer
        )
          throw new ConflictException(
            'این شماره برای ثبت‌نام اولیه در دسترس نیست.',
          );
        // Anonymous re-registration NEVER rewrites an existing identity/secret.
      } else
        user = await tx.user.create({
          data: {
            phone: dto.phone,
            fullName,
            passwordHash: null,
            role: UserRole.customer,
            status: UserStatus.pending_verification,
          },
        });
      await tx.otpCode.updateMany({
        where: { identifier: dto.phone, purpose: 'register', consumedAt: null },
        data: { consumedAt: new Date() },
      });
      const otp = await tx.otpCode.create({
        data: {
          userId: user.id,
          identifier: dto.phone,
          purpose: 'register',
          codeHash,
          expiresAt: new Date(Date.now() + ttlSeconds * 1000),
        },
      });
      return { userId: user.id, registrationAttemptId: otp.id };
    });
    await this.sms.sendOtp(dto.phone, code);
    return {
      ...result,
      message: 'کد تایید این درخواست ثبت‌نام ارسال شد.',
      expiresInSeconds: ttlSeconds,
      ...((this.config.get('SMS_DRIVER') ?? 'mock') === 'mock' &&
      this.config.get('NODE_ENV') === 'development'
        ? { devOtp: code }
        : {}),
    };
  }

  async requestOtp(dto: RequestOtpDto) {
    if (dto.purpose === 'register') {
      if (!dto.fullName)
        throw new BadRequestException(
          'برای ارسال مجدد ثبت‌نام، اطلاعات همان فرم را ارسال کنید.',
        );
      return this.register({
        phone: dto.phone,
        fullName: dto.fullName,
        password: dto.password,
      });
    }
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

    await this.sms.sendOtp(dto.phone, code);

    const isMockDriver = (this.config.get('SMS_DRIVER') ?? 'mock') === 'mock';

    return {
      message: 'کد تایید ارسال شد.',
      expiresInSeconds: ttlSeconds,
      // در محیط توسعه (درایور mock پیامک)، کد برای راحتی تست در پاسخ برگردانده می‌شود.
      ...(isMockDriver && this.config.get('NODE_ENV') === 'development'
        ? { devOtp: code }
        : {}),
    };
  }

  async verifyOtp(dto: VerifyOtpDto, context: SessionContext = {}) {
    if (dto.purpose === 'register') {
      try {
        return await this.verifyRegistration(dto, context);
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          (error.code === 'P2034' ||
            (error.code === 'P2010' &&
              ['40001', '40P01'].includes(String(error.meta?.code))))
        )
          throw new ConflictException(
            'درخواست تأیید هم‌زمان تغییر کرد؛ وضعیت حساب را بررسی و دوباره تلاش کنید.',
          );
        throw error;
      }
    }
    const otp = await this.findValidOtp(dto.phone, dto.purpose, dto.code);

    const consumed = await this.prisma.otpCode.updateMany({
      where: {
        id: otp.id,
        consumedAt: null,
        attempts: { lt: OTP_MAX_ATTEMPTS },
        expiresAt: { gt: new Date() },
      },
      data: { consumedAt: new Date() },
    });
    if (consumed.count !== 1) {
      throw new BadRequestException('این کد تایید قبلاً استفاده شده است.');
    }

    const user = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
    });

    if (!user) {
      throw new NotFoundException('حسابی با این شماره موبایل یافت نشد.');
    }

    this.assertLoginAllowed(user);

    await this.prisma.userLoginState.upsert({
      where: { userId: user.id },
      create: { userId: user.id, phoneVerifiedAt: new Date() },
      update: { phoneVerifiedAt: new Date() },
    });
    return this.sessions.issue(user, context);
  }

  private async verifyRegistration(dto: VerifyOtpDto, context: SessionContext) {
    const fullName = dto.fullName?.trim();
    if (!dto.registrationAttemptId || !fullName || fullName.length < 2)
      throw new BadRequestException(
        'شناسه و اطلاعات همان درخواست ثبت‌نام لازم است؛ از فرم ثبت‌نام ادامه دهید.',
      );
    const result = await this.prisma.$transaction(
      async (tx) => {
        const otp = await tx.otpCode.findUnique({
          where: { id: dto.registrationAttemptId },
        });
        const now = new Date();
        if (
          !otp ||
          otp.identifier !== dto.phone ||
          otp.purpose !== 'register' ||
          !otp.userId ||
          otp.consumedAt ||
          otp.expiresAt <= now ||
          otp.attempts >= OTP_MAX_ATTEMPTS
        )
          return null;
        const user = await tx.user.findUnique({ where: { id: otp.userId } });
        if (
          !user ||
          user.phone !== dto.phone ||
          user.role !== UserRole.customer ||
          user.status !== UserStatus.pending_verification
        )
          return null;
        const valid = await bcrypt.compare(
          registrationProof(dto.phone, fullName, dto.password, dto.code),
          otp.codeHash,
        );
        if (!valid) {
          await tx.otpCode.updateMany({
            where: {
              id: otp.id,
              consumedAt: null,
              attempts: { lt: OTP_MAX_ATTEMPTS },
            },
            data: { attempts: { increment: 1 } },
          });
          return null; // Commit failed-attempt counter; throw only OUTSIDE tx.
        }
        const consumed = await tx.otpCode.updateMany({
          where: {
            id: otp.id,
            consumedAt: null,
            attempts: { lt: OTP_MAX_ATTEMPTS },
            expiresAt: { gt: now },
          },
          data: { consumedAt: now },
        });
        if (consumed.count !== 1) return null;
        const passwordHash = dto.password
          ? await bcrypt.hash(dto.password, 12)
          : null;
        const activated = await tx.user.updateMany({
          where: {
            id: user.id,
            status: UserStatus.pending_verification,
            role: UserRole.customer,
          },
          data: { status: UserStatus.active, fullName, passwordHash },
        });
        if (activated.count !== 1)
          throw new ConflictException('این حساب هم‌زمان تأیید شده است.');
        await this.ensureFinancialAccounts(user.id, user.role, tx);
        await tx.userLoginState.upsert({
          where: { userId: user.id },
          create: { userId: user.id, phoneVerifiedAt: now },
          update: { phoneVerifiedAt: now },
        });
        await tx.auditLog.create({
          data: {
            actorUserId: user.id,
            actorRole: UserRole.customer,
            action: 'auth.registration.verified',
            entityType: 'user',
            entityId: user.id,
            sensitivity: 'critical',
            after: {
              phoneOwnershipVerified: true,
              registrationAttemptId: otp.id,
            },
          },
        });
        return tx.user.findUniqueOrThrow({ where: { id: user.id } });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 15000,
      },
    );
    if (!result)
      throw new BadRequestException(
        'کد یا اطلاعات این درخواست معتبر نیست، منقضی شده یا قبلاً مصرف شده است.',
      );
    return this.sessions.issue(result, context);
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
      await this.prisma.otpCode.updateMany({
        where: {
          id: otp.id,
          consumedAt: null,
          attempts: { lt: OTP_MAX_ATTEMPTS },
        },
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

  async ensureFinancialAccounts(
    userId: string,
    role: UserRole,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    const accountType =
      role === UserRole.executor
        ? LedgerAccountType.executor_wallet
        : LedgerAccountType.customer_wallet;

    if (role !== UserRole.customer && role !== UserRole.executor) {
      return;
    }

    const [wallet, account] = await Promise.all([
      client.wallet.findUnique({ where: { userId } }),
      client.ledgerAccount.findUnique({ where: { ownerUserId: userId } }),
    ]);
    if (wallet?.balance && !account)
      throw new ConflictException(
        'حساب مالی نیاز به بررسی دارد؛ موجودی خودکار بازسازی نمی‌شود.',
      );
    await client.ledgerAccount.upsert({
      where: { ownerUserId: userId },
      create: { ownerUserId: userId, accountType },
      update: {},
    });

    await client.wallet.upsert({
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
