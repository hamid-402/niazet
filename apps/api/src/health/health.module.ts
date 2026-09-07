import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/finance.module';
import { FilesModule } from '../files/files.module';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  imports: [FinanceModule, FilesModule],
  controllers: [HealthController],
  providers: [HealthService],
  exports: [HealthService],
})
export class HealthModule {}
