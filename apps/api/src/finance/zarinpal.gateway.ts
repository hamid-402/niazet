import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { providerJson } from '../common/provider-http';
import {
  MockPaymentGateway,
  type PaymentGatewayAdapter,
} from './payment-gateway';

@Injectable()
export class PaymentGatewayService implements PaymentGatewayAdapter {
  readonly name: string;
  constructor(
    private readonly config: ConfigService,
    private readonly mock: MockPaymentGateway,
  ) {
    this.name = config.get<string>('PAYMENT_GATEWAY_DRIVER') ?? 'mock';
  }

  async createPaymentRequest(input: {
    amount: number;
    orderId: string;
    callbackUrl: string;
  }) {
    if (this.name === 'mock') return this.mock.createPaymentRequest(input);
    this.assertConfigured();
    const data = await this.call('request', {
      amount: this.rials(input.amount),
      callback_url: input.callbackUrl,
      description: `پرداخت سفارش ${input.orderId}`,
    });
    if (
      data.code !== 100 ||
      typeof data.authority !== 'string' ||
      !/^A[0-9a-zA-Z]{35}$/.test(data.authority)
    ) {
      throw new BadGatewayException('درگاه درخواست پرداخت را نپذیرفت.');
    }
    return {
      gatewayRef: data.authority,
      redirectUrl: `https://www.zarinpal.com/pg/StartPay/${data.authority}`,
    };
  }

  async verifyPayment(input: { gatewayRef: string; amount: number }) {
    if (this.name === 'mock') return this.mock.verifyPayment(input);
    this.assertConfigured();
    const data = await this.call('verify', {
      amount: this.rials(input.amount),
      authority: input.gatewayRef,
    });
    // -21 can be an in-progress/unpaid request: keep retryable, never settle it.
    if (data.code !== 100 && data.code !== 101)
      throw new BadGatewayException('پرداخت هنوز توسط درگاه تأیید نشده است.');
    return { verified: true };
  }

  callbackUrl(orderId: string, paymentId: string) {
    return `${String(this.config.get('WEB_URL') ?? 'http://localhost:3002').replace(/\/$/, '')}/orders/${encodeURIComponent(orderId)}?paymentId=${encodeURIComponent(paymentId)}`;
  }

  readiness() {
    if (this.name === 'mock') return this.mock.readiness();
    const implemented = this.name === 'zarinpal';
    const ready =
      implemented && Boolean(this.config.get<string>('ZARINPAL_MERCHANT_ID'));
    return {
      status: ready ? ('ready' as const) : ('not_ready' as const),
      reason: ready
        ? undefined
        : implemented
          ? 'provider_configuration_missing'
          : 'configured_driver_is_not_implemented',
      details: {
        configuredDriver: this.name,
        activeAdapter: implemented ? 'zarinpal' : 'none',
        mode: 'live',
        verification: 'configuration_only',
      },
    };
  }
  private assertConfigured() {
    if (this.readiness().status !== 'ready')
      throw new BadGatewayException('درگاه پرداخت پیکربندی نشده است.');
  }
  private rials(toman: number) {
    if (
      !Number.isSafeInteger(toman) ||
      toman <= 0 ||
      !Number.isSafeInteger(toman * 10)
    )
      throw new BadGatewayException('مبلغ پرداخت نامعتبر است.');
    return toman * 10;
  }
  private async call(
    method: 'request' | 'verify',
    body: Record<string, unknown>,
  ) {
    const result = await providerJson(
      `https://api.zarinpal.com/pg/v4/payment/${method}.json`,
      {
        ...body,
        merchant_id: this.config.get<string>('ZARINPAL_MERCHANT_ID'),
      },
    );
    const data = result.data;
    if (!data || typeof data !== 'object' || Array.isArray(data))
      throw new BadGatewayException('پاسخ درگاه قابل تأیید نیست.');
    return data as Record<string, unknown>;
  }
}
