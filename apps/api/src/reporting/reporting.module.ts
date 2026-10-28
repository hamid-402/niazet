import { Module } from '@nestjs/common';
import { ReportingController } from './reporting.controller';
import { ReportingService } from './reporting.service';
import { BiService } from './bi.service';

@Module({
  controllers: [ReportingController],
  providers: [ReportingService, BiService],
})
export class ReportingModule {}
