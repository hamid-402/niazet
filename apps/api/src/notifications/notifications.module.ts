import { Global, Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { MockSmsProvider, SmsService } from './sms.service';
import { EmailService, MockEmailProvider } from './email.service';

@Global()
@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    SmsService,
    MockSmsProvider,
    EmailService,
    MockEmailProvider,
  ],
  exports: [NotificationsService, SmsService, EmailService],
})
export class NotificationsModule {}
