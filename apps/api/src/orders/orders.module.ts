import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { OrdersAdminController } from './orders.admin.controller';
import { FinanceModule } from '../finance/finance.module';
import { OrderAssignmentService } from './domain/order-assignment.service';
import { OrderDisputeService } from './domain/order-dispute.service';
import { OrderMessagingService } from './domain/order-messaging.service';
import { OrderWorkflowModule } from './domain/order-workflow.module';
import { OrderQueryService } from './domain/order-query.service';
import { OrderSuggestionsController } from './order-suggestions.controller';
import { OrderSuggestionsService } from './order-suggestions.service';
import { ContractDashboardService } from '../contracts/dashboard.service';
import { DeferredAiController } from '../contracts/deferred-ai.controller';
import {
  ContractAdminReadController,
  CustomerDashboardController,
} from '../contracts/dashboard.controller';

@Module({
  imports: [FinanceModule, OrderWorkflowModule],
  controllers: [
    OrdersController,
    OrdersAdminController,
    OrderSuggestionsController,
    CustomerDashboardController,
    DeferredAiController,
    ContractAdminReadController,
  ],
  providers: [
    OrdersService,
    OrderAssignmentService,
    OrderMessagingService,
    OrderDisputeService,
    OrderQueryService,
    OrderSuggestionsService,
    ContractDashboardService,
  ],
  exports: [OrdersService, OrderWorkflowModule],
})
export class OrdersModule {}
