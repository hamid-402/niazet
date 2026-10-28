import { Module } from '@nestjs/common';
import { ExecutorModule } from '../executor/executor.module';
import { FilesModule } from '../files/files.module';
import { FinanceModule } from '../finance/finance.module';
import { TicketsModule } from '../tickets/tickets.module';
import { OrdersModule } from '../orders/orders.module';
import { JobRunnerService } from './job-runner.service';
import { JobsAdminController } from './jobs.admin.controller';
import { JobsService } from './jobs.service';
import { OutboxWorkerService } from './outbox-worker.service';
import { DataCleanupService } from './data-cleanup.service';

@Module({
  imports: [
    FinanceModule,
    TicketsModule,
    ExecutorModule,
    FilesModule,
    OrdersModule,
  ],
  controllers: [JobsAdminController],
  providers: [
    JobRunnerService,
    OutboxWorkerService,
    DataCleanupService,
    JobsService,
  ],
  exports: [JobRunnerService, OutboxWorkerService],
})
export class JobsModule {}
