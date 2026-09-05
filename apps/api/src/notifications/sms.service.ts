import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Abstract SMS gateway. Only a mock driver is implemented for now
 * (see docs/ROADMAP.md §۲ — سوال ۳). Swap `SMS_DRIVER` env var and
 * implement a real provider (کاوه‌نگار/ملی‌پیامک/...) behind this
 * same interface when ready; no call-site changes should be needed.
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
    // Only "mock" is implemented in this phase; future drivers register here.
    this.driver = this.mockProvider;
    this.configuredDriver = this.config.get<string>('SMS_DRIVER') ?? 'mock';
  }

  send(phone: string, message: string, idempotencyKey?: string): Promise<void> {
    return this.driver.send(phone, message, idempotencyKey);
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
