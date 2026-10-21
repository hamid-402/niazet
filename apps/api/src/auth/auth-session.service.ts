import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { CapabilityType, Prisma, User, UserStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { PrismaService } from '../prisma/prisma.service';
import {
  createRefreshToken,
  parseRefreshToken,
  refreshTokenMatches,
} from './refresh-token';
import { AuthTokenService } from './auth-token.service';

export interface SessionContext {
  userAgent?: string;
  ipAddress?: string;
}

@Injectable()
export class AuthSessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: AuthTokenService,
  ) {}

  async issue(user: User, context: SessionContext = {}) {
    const refresh = createRefreshToken();
    await this.prisma.session.create({
      data: {
        id: refresh.sessionId,
        userId: user.id,
        familyId: randomUUID(),
        refreshTokenHash: refresh.tokenHash,
        userAgent: context.userAgent,
        ipAddress: context.ipAddress,
        expiresAt: this.tokens.refreshExpiry(),
      },
    });
    return {
      accessToken: await this.tokens.signAccessToken(user, refresh.sessionId),
      refreshToken: refresh.token,
      user: await this.loadUser(user.id),
    };
  }

  async logout(userId: string, refreshToken?: string) {
    const parsed = refreshToken ? parseRefreshToken(refreshToken) : null;
    if (parsed && refreshToken) {
      const session = await this.prisma.session.findUnique({
        where: { id: parsed.sessionId },
      });
      if (
        session?.userId === userId &&
        refreshTokenMatches(refreshToken, session.refreshTokenHash)
      ) {
        await this.prisma.session.updateMany({
          where: { familyId: session.familyId, userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
    }
    return { message: 'خروج با موفقیت انجام شد.' };
  }

  async refresh(refreshToken: string, context: SessionContext = {}) {
    const parsed = parseRefreshToken(refreshToken);
    if (!parsed)
      throw new UnauthorizedException('نشست نامعتبر است؛ دوباره وارد شوید.');
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
              expiresAt: this.tokens.refreshExpiry(now),
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
          'استفاده هم‌زمان از نشست شناسایی شد؛ دوباره وارد شوید.',
        );
      }
      throw error;
    }
    if (result.kind !== 'ok') {
      throw new UnauthorizedException(
        result.kind === 'reuse'
          ? 'استفاده مجدد از توکن نشست شناسایی شد؛ دوباره وارد شوید.'
          : 'نشست منقضی یا نامعتبر است؛ دوباره وارد شوید.',
      );
    }
    return {
      accessToken: await this.tokens.signAccessToken(
        result.user,
        next.sessionId,
      ),
      refreshToken: next.token,
    };
  }

  async loadUser(userId: string): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { capabilities: true },
    });
    if (!user) throw new NotFoundException('کاربر یافت نشد.');
    return this.toAuthenticatedUser(user);
  }

  async loadSessionUser(userId: string, sessionId: string) {
    const session = await this.prisma.session.findFirst({
      where: {
        id: sessionId,
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { user: { include: { capabilities: true } } },
    });
    if (!session)
      throw new UnauthorizedException('نشست معتبر نیست؛ دوباره وارد شوید.');
    this.assertLoginAllowed(session.user);
    return this.toAuthenticatedUser(session.user);
  }

  async listActive(userId: string, currentSessionId?: string) {
    const sessions = await this.prisma.session.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        userAgent: true,
        ipAddress: true,
        createdAt: true,
        expiresAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return sessions.map((session) => ({
      ...session,
      isCurrent: session.id === currentSessionId,
    }));
  }

  async revoke(userId: string, sessionId: string) {
    const result = await this.prisma.session.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (!result.count) throw new NotFoundException('نشست فعال یافت نشد.');
    return { message: 'نشست انتخاب‌شده باطل شد.' };
  }

  async revokeOthers(userId: string, currentSessionId?: string) {
    if (!currentSessionId)
      throw new UnauthorizedException('شناسه نشست فعلی معتبر نیست.');
    const result = await this.prisma.session.updateMany({
      where: {
        userId,
        id: { not: currentSessionId },
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
    return {
      message: 'تمام نشست‌های دیگر باطل شدند.',
      revokedCount: result.count,
    };
  }

  assertLoginAllowed(user: User) {
    if (user.status === UserStatus.blocked)
      throw new ForbiddenException('حساب شما مسدود شده است.');
    if (user.status === UserStatus.suspended)
      throw new ForbiddenException('حساب شما موقتاً غیرفعال است.');
    if (user.status === UserStatus.pending_verification) {
      throw new ForbiddenException('ابتدا شماره موبایل خود را تأیید کنید.');
    }
  }

  private toAuthenticatedUser(
    user: User & { capabilities: Array<{ capability: CapabilityType }> },
  ): AuthenticatedUser {
    return {
      id: user.id,
      role: user.role,
      adminScope: user.adminScope,
      capabilities: user.capabilities.map((item) => item.capability),
      fullName: user.fullName,
      phone: user.phone,
      email: user.email,
    };
  }
}
