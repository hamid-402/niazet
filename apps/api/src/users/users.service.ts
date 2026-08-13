import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AdminScope,
  AuditSensitivity,
  UserRole,
  UserStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAdminDto } from './dto/user.dto';
import { SAFE_USER_SELECT } from '../common/selects/safe-user.select';
import type { AuthenticatedUser } from '../common/types/authenticated-user';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  listUsers(params: {
    role?: UserRole;
    status?: UserStatus;
    skip?: number;
    take?: number;
  }) {
    return this.prisma.user.findMany({
      where: {
        ...(params.role ? { role: params.role } : {}),
        ...(params.status ? { status: params.status } : {}),
      },
      select: SAFE_USER_SELECT,
      orderBy: { createdAt: 'desc' },
      skip: params.skip,
      take: params.take,
    });
  }

  async getUser(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        ...SAFE_USER_SELECT,
        capabilities: true,
        executorProfile: true,
      },
    });
    if (!user) throw new NotFoundException('کاربر یافت نشد.');
    return user;
  }

  async setStatus(
    id: string,
    status: UserStatus,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ) {
    if (id === actor.id && status !== UserStatus.active) {
      throw new BadRequestException(
        'برای جلوگیری از قفل‌شدن مدیریت، وضعیت حساب خودتان را تغییر ندهید.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const before = await tx.user.findUnique({ where: { id } });
      if (!before) throw new NotFoundException('کاربر یافت نشد.');

      const result = await tx.user.update({
        where: { id },
        data: { status },
        select: SAFE_USER_SELECT,
      });
      if (status !== UserStatus.active) {
        await tx.session.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          actorRole: actor.role,
          action: 'user.status_changed',
          entityType: 'user',
          entityId: id,
          before: { status: before.status },
          after: { status, sessionsRevoked: status !== UserStatus.active },
          sensitivity: AuditSensitivity.critical,
          ipAddress,
        },
      });
      return result;
    });
  }

  listAdmins() {
    return this.prisma.user.findMany({
      where: { role: UserRole.admin },
      select: {
        id: true,
        fullName: true,
        phone: true,
        adminScope: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createAdmin(
    dto: CreateAdminDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ) {
    const existing = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
      select: { id: true },
    });
    if (existing)
      throw new BadRequestException(
        'کاربری با این شماره موبایل قبلاً ثبت شده است.',
      );

    const passwordHash = dto.password
      ? await bcrypt.hash(dto.password, 10)
      : null;

    return this.prisma.$transaction(async (tx) => {
      const result = await tx.user.create({
        data: {
          phone: dto.phone,
          fullName: dto.fullName,
          role: UserRole.admin,
          adminScope: dto.adminScope,
          status: UserStatus.active,
          passwordHash,
        },
        select: SAFE_USER_SELECT,
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          actorRole: actor.role,
          action: 'admin.created',
          entityType: 'user',
          entityId: result.id,
          after: { role: UserRole.admin, adminScope: dto.adminScope },
          sensitivity: AuditSensitivity.critical,
          ipAddress,
        },
      });
      return result;
    });
  }

  async updateAdminScope(
    id: string,
    adminScope: AdminScope,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ) {
    if (id === actor.id && adminScope !== actor.adminScope) {
      throw new BadRequestException(
        'برای جلوگیری از قفل‌شدن مدیریت، سطح دسترسی حساب خودتان را تغییر ندهید.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const before = await tx.user.findUnique({ where: { id } });
      if (!before) throw new NotFoundException('کاربر یافت نشد.');
      if (before.role !== UserRole.admin) {
        throw new BadRequestException('این کاربر ادمین نیست.');
      }

      const result = await tx.user.update({
        where: { id },
        data: { adminScope },
        select: SAFE_USER_SELECT,
      });
      await tx.session.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          actorRole: actor.role,
          action: 'admin.scope_changed',
          entityType: 'user',
          entityId: id,
          before: { adminScope: before.adminScope },
          after: { adminScope, sessionsRevoked: true },
          sensitivity: AuditSensitivity.critical,
          ipAddress,
        },
      });
      return result;
    });
  }
}
