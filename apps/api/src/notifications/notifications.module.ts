import { Global, Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { MockSmsProvider, SmsService } from './sms.service';

@Global()
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, SmsService, MockSmsProvider],
  exports: [NotificationsService, SmsService],
})
export class NotificationsModule {}
