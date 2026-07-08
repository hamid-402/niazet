import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.systemSetting.findMany({ orderBy: { key: 'asc' } });
  }

  async set(key: string, value: unknown, updatedByUserId: string) {
    return this.prisma.systemSetting.upsert({
      where: { key },
      create: { key, value: value as any, updatedByUserId },
      update: { value: value as any, updatedByUserId },
    });
  }
}
