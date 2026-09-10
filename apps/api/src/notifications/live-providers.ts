import { BadGatewayException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import nodemailer from 'nodemailer';
import { providerJson } from '../common/provider-http';

export class KavenegarProvider {
  constructor(private readonly config: ConfigService) {}
  async send(phone: string, message: string) {
    await this.request('sms/send', {
      receptor: phone,
      message,
      sender: this.config.get<string>('KAVENEGAR_SENDER') ?? '',
    });
  }
  async sendOtp(phone: string, code: string) {
    const template = this.config.get<string>('KAVENEGAR_OTP_TEMPLATE');
    if (!template)
      throw new BadGatewayException('الگوی پیامک تأیید تنظیم نشده است.');
    await this.request('verify/lookup', {
      receptor: phone,
      token: code,
      template,
    });
  }
  private async request(path: string, params: Record<string, string>) {
    const key = this.config.get<string>('KAVENEGAR_API_KEY');
    if (!key) throw new BadGatewayException('سرویس پیامک تنظیم نشده است.');
    const result = await providerJson(
      `https://api.kavenegar.com/v1/${encodeURIComponent(key)}/${path}.json`,
      new URLSearchParams(params),
    );
    const status = result.return as { status?: number } | undefined;
    if (status?.status !== 200)
      throw new BadGatewayException('سرویس‌دهنده ارسال پیامک را نپذیرفت.');
  }
}

export class SmtpProvider {
  constructor(private readonly config: ConfigService) {}
  private transport() {
    return nodemailer.createTransport({
      host: this.config.get<string>('SMTP_HOST'),
      port: Number(this.config.get('SMTP_PORT') ?? 587),
      secure: String(this.config.get('SMTP_SECURE')) === 'true',
      requireTLS: true,
      auth: {
        user: this.config.get<string>('SMTP_USER'),
        pass: this.config.get<string>('SMTP_PASSWORD'),
      },
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 10000,
      disableFileAccess: true,
      disableUrlAccess: true,
      logger: false,
      debug: false,
    });
  }
  async send(
    to: string,
    subject: string,
    body: string,
    idempotencyKey: string,
  ) {
    try {
      const result = await this.transport().sendMail({
        from: this.config.get<string>('SMTP_FROM'),
        to: { address: to, name: '' },
        subject,
        text: body,
        messageId: `<${createHash('sha256').update(idempotencyKey).digest('hex')}@niazat.local>`,
      });
      if (!result.accepted?.length || result.rejected?.length)
        throw new Error('smtp_rejected');
    } catch {
      throw new BadGatewayException(
        'ارسال ایمیل انجام نشد؛ سرویس ایمیل باید بررسی شود.',
      );
    }
  }
}
