import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/finance.module';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  imports: [FinanceModule],
  controllers: [HealthController],
  providers: [HealthService],
  exports: [HealthService],
})
export class HealthModule {}
