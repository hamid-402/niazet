import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { LedgerAccountType, User, UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes, randomInt } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SmsService } from '../notifications/sms.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RequestOtpDto, VerifyOtpDto } from './dto/otp.dto';
import { AuthenticatedUser } from '../common/types/authenticated-user';

const OTP_LENGTH = 6;
const OTP_MAX_ATTEMPTS = 5;

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
      throw new NotFoundException('حسابی با این شماره موبایل یافت نشد.');
    }

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

  async verifyOtp(dto: VerifyOtpDto) {
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

    await this.prisma.otpCode.update({
      where: { id: otp.id },
      data: { consumedAt: new Date() },
    });

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

    return this.issueSessionTokens(user);
  }

  // ---------------------------------------------------------------------
  // Password login
  // ---------------------------------------------------------------------

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('شماره موبایل یا رمز عبور نادرست است.');
    }

    const passwordMatches = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );

    if (!passwordMatches) {
      await this.prisma.loginAttempt.create({
        data: { userId: user.id, identifier: dto.phone, success: false },
      });
      throw new UnauthorizedException('شماره موبایل یا رمز عبور نادرست است.');
    }

    this.assertLoginAllowed(user);

    await this.prisma.loginAttempt.create({
      data: { userId: user.id, identifier: dto.phone, success: true },
    });

    return this.issueSessionTokens(user);
  }

  async logout(userId: string, refreshToken?: string) {
    if (!refreshToken) {
      return { message: 'خروج با موفقیت انجام شد.' };
    }

    const sessions = await this.prisma.session.findMany({
      where: { userId, revokedAt: null },
    });

    for (const session of sessions) {
      const matches = await bcrypt.compare(
        refreshToken,
        session.refreshTokenHash,
      );
      if (matches) {
        await this.prisma.session.update({
          where: { id: session.id },
          data: { revokedAt: new Date() },
        });
        break;
      }
    }

    return { message: 'خروج با موفقیت انجام شد.' };
  }

  async refresh(refreshToken: string) {
    let payload: { sub: string };
    try {
      payload = this.jwt.verify(refreshToken, {
        secret: this.config.get('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('نشست منقضی شده است. دوباره وارد شوید.');
    }

    const sessions = await this.prisma.session.findMany({
      where: {
        userId: payload.sub,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    let matchedSession: (typeof sessions)[number] | null = null;
    for (const session of sessions) {
      if (await bcrypt.compare(refreshToken, session.refreshTokenHash)) {
        matchedSession = session;
        break;
      }
    }

    if (!matchedSession) {
      throw new UnauthorizedException('نشست معتبر نیست.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user) {
      throw new UnauthorizedException('کاربر یافت نشد.');
    }

    this.assertLoginAllowed(user);

    const accessToken = await this.signAccessToken(user);
    return { accessToken };
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

  private async issueSessionTokens(user: User) {
    const accessToken = await this.signAccessToken(user);

    const refreshToken = randomBytes(48).toString('hex');
    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    const refreshTtlDays = 30;

    await this.prisma.session.create({
      data: {
        userId: user.id,
        refreshTokenHash,
        expiresAt: new Date(Date.now() + refreshTtlDays * 24 * 60 * 60 * 1000),
      },
    });

    return {
      accessToken,
      refreshToken,
      user: await this.loadAuthenticatedUser(user.id),
    };
  }

  private async signAccessToken(user: User) {
    return this.jwt.signAsync(
      { sub: user.id, role: user.role, adminScope: user.adminScope },
      {
        secret: this.config.get('JWT_ACCESS_SECRET'),
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
