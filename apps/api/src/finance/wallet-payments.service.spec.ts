import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IdempotencyService } from './idempotency.service';
import { LedgerService } from './ledger.service';
import { MockPaymentGateway } from './payment-gateway';
import { PaymentGatewayService } from './zarinpal.gateway';
import {
  assertWalletAmount,
  MAX_WALLET_AMOUNT,
  WalletPaymentsService,
} from './wallet-payments.service';

describe('Zeus wallet safety boundaries', () => {
  it('cannot mint mock funds in production even with the switch on', () => {
    const config = new ConfigService({
      NODE_ENV: 'production',
      ZEUS_WALLET_ENABLED: true,
      PAYMENT_GATEWAY_DRIVER: 'mock',
    });
    const db = {} as PrismaService;
    const gateway = new PaymentGatewayService(
      config,
      new MockPaymentGateway(config),
    );
    const service = new WalletPaymentsService(
      db,
      {} as LedgerService,
      {} as IdempotencyService,
      gateway,
      config,
    );
    expect(() => service.list('owner')).toThrow(ServiceUnavailableException);
  });
  it.each([
    0,
    -1,
    1.5,
    NaN,
    Infinity,
    MAX_WALLET_AMOUNT + 1,
    Number.MAX_SAFE_INTEGER,
  ])('rejects invalid amount %s', (amount) => {
    expect(() => assertWalletAmount(amount)).toThrow();
  });
  it.each([1, MAX_WALLET_AMOUNT])('accepts bounded integer %s', (amount) => {
    expect(() => assertWalletAmount(amount)).not.toThrow();
  });
  it.each([
    {},
    { ZEUS_WALLET_ENABLED: 'false' },
    { ZEUS_WALLET_ENABLED: true, PAYMENT_GATEWAY_DRIVER: 'zarinpal' },
  ])('does not access new tables when disabled or live', (values) => {
    const settings: Record<string, unknown> = { NODE_ENV: 'test', ...values };
    const config = new ConfigService(settings);
    // This fixture tests absent/disabled/live settings, not the operator's
    // enabled local .env loaded by another Prisma test in this worker.
    jest
      .spyOn(config, 'get')
      .mockImplementation((key: string) => settings[key]);
    const findMany = jest.fn();
    const db = {
      walletFundingIntent: { findMany },
    } as unknown as PrismaService;
    const gateway = new PaymentGatewayService(
      config,
      new MockPaymentGateway(config),
    );
    const service = new WalletPaymentsService(
      db,
      {} as LedgerService,
      {} as IdempotencyService,
      gateway,
      config,
    );
    expect(() => service.list('owner')).toThrow(ServiceUnavailableException);
    expect(findMany).not.toHaveBeenCalled();
  });
  it('preserves callback query parameters in the mock payment rail', async () => {
    const gateway = new MockPaymentGateway(new ConfigService());
    const result = await gateway.createPaymentRequest({
      amount: 100,
      orderId: 'intent',
      callbackUrl: 'http://localhost:3002/wallet?topUpId=intent',
    });
    const redirect = new URL(result.redirectUrl);
    expect(redirect.searchParams.get('topUpId')).toBe('intent');
    expect(redirect.searchParams.get('gatewayRef')).toBe(result.gatewayRef);
    expect(redirect.searchParams.get('status')).toBe('success');
  });
});
