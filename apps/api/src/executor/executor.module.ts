import { Module } from '@nestjs/common';
import { ExecutorService } from './executor.service';
import { ExecutorController } from './executor.controller';
import {
  StaffAdminController,
  SkillsAdminController,
  TeamsAdminController,
} from './staff.admin.controller';
import { OrdersModule } from '../orders/orders.module';
import { AuthModule } from '../auth/auth.module';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';

@Module({
  imports: [OrdersModule, AuthModule],
  controllers: [
    ExecutorController,
    StaffAdminController,
    TeamsAdminController,
    SkillsAdminController,
    OnboardingController,
  ],
  providers: [ExecutorService, OnboardingService],
  exports: [ExecutorService],
})
export class ExecutorModule {}
