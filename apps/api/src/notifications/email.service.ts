import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SmtpProvider } from './live-providers';

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

  constructor(
    private readonly config: ConfigService,
    mockProvider: MockEmailProvider,
  ) {
    this.configuredDriver = config.get<string>('EMAIL_DRIVER') ?? 'mock';
    this.driver =
      this.configuredDriver === 'smtp'
        ? new SmtpProvider(config)
        : mockProvider;
  }

  send(to: string, subject: string, body: string, idempotencyKey: string) {
    if (this.readiness().status !== 'ready')
      throw new BadGatewayException('سرویس ایمیل تنظیم نشده است.');
    return this.driver.send(to, subject, body, idempotencyKey);
  }

  readiness() {
    if (this.configuredDriver === 'smtp') {
      const ready = [
        'SMTP_HOST',
        'SMTP_USER',
        'SMTP_PASSWORD',
        'SMTP_FROM',
      ].every((key) => Boolean(this.config.get(key)));
      return {
        status: ready ? ('ready' as const) : ('not_ready' as const),
        reason: ready ? undefined : 'provider_configuration_missing',
        details: {
          configuredDriver: 'smtp',
          activeAdapter: 'smtp',
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
