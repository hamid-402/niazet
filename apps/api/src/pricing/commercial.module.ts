import { Module } from '@nestjs/common';
import { OrderWorkflowModule } from '../orders/domain/order-workflow.module';
import { IdempotencyService } from '../finance/idempotency.service';
import { CommercialService } from './commercial.service';
import { CommercialClock } from './commercial-clock';
import {
  CommercialAdminController,
  CustomerCommercialController,
} from './commercial.controller';

@Module({
  imports: [OrderWorkflowModule],
  controllers: [CommercialAdminController, CustomerCommercialController],
  providers: [CommercialService, CommercialClock, IdempotencyService],
  exports: [CommercialService, CommercialClock],
})
export class CommercialModule {}
