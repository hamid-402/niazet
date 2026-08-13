import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AdminScope, UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAdminDto } from './dto/user.dto';
import { SAFE_USER_SELECT } from '../common/selects/safe-user.select';

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

  async setStatus(id: string, status: UserStatus) {
    await this.getUser(id);
    return this.prisma.user.update({
      where: { id },
      data: { status },
      select: SAFE_USER_SELECT,
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

  async createAdmin(dto: CreateAdminDto) {
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

    return this.prisma.user.create({
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
  }

  async updateAdminScope(id: string, adminScope: AdminScope) {
    const user = await this.getUser(id);
    if (user.role !== UserRole.admin)
      throw new BadRequestException('این کاربر ادمین نیست.');
    return this.prisma.user.update({
      where: { id },
      data: { adminScope },
      select: SAFE_USER_SELECT,
    });
  }
}
