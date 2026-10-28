import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
export function customerIntakeEnabled(config: ConfigService): boolean {
  const value = config.get<string | boolean>('ZEUS_CUSTOMER_INTAKE_ENABLED');
  return value === true || value === 'true';
}
export function requireCustomerIntake(config: ConfigService) {
  if (!customerIntakeEnabled(config))
    throw new ServiceUnavailableException(
      'اطلاعات تکمیلی مشتری هنوز در این محیط پذیرفته و فعال نشده است.',
    );
}
