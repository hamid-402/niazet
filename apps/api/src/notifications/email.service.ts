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
    this.logger.log(
      `[MOCK EMAIL] ${idempotencyKey} -> ${to}: ${subject} | ${body}`,
    );
    return Promise.resolve();
  }
}

@Injectable()
export class EmailService {
  private readonly driver: EmailProvider;

  constructor(config: ConfigService, mockProvider: MockEmailProvider) {
    this.driver = mockProvider;
    void config.get('EMAIL_DRIVER');
  }

  send(to: string, subject: string, body: string, idempotencyKey: string) {
    return this.driver.send(to, subject, body, idempotencyKey);
  }
}
