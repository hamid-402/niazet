import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KavenegarProvider } from './live-providers';

/**
 * Shared mock/Kavenegar interface. Live credentials are gated by configuration;
 * see docs/PRODUCTION_PROVIDERS.md for delivery and retry limitations.
 */
export interface SmsProvider {
  send(phone: string, message: string, idempotencyKey?: string): Promise<void>;
}

@Injectable()
export class MockSmsProvider implements SmsProvider {
  private readonly logger = new Logger('MockSmsProvider');

  send(phone: string, message: string, idempotencyKey?: string): Promise<void> {
    void phone;
    void message;
    this.logger.log({ event: 'mock.sms.sent', idempotencyKey });
    return Promise.resolve();
  }
}

@Injectable()
export class SmsService {
  private readonly driver: SmsProvider;
  private readonly configuredDriver: string;

  constructor(
    private readonly config: ConfigService,
    private readonly mockProvider: MockSmsProvider,
  ) {
    this.configuredDriver = this.config.get<string>('SMS_DRIVER') ?? 'mock';
    this.driver =
      this.configuredDriver === 'kavenegar'
        ? new KavenegarProvider(config)
        : this.mockProvider;
  }

  send(phone: string, message: string, idempotencyKey?: string): Promise<void> {
    if (this.readiness().status !== 'ready')
      throw new BadGatewayException('سرویس پیامک تنظیم نشده است.');
    return this.driver.send(phone, message, idempotencyKey);
  }

  sendOtp(phone: string, code: string) {
    if (this.readiness().status !== 'ready')
      throw new BadGatewayException('سرویس پیامک تنظیم نشده است.');
    return this.driver instanceof KavenegarProvider
      ? this.driver.sendOtp(phone, code)
      : this.driver.send(phone, `کد تایید نیازت با ما: ${code}`);
  }

  readiness() {
    if (this.configuredDriver === 'kavenegar') {
      const ready = [
        'KAVENEGAR_API_KEY',
        'KAVENEGAR_SENDER',
        'KAVENEGAR_OTP_TEMPLATE',
      ].every((key) => Boolean(this.config.get(key)));
      return {
        status: ready ? ('ready' as const) : ('not_ready' as const),
        reason: ready ? undefined : 'provider_configuration_missing',
        details: {
          configuredDriver: 'kavenegar',
          activeAdapter: 'kavenegar',
          mode: 'live',
          verification: 'configuration_only',
        },
      };
    }
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
        verification: 'simulated',
      },
    };
  }
}
