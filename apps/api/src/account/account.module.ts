import { Module } from '@nestjs/common';
import { AccountController } from './account.controller';
import { AccountService } from './account.service';
import { CustomerOnboardingService } from './customer-onboarding.service';
import { CustomerOnboardingController } from './customer-onboarding.controller';

@Module({
  controllers: [AccountController, CustomerOnboardingController],
  providers: [AccountService, CustomerOnboardingService],
})
export class AccountModule {}
