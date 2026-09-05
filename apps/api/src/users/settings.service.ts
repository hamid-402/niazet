import { BadRequestException, Injectable } from '@nestjs/common';
import { AuditSensitivity, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import type { SYSTEM_SETTING_KEYS } from './dto/user.dto';

type SettingKey = (typeof SYSTEM_SETTING_KEYS)[number];
type SettingDefinition = {
  key: SettingKey;
  group: 'finance' | 'calendar' | 'ai';
  label: string;
  description: string;
  valueType: 'boolean' | 'integer' | 'rate' | 'date_array';
  defaultValue: Prisma.InputJsonValue;
  min?: number;
  max?: number;
};

export const SETTING_DEFINITIONS: SettingDefinition[] = [
  {
    key: 'finance.commission_rate',
    group: 'finance',
    label: 'نرخ کارمزد',
    description: 'سهم پلتفرم از آزادسازی Escrow؛ عددی بین صفر و یک.',
    valueType: 'rate',
    defaultValue: 0.2,
    min: 0,
    max: 1,
  },
  {
    key: 'finance.withdrawal_min',
    group: 'finance',
    label: 'حداقل برداشت',
    description: 'کمترین مبلغ برداشت مجری به تومان.',
    valueType: 'integer',
    defaultValue: 100_000,
    min: 1,
  },
  {
    key: 'finance.withdrawal_max',
    group: 'finance',
    label: 'حداکثر برداشت',
    description: 'بیشترین مبلغ برداشت مجری به تومان.',
    valueType: 'integer',
    defaultValue: 500_000_000,
    min: 1,
  },
  {
    key: 'finance.cancel_in_progress_refund_rate',
    group: 'finance',
    label: 'نرخ بازپرداخت لغو حین اجرا',
    description: 'سهم بازگشت وجه سفارش در حال اجرا؛ بین صفر و یک.',
    valueType: 'rate',
    defaultValue: 0.5,
    min: 0,
    max: 1,
  },
  {
    key: 'calendar.iran_holidays',
    group: 'calendar',
    label: 'تعطیلات رسمی',
    description: 'تاریخ‌های مستثنا از محاسبه SLA با قالب YYYY-MM-DD.',
    valueType: 'date_array',
    defaultValue: [],
  },
  {
    key: 'ai.enabled',
    group: 'ai',
    label: 'کلید اصلی AI',
    description: 'Kill switch سراسری؛ تا اتصال موتور AI خاموش بماند.',
    valueType: 'boolean',
    defaultValue: false,
  },
  {
    key: 'ai.order_triage_enabled',
    group: 'ai',
    label: 'پیشنهاد Triage سفارش',
    description: 'اجازه تولید پیشنهاد طبقه‌بندی؛ بدون تصمیم خودکار.',
    valueType: 'boolean',
    defaultValue: false,
  },
  {
    key: 'ai.support_draft_enabled',
    group: 'ai',
    label: 'پیش‌نویس پاسخ پشتیبانی',
    description: 'اجازه تولید پیش‌نویس؛ ارسال همچنان دستی است.',
    valueType: 'boolean',
    defaultValue: false,
  },
  {
    key: 'ai.human_approval_required',
    group: 'ai',
    label: 'تأیید انسانی اجباری',
    description: 'هر خروجی AI پیش از اثرگذاری باید توسط انسان تأیید شود.',
    valueType: 'boolean',
    defaultValue: true,
  },
];

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const stored = await this.prisma.systemSetting.findMany({
      where: { key: { in: SETTING_DEFINITIONS.map((item) => item.key) } },
    });
    const byKey = new Map(stored.map((item) => [item.key, item]));
    return SETTING_DEFINITIONS.map((definition) => {
      const item = byKey.get(definition.key);
      return {
        ...definition,
        value: item?.value ?? definition.defaultValue,
        isDefault: !item,
        updatedAt: item?.updatedAt ?? null,
      };
    });
  }

  async set(key: SettingKey, rawValue: unknown, actor: AuthenticatedUser) {
    const definition = SETTING_DEFINITIONS.find((item) => item.key === key);
    if (!definition) throw new BadRequestException('کلید تنظیمات مجاز نیست.');
    const value = this.validate(definition, rawValue);
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.systemSetting.findUnique({ where: { key } });
      const setting = await tx.systemSetting.upsert({
        where: { key },
        create: { key, value, updatedByUserId: actor.id },
        update: { value, updatedByUserId: actor.id },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          actorRole: actor.role,
          action: 'setting.updated',
          entityType: 'system_setting',
          entityId: key,
          before: before ? { value: before.value } : Prisma.JsonNull,
          after: { value },
          sensitivity: AuditSensitivity.critical,
        },
      });
      return setting;
    });
  }

  async securitySummary() {
    const now = new Date();
    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const [
      activeSessions,
      failedLogins24h,
      blockedUsers,
      suspendedUsers,
      criticalEvents24h,
      pendingFileScans,
      activeSignedUrls,
    ] = await Promise.all([
      this.prisma.session.count({
        where: { revokedAt: null, expiresAt: { gt: now } },
      }),
      this.prisma.loginAttempt.count({
        where: { success: false, createdAt: { gte: since } },
      }),
      this.prisma.user.count({ where: { status: 'blocked' } }),
      this.prisma.user.count({ where: { status: 'suspended' } }),
      this.prisma.auditLog.count({
        where: { sensitivity: 'critical', createdAt: { gte: since } },
      }),
      this.prisma.orderFile.count({
        where: { scanStatus: 'pending', purgedAt: null },
      }),
      this.prisma.signedUrlGrant.count({
        where: { revokedAt: null, usedAt: null, expiresAt: { gt: now } },
      }),
    ]);
    return {
      generatedAt: now,
      activeSessions,
      failedLogins24h,
      blockedUsers,
      suspendedUsers,
      criticalEvents24h,
      pendingFileScans,
      activeSignedUrls,
    };
  }

  private validate(
    definition: SettingDefinition,
    value: unknown,
  ): Prisma.InputJsonValue {
    if (definition.valueType === 'boolean') {
      if (definition.key === 'ai.human_approval_required' && value !== true) {
        throw new BadRequestException(
          'تأیید انسانی AI در این نسخه قابل غیرفعال‌کردن نیست.',
        );
      }
      if (typeof value !== 'boolean') {
        throw new BadRequestException(
          'مقدار این تنظیم باید روشن یا خاموش باشد.',
        );
      }
      return value;
    }
    if (definition.valueType === 'date_array') {
      if (!Array.isArray(value) || value.length > 100) {
        throw new BadRequestException(
          'تعطیلات باید آرایه‌ای از تاریخ‌های YYYY-MM-DD و حداکثر ۱۰۰ مورد باشد.',
        );
      }
      const dates: string[] = [];
      for (const item of value) {
        if (typeof item !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(item)) {
          throw new BadRequestException(
            'تعطیلات باید آرایه‌ای از تاریخ‌های YYYY-MM-DD و حداکثر ۱۰۰ مورد باشد.',
          );
        }
        dates.push(item);
      }
      return [...new Set(dates)].sort();
    }
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      (definition.valueType === 'integer' && !Number.isInteger(value))
    ) {
      throw new BadRequestException('مقدار عددی تنظیم معتبر نیست.');
    }
    if (
      (definition.min != null && value < definition.min) ||
      (definition.max != null && value > definition.max)
    ) {
      throw new BadRequestException(
        `مقدار باید بین ${definition.min ?? '-∞'} و ${definition.max ?? '+∞'} باشد.`,
      );
    }
    return value;
  }
}
