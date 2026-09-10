import { ConfigService } from '@nestjs/config';
import { PaymentGatewayService } from './zarinpal.gateway';
import { MockPaymentGateway } from './payment-gateway';
import { providerJson } from '../common/provider-http';
import { validateProviderEnvironment } from '../config/provider-environment';
import {
  KavenegarProvider,
  SmtpProvider,
} from '../notifications/live-providers';
import nodemailer from 'nodemailer';
jest.mock('../common/provider-http', () => ({ providerJson: jest.fn() }));
jest.mock('nodemailer', () => ({
  __esModule: true,
  default: { createTransport: jest.fn() },
}));

describe('production provider boundaries', () => {
  const request = jest.mocked(providerJson);
  const config = new ConfigService({
    PAYMENT_GATEWAY_DRIVER: 'zarinpal',
    ZARINPAL_MERCHANT_ID: 'test-merchant',
    WEB_URL: 'https://niazat.example.invalid',
    KAVENEGAR_API_KEY: 'test-key',
    KAVENEGAR_OTP_TEMPLATE: 'login',
    SMTP_FROM: 'sender@example.invalid',
  });
  const gateway = new PaymentGatewayService(
    config,
    new MockPaymentGateway(config),
  );
  beforeEach(() => jest.clearAllMocks());
  it('creates a request in rials and redirects only to the official gateway', async () => {
    const authority = `A${'0'.repeat(35)}`;
    request.mockResolvedValue({ data: { code: 100, authority } });
    const callback = gateway.callbackUrl('order', 'payment');
    const result = await gateway.createPaymentRequest({
      amount: 42000,
      orderId: 'order',
      callbackUrl: callback,
    });
    expect(request).toHaveBeenCalledWith(
      'https://api.zarinpal.com/pg/v4/payment/request.json',
      expect.objectContaining({
        amount: 420000,
        callback_url:
          'https://niazat.example.invalid/orders/order?paymentId=payment',
      }),
    );
    expect(result.redirectUrl).toBe(
      `https://www.zarinpal.com/pg/StartPay/${authority}`,
    );
  });
  it.each([100, 101])('accepts server verification code %s', async (code) => {
    request.mockResolvedValue({ data: { code } });
    await expect(
      gateway.verifyPayment({ gatewayRef: 'saved-reference', amount: 1000 }),
    ).resolves.toEqual({ verified: true });
  });
  it.each([-21, -51, 0, '100', undefined])(
    'never settles unverified or malformed code %s',
    async (code) => {
      request.mockResolvedValue({ data: { code } });
      await expect(
        gateway.verifyPayment({ gatewayRef: 'saved-reference', amount: 1000 }),
      ).rejects.toThrow();
    },
  );
  it('rejects a malformed authority without navigating anywhere', async () => {
    request.mockResolvedValue({
      data: { code: 100, authority: 'https://evil.invalid/' },
    });
    await expect(
      gateway.createPaymentRequest({
        amount: 1000,
        orderId: 'order',
        callbackUrl: 'https://niazat.example.invalid',
      }),
    ).rejects.toThrow();
  });
  it('does not silently fall back to mock for an unknown gateway', async () => {
    const other = new ConfigService({ PAYMENT_GATEWAY_DRIVER: 'unknown' });
    await expect(
      new PaymentGatewayService(
        other,
        new MockPaymentGateway(other),
      ).verifyPayment({ gatewayRef: 'x', amount: 1 }),
    ).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });
  it('sends OTP through the approved template with form body, not query text', async () => {
    request.mockResolvedValue({ return: { status: 200 } });
    await new KavenegarProvider(config).sendOtp('09120000000', '123456');
    const [url, body] = request.mock.calls[0];
    expect(url).not.toContain('?');
    expect(body).toBeInstanceOf(URLSearchParams);
    expect((body as URLSearchParams).get('template')).toBe('login');
    expect((body as URLSearchParams).get('token')).toBe('123456');
  });
  it('rejects a provider-level SMS error', async () => {
    request.mockResolvedValue({ return: { status: 401 } });
    await expect(
      new KavenegarProvider(config).sendOtp('09120000000', '123456'),
    ).rejects.toThrow();
  });
  it('requires TLS and blocks attachment access while preserving a stable email identifier', async () => {
    const sendMail = jest.fn().mockResolvedValue({
      accepted: ['recipient@example.invalid'],
      rejected: [],
    });
    jest
      .mocked(nodemailer.createTransport)
      .mockReturnValue({ sendMail } as unknown as ReturnType<
        typeof nodemailer.createTransport
      >);
    const provider = new SmtpProvider(config);
    await provider.send(
      'recipient@example.invalid',
      'subject',
      'body',
      'same-event',
    );
    await provider.send(
      'recipient@example.invalid',
      'subject',
      'body',
      'same-event',
    );
    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        requireTLS: true,
        disableUrlAccess: true,
        disableFileAccess: true,
        debug: false,
      }),
    );
    const calls = sendMail.mock.calls as unknown as Array<
      [{ messageId: string }]
    >;
    expect(calls[0][0].messageId).toBe(calls[1][0].messageId);
  });
  it('fails startup on unsupported drivers, missing credentials and absent activation', () => {
    expect(() =>
      validateProviderEnvironment({ PAYMENT_GATEWAY_DRIVER: 'unknown' }),
    ).toThrow('not implemented');
    expect(() =>
      validateProviderEnvironment({ SMS_DRIVER: 'kavenegar' }),
    ).toThrow('KAVENEGAR_API_KEY');
    expect(() =>
      validateProviderEnvironment({
        PAYMENT_GATEWAY_DRIVER: 'zarinpal',
        ZARINPAL_MERCHANT_ID: 'test',
      }),
    ).toThrow('LIVE_PROVIDERS_ENABLED');
    expect(() => validateProviderEnvironment({})).not.toThrow();
  });
});
