import { Injectable, Logger } from '@nestjs/common';

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
  verifyPayment(input: { gatewayRef: string; amount: number }): Promise<{ verified: boolean }>;
}

@Injectable()
export class MockPaymentGateway implements PaymentGatewayAdapter {
  private readonly logger = new Logger('MockPaymentGateway');

  async createPaymentRequest(input: { amount: number; orderId: string; callbackUrl: string }) {
    const gatewayRef = `MOCK-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.logger.log(
      `[MOCK GATEWAY] payment request for order ${input.orderId}, amount=${input.amount}`,
    );
    return { gatewayRef, redirectUrl: `${input.callbackUrl}?gatewayRef=${gatewayRef}&status=success` };
  }

  async verifyPayment(input: { gatewayRef: string; amount: number }) {
    this.logger.log(`[MOCK GATEWAY] verify ${input.gatewayRef} amount=${input.amount}`);
    return { verified: true };
  }
}
