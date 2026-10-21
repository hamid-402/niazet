import { IsBoolean } from 'class-validator';

export class UpdateNotificationPreferenceDto {
  @IsBoolean()
  inAppEnabled!: boolean;

  @IsBoolean()
  emailEnabled!: boolean;

  @IsBoolean()
  smsEnabled!: boolean;
}
