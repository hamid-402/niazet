import { Controller, Get } from '@nestjs/common';
import { Public } from './common/decorators/public.decorator';
import { HealthService } from './health/health.service';

@Controller()
export class AppController {
  constructor(private readonly health: HealthService) {}

  @Public()
  @Get('v1/status')
  async publicStatus() {
    const readiness = await this.health.readiness();
    const labels: Record<string, string> = {
      database: 'پایگاه داده',
      storage: 'ذخیره‌سازی فایل',
      queue: 'صف و پردازش پس‌زمینه',
      sms: 'ارسال پیامک',
      email: 'ارسال ایمیل',
      payment: 'درگاه پرداخت',
    };
    const components = [
      { id: 'api', label: 'API و وب‌سرویس', status: 'operational' as const },
      ...readiness.checks.map((check) => ({
        id: check.name === 'queue' ? 'background' : check.name,
        label: labels[check.name],
        status:
          check.status === 'ready'
            ? ('operational' as const)
            : ('degraded' as const),
      })),
    ];
    const incidents = readiness.checks
      .filter((check) => check.status === 'not_ready')
      .map((check) => ({
        id: `${check.name}-availability`,
        title: `کاهش دسترسی ${labels[check.name]}`,
        status: 'investigating',
        startedAt: readiness.checkedAt,
      }));

    return {
      status: components.every((item) => item.status === 'operational')
        ? 'operational'
        : 'degraded',
      generatedAt: readiness.checkedAt,
      components,
      incidents,
      notice:
        'این صفحه فقط وضعیت عمومی سرویس‌ها را نمایش می‌دهد و شامل جزئیات امنیتی یا داده کاربران نیست.',
    };
  }
}
