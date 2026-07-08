import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Abstract SMS gateway. Only a mock driver is implemented for now
 * (see docs/ROADMAP.md §۲ — سوال ۳). Swap `SMS_DRIVER` env var and
 * implement a real provider (کاوه‌نگار/ملی‌پیامک/...) behind this
 * same interface when ready; no call-site changes should be needed.
 */
export interface SmsProvider {
  send(phone: string, message: string): Promise<void>;
}

@Injectable()
export class MockSmsProvider implements SmsProvider {
  private readonly logger = new Logger('MockSmsProvider');

  send(phone: string, message: string): Promise<void> {
    this.logger.log(`[MOCK SMS] to ${phone}: ${message}`);
    return Promise.resolve();
  }
}

@Injectable()
export class SmsService {
  private readonly driver: SmsProvider;

  constructor(
    private readonly config: ConfigService,
    private readonly mockProvider: MockSmsProvider,
  ) {
    // Only "mock" is implemented in this phase; future drivers register here.
    this.driver = this.mockProvider;
    void this.config.get('SMS_DRIVER');
  }

  send(phone: string, message: string): Promise<void> {
    return this.driver.send(phone, message);
  }
}
