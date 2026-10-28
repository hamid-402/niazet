import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, User, UserStatus } from '@prisma/client';
import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../notifications/email.service';
import { AuthService } from './auth.service';
import { SessionContext } from './auth-session.service';
import { normalizeVerifiedEmailAddress } from './verified-identifier-contract';
import {
  requireVerifiedEmail,
  verifiedEmailEnabled,
} from './verified-email-session';
import {
  ConfirmVerifiedEmailDto,
  EmailIdentityPasswordDto,
  EmailPasswordLoginDto,
  RequestVerifiedEmailDto,
} from './dto/verified-email.dto';

const dummyHash = bcrypt.hashSync(randomBytes(32).toString('hex'), 12);
const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');
const denied = () => new UnauthorizedException('ایمیل یا رمز عبور معتبر نیست.');
const invalidProof = () =>
  new BadRequestException(
    'درخواست تأیید معتبر نیست یا منقضی شده است؛ وضعیت ایمیل را بازخوانی کنید.',
  );

@Injectable()
export class VerifiedEmailService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly email: EmailService,
    private readonly auth: AuthService,
  ) {}

  async status(userId: string) {
    if (!verifiedEmailEnabled(this.config))
      return {
        enabled: false,
        verified: false,
        verificationMode: 'unavailable',
      };
    const [user, identity] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true },
      }),
      this.prisma.emailLoginIdentity.findUnique({ where: { userId } }),
    ]);
    let verified = false;
    try {
      verified =
        !!identity &&
        normalizeVerifiedEmailAddress(user?.email) === identity.emailNormalized;
    } catch {
      /* old/absent email is not evidence */
    }
    return {
      enabled: true,
      verified,
      email: verified ? identity!.emailNormalized : null,
      verifiedAt: verified ? identity!.verifiedAt : null,
      verificationMode:
        this.config.get('EMAIL_DRIVER') === 'mock' &&
        this.config.get('NODE_ENV') !== 'production'
          ? 'development_mock'
          : 'unavailable',
    };
  }

  async login(dto: EmailPasswordLoginDto, context: SessionContext = {}) {
    requireVerifiedEmail(this.config);
    const email = normalizeVerifiedEmailAddress(dto.email);
    const identity = await this.prisma.emailLoginIdentity.findUnique({
      where: { emailNormalized: email },
      include: { user: true },
    });
    let current = false;
    try {
      current =
        !!identity &&
        normalizeVerifiedEmailAddress(identity.user.email) === email;
    } catch {
      /* never use profile email alone */
    }
    if (!identity || !current) {
      await bcrypt.compare(dto.password, dummyHash);
      throw denied();
    }
    try {
      return await this.auth.login(
        { phone: identity.user.phone, password: dto.password },
        context,
        {
          identityId: identity.id,
          userId: identity.userId,
          emailNormalized: email,
          revision: identity.revision,
        },
      );
    } catch (error) {
      if (error instanceof UnauthorizedException) throw denied();
      throw error; // keep existing blocked/status/lockout and operational errors
    }
  }

  private async passwordProof(
    userId: string,
    password: string,
    context: SessionContext,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.status !== UserStatus.active || !user.passwordHash) {
      await bcrypt.compare(password, dummyHash);
      throw denied();
    }
    const failures = await this.prisma.loginAttempt.count({
      where: {
        userId,
        success: false,
        createdAt: { gte: new Date(Date.now() - 15 * 60 * 1000) },
      },
    });
    if (failures >= 5)
      throw new HttpException(
        'تلاش‌های ناموفق زیاد بوده است. کمی بعد دوباره امتحان کنید.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    if (!(await bcrypt.compare(password, user.passwordHash))) {
      await this.prisma.loginAttempt.create({
        data: {
          userId,
          identifier: user.phone,
          success: false,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });
      throw denied();
    }
    return user;
  }

  private async lockOwner(
    tx: Prisma.TransactionClient,
    userId: string,
    credential?: User,
  ) {
    await tx.$queryRaw`SELECT id FROM users WHERE id=${userId} FOR UPDATE`;
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (
      !user ||
      user.status !== UserStatus.active ||
      (credential && user.passwordHash !== credential.passwordHash)
    )
      throw denied();
    return user;
  }
  private conflict(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === 'P2002' || error.code === 'P2034')
    )
      throw new ConflictException(
        'اطلاعات ایمیل هم‌زمان تغییر کرده یا یکتایی آن تأیید نشده است؛ وضعیت را بازخوانی کنید.',
      );
    throw error;
  }
  private async revokeFamilyRows(tx: Prisma.TransactionClient, userId: string) {
    // The persistent family marker is the authority even if this statement
    // races a refresh successor which was not visible in its statement snapshot.
    await tx.$executeRaw`UPDATE sessions SET revoked_at=CURRENT_TIMESTAMP WHERE user_id=${userId} AND revoked_at IS NULL AND family_id IN (SELECT family_id FROM email_login_families WHERE user_id=${userId} AND revoked_at IS NOT NULL)`;
  }

  async request(
    userId: string,
    dto: RequestVerifiedEmailDto,
    context: SessionContext = {},
  ) {
    requireVerifiedEmail(this.config);
    // No live email transport is activated by this local acceptance packet.
    if (
      this.config.get('EMAIL_DRIVER') !== 'mock' ||
      this.config.get('NODE_ENV') === 'production'
    )
      throw new ServiceUnavailableException(
        'تأیید ایمیل در این بسته فقط با درایور آزمایشی محیط توسعه در دسترس است؛ ارسال زنده هنوز پذیرفته نشده است.',
      );
    const emailNormalized = normalizeVerifiedEmailAddress(dto.email),
      credential = await this.passwordProof(
        userId,
        dto.currentPassword,
        context,
      );
    const token = randomBytes(32).toString('hex');
    let challenge: { id: string; expiresAt: Date };
    try {
      challenge = await this.prisma.$transaction(
        async (tx) => {
          const user = await this.lockOwner(tx, userId, credential);
          const existing = await tx.emailLoginIdentity.findUnique({
            where: { emailNormalized },
          });
          if (existing)
            throw new ConflictException(
              existing.userId === userId
                ? 'این ایمیل قبلاً تأیید شده است؛ وضعیت را بازخوانی کنید.'
                : 'تأیید این ایمیل برای این حساب ممکن نیست.',
            );
          const collision = await tx.user.findFirst({
            where: {
              id: { not: userId },
              email: { equals: emailNormalized, mode: 'insensitive' },
            },
            select: { id: true },
          });
          if (collision)
            throw new ConflictException(
              'یکتایی این ایمیل نیازمند بررسی است؛ حساب‌ها خودکار متصل نمی‌شوند.',
            );
          const now = (
            await tx.$queryRaw<
              Array<{ now: Date }>
            >`SELECT CURRENT_TIMESTAMP AS now`
          )[0].now;
          await tx.emailLoginChallenge.updateMany({
            where: { userId, consumedAt: null },
            data: { consumedAt: now },
          });
          const created = await tx.emailLoginChallenge.create({
            data: {
              userId,
              emailNormalized,
              expectedProfileEmail: user.email,
              tokenHash: hash(token),
              expiresAt: new Date(now.getTime() + 15 * 60 * 1000),
            },
          });
          await tx.auditLog.create({
            data: {
              actorUserId: userId,
              actorRole: user.role,
              action: 'auth.email_verification.requested',
              entityType: 'email_login_challenge',
              entityId: created.id,
              sensitivity: 'sensitive',
              after: { mockTransport: true, passwordReverified: true },
            },
          });
          return { id: created.id, expiresAt: created.expiresAt };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      return this.conflict(error);
    }
    try {
      await this.email.send(
        emailNormalized,
        'تأیید ایمیل ورود به نیازت با ما',
        `کد تأیید این درخواست: ${token}\nاعتبار: ۱۵ دقیقه. اگر درخواست شما نیست، آن را نادیده بگیرید.`,
        'verified-email:' + challenge.id,
      );
    } catch {
      await this.prisma.emailLoginChallenge.updateMany({
        where: { id: challenge.id, userId, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      throw new ServiceUnavailableException(
        'ارسال آزمایشی انجام نشد؛ درخواست تازه بسازید.',
      );
    }
    return {
      requested: true,
      challengeId: challenge.id,
      expiresAt: challenge.expiresAt,
      delivery: 'simulated',
      ...(this.config.get('NODE_ENV') === 'development'
        ? { devToken: token }
        : {}),
    };
  }

  async confirm(userId: string, dto: ConfirmVerifiedEmailDto) {
    requireVerifiedEmail(this.config);
    if (
      this.config.get('EMAIL_DRIVER') !== 'mock' ||
      this.config.get('NODE_ENV') === 'production'
    )
      throw new ServiceUnavailableException(
        'پذیرش زندهٔ تأیید ایمیل هنوز انجام نشده است.',
      );
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const user = await this.lockOwner(tx, userId);
          const challenge = await tx.emailLoginChallenge.findFirst({
            where: { id: dto.challengeId, userId },
          });
          const tokenHash = hash(dto.token);
          if (
            !challenge ||
            !timingSafeEqual(
              Buffer.from(challenge.tokenHash, 'hex'),
              Buffer.from(tokenHash, 'hex'),
            )
          )
            throw invalidProof();
          if (challenge.consumedAt) {
            const receipt = challenge.verifiedIdentityId
              ? await tx.emailLoginIdentity.findUnique({
                  where: { id: challenge.verifiedIdentityId },
                })
              : null;
            if (
              receipt?.userId === userId &&
              receipt.emailNormalized === challenge.emailNormalized &&
              user.email === challenge.emailNormalized
            )
              return {
                verified: true,
                email: receipt.emailNormalized,
                verifiedAt: receipt.verifiedAt,
              };
            throw invalidProof();
          }
          const now = (
            await tx.$queryRaw<
              Array<{ now: Date }>
            >`SELECT CURRENT_TIMESTAMP AS now`
          )[0].now;
          if (
            challenge.expiresAt <= now ||
            user.email !== challenge.expectedProfileEmail
          )
            throw invalidProof();
          const collision = await tx.user.findFirst({
            where: {
              id: { not: userId },
              email: { equals: challenge.emailNormalized, mode: 'insensitive' },
            },
            select: { id: true },
          });
          if (collision)
            throw new ConflictException(
              'یکتایی ایمیل تأیید نشده است؛ حساب‌ها ادغام نمی‌شوند.',
            );
          const identityId = randomUUID();
          const consumed = await tx.emailLoginChallenge.updateMany({
            where: { id: challenge.id, userId, consumedAt: null },
            data: { consumedAt: now, verifiedIdentityId: identityId },
          });
          if (consumed.count !== 1) throw invalidProof();
          await tx.emailLoginIdentity.deleteMany({ where: { userId } }); // DB marks old families revoked
          await this.revokeFamilyRows(tx, userId);
          await tx.user.update({
            where: { id: userId },
            data: { email: challenge.emailNormalized },
          });
          const identity = await tx.emailLoginIdentity.create({
            data: {
              id: identityId,
              userId,
              emailNormalized: challenge.emailNormalized,
              verifiedAt: now,
            },
          });
          await tx.auditLog.create({
            data: {
              actorUserId: userId,
              actorRole: user.role,
              action: 'auth.email_verification.confirmed',
              entityType: 'email_login_identity',
              entityId: identity.id,
              sensitivity: 'critical',
              after: {
                ownershipVerified: true,
                previousEmailFamiliesRevoked: true,
              },
            },
          });
          return {
            verified: true,
            email: identity.emailNormalized,
            verifiedAt: identity.verifiedAt,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      return this.conflict(error);
    }
  }

  async unlink(
    userId: string,
    dto: EmailIdentityPasswordDto,
    context: SessionContext = {},
  ) {
    requireVerifiedEmail(this.config);
    const credential = await this.passwordProof(
      userId,
      dto.currentPassword,
      context,
    );
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const user = await this.lockOwner(tx, userId, credential);
          const removed = await tx.emailLoginIdentity.deleteMany({
            where: { userId },
          });
          await this.revokeFamilyRows(tx, userId);
          await tx.emailLoginChallenge.updateMany({
            where: { userId, consumedAt: null },
            data: { consumedAt: new Date() },
          });
          await tx.auditLog.create({
            data: {
              actorUserId: userId,
              actorRole: user.role,
              action: 'auth.email_verification.unlinked',
              entityType: 'user',
              entityId: userId,
              sensitivity: 'critical',
              after: {
                passwordReverified: true,
                emailFamiliesRevoked: true,
                bindingRemoved: removed.count > 0,
              },
            },
          });
          return { unlinked: true, phoneAndPasswordPreserved: true };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      return this.conflict(error);
    }
  }
}
