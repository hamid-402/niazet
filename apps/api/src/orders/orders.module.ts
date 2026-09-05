import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { OrdersAdminController } from './orders.admin.controller';
import { FinanceModule } from '../finance/finance.module';
import { OrderAssignmentService } from './domain/order-assignment.service';
import { OrderDisputeService } from './domain/order-dispute.service';
import { OrderMessagingService } from './domain/order-messaging.service';
import { OrderWorkflowService } from './domain/order-workflow.service';
import { OrderQueryService } from './domain/order-query.service';

@Module({
  imports: [FinanceModule],
  controllers: [OrdersController, OrdersAdminController],
  providers: [
    OrdersService,
    OrderWorkflowService,
    OrderAssignmentService,
    OrderMessagingService,
    OrderDisputeService,
    OrderQueryService,
  ],
  exports: [OrdersService, OrderWorkflowService],
})
export class OrdersModule {}
