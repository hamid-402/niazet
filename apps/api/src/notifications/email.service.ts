import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface EmailProvider {
  send(
    to: string,
    subject: string,
    body: string,
    idempotencyKey: string,
  ): Promise<void>;
}

@Injectable()
export class MockEmailProvider implements EmailProvider {
  private readonly logger = new Logger('MockEmailProvider');

  send(to: string, subject: string, body: string, idempotencyKey: string) {
    void to;
    void subject;
    void body;
    this.logger.log({ event: 'mock.email.sent', idempotencyKey });
    return Promise.resolve();
  }
}

@Injectable()
export class EmailService {
  private readonly driver: EmailProvider;
  private readonly configuredDriver: string;

  constructor(config: ConfigService, mockProvider: MockEmailProvider) {
    this.driver = mockProvider;
    this.configuredDriver = config.get<string>('EMAIL_DRIVER') ?? 'mock';
  }

  send(to: string, subject: string, body: string, idempotencyKey: string) {
    return this.driver.send(to, subject, body, idempotencyKey);
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
