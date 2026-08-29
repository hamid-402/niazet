import { Controller, Get } from '@nestjs/common';
import { access, constants } from 'node:fs/promises';
import { Public } from './common/decorators/public.decorator';
import { PrismaService } from './prisma/prisma.service';
import { UPLOAD_ROOT } from './files/files.service';

@Controller()
export class AppController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get('health')
  health() {
    return { status: 'ok', service: 'niazat-api' };
  }

  @Public()
  @Get('v1/status')
  async publicStatus() {
    const generatedAt = new Date();
    const since = new Date(generatedAt.getTime() - 24 * 60 * 60 * 1000);
    let database: 'operational' | 'degraded' = 'operational';
    let storage: 'operational' | 'degraded' = 'operational';
    let background: 'operational' | 'degraded' | 'unknown' = 'unknown';
    let failedJobs24h = 0;
    let deadLetters24h = 0;
    let latestJobAt: Date | null = null;

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      const [failedJobs, deadLetters, latestJob] = await Promise.all([
        this.prisma.backgroundJobRun.count({
          where: { status: 'failed', startedAt: { gte: since } },
        }),
        this.prisma.outboxEvent.count({
          where: { deadLetteredAt: { not: null }, createdAt: { gte: since } },
        }),
        this.prisma.backgroundJobRun.findFirst({
          orderBy: { startedAt: 'desc' },
          select: { completedAt: true, startedAt: true },
        }),
      ]);
      failedJobs24h = failedJobs;
      deadLetters24h = deadLetters;
      latestJobAt = latestJob?.completedAt ?? latestJob?.startedAt ?? null;
      background =
        failedJobs24h > 0 || deadLetters24h > 0 ? 'degraded' : 'operational';
    } catch {
      database = 'degraded';
      background = 'unknown';
    }

    try {
      await access(UPLOAD_ROOT, constants.R_OK | constants.W_OK);
    } catch {
      storage = 'degraded';
    }

    const components = [
      { id: 'api', label: 'API و وب‌سرویس', status: 'operational' as const },
      { id: 'database', label: 'پایگاه داده', status: database },
      { id: 'storage', label: 'ذخیره‌سازی فایل', status: storage },
      {
        id: 'background',
        label: 'پردازش پس‌زمینه و اعلان‌ها',
        status: background,
        lastActivityAt: latestJobAt,
      },
    ];
    const incidents = [
      ...(database === 'degraded'
        ? [
            {
              id: 'database-connectivity',
              title: 'اختلال در اتصال پایگاه داده',
              status: 'investigating',
              startedAt: generatedAt,
            },
          ]
        : []),
      ...(storage === 'degraded'
        ? [
            {
              id: 'storage-access',
              title: 'اختلال در دسترسی ذخیره‌سازی',
              status: 'investigating',
              startedAt: generatedAt,
            },
          ]
        : []),
      ...(failedJobs24h + deadLetters24h > 0
        ? [
            {
              id: 'background-processing',
              title: 'کاهش کیفیت پردازش پس‌زمینه',
              status: 'monitoring',
              startedAt: since,
            },
          ]
        : []),
    ];

    return {
      status: components.every((item) => item.status === 'operational')
        ? 'operational'
        : 'degraded',
      generatedAt,
      components,
      incidents,
      notice:
        'این صفحه فقط وضعیت عمومی سرویس‌ها را نمایش می‌دهد و شامل جزئیات امنیتی یا داده کاربران نیست.',
    };
  }
}
