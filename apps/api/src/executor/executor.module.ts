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

@Module({
  imports: [OrdersModule, AuthModule],
  controllers: [
    ExecutorController,
    StaffAdminController,
    TeamsAdminController,
    SkillsAdminController,
  ],
  providers: [ExecutorService],
  exports: [ExecutorService],
})
export class ExecutorModule {}
