import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Abstract payment gateway adapter (docs/ROADMAP.md §۲ — سوال ۲).
 * فقط یک درایور Mock پیاده‌سازی شده که verify را همیشه موفق برمی‌گرداند؛
 * برای اتصال به زرین‌پال/آیدی‌پی/نکست‌پی واقعی کافی است یک پیاده‌سازی
 * جدید از همین اینترفیس اضافه شود، بدون تغییر در PaymentsService.
 */
export interface PaymentGatewayAdapter {
  createPaymentRequest(input: {
    amount: number;
    orderId: string;
    callbackUrl: string;
  }): Promise<{ gatewayRef: string; redirectUrl: string }>;

  /** verify باید همیشه سمت سرور انجام شود؛ هرگز به مقدار ارسالی کلاینت اعتماد نکنید. */
  verifyPayment(input: {
    gatewayRef: string;
    amount: number;
  }): Promise<{ verified: boolean }>;
}

@Injectable()
export class MockPaymentGateway implements PaymentGatewayAdapter {
  private readonly logger = new Logger('MockPaymentGateway');
  private readonly configuredDriver: string;

  constructor(config: ConfigService) {
    this.configuredDriver =
      config.get<string>('PAYMENT_GATEWAY_DRIVER') ?? 'mock';
  }

  createPaymentRequest(input: {
    amount: number;
    orderId: string;
    callbackUrl: string;
  }) {
    const gatewayRef = `MOCK-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.logger.log(
      `[MOCK GATEWAY] payment request for order ${input.orderId}, amount=${input.amount}`,
    );
    return Promise.resolve({
      gatewayRef,
      redirectUrl: `${input.callbackUrl}?gatewayRef=${gatewayRef}&status=success`,
    });
  }

  verifyPayment(input: { gatewayRef: string; amount: number }) {
    this.logger.log(
      `[MOCK GATEWAY] verify ${input.gatewayRef} amount=${input.amount}`,
    );
    return Promise.resolve({ verified: true });
  }

  readiness() {
    const activeAdapter = 'mock';
    return {
      status:
        this.configuredDriver === activeAdapter
          ? ('ready' as const)
          : ('not_ready' as const),
      reason:
        this.configuredDriver === activeAdapter
          ? undefined
          : 'configured_driver_is_not_implemented',
      details: {
        configuredDriver: this.configuredDriver,
        activeAdapter,
        mode: 'mock',
      },
    };
  }
}
