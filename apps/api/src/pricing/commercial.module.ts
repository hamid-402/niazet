import { Module } from '@nestjs/common';
import { OrderWorkflowModule } from '../orders/domain/order-workflow.module';
import { IdempotencyService } from '../finance/idempotency.service';
import { CommercialService } from './commercial.service';
import { CommercialClock } from './commercial-clock';
import { FixedRegistrationService } from './fixed-registration.service';
import {
  CommercialAdminController,
  CustomerCommercialController,
} from './commercial.controller';

@Module({
  imports: [OrderWorkflowModule],
  controllers: [CommercialAdminController, CustomerCommercialController],
  providers: [
    CommercialService,
    CommercialClock,
    IdempotencyService,
    FixedRegistrationService,
  ],
  exports: [CommercialService, CommercialClock],
})
export class CommercialModule {}
