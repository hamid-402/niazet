import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.systemSetting.findMany({ orderBy: { key: 'asc' } });
  }

  async set(
    key: string,
    value: Prisma.InputJsonValue,
    updatedByUserId: string,
  ) {
    return this.prisma.systemSetting.upsert({
      where: { key },
      create: { key, value, updatedByUserId },
      update: { value, updatedByUserId },
    });
  }
}
