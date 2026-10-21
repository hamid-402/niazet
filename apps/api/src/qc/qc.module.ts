import { Module } from '@nestjs/common';
import { QcService } from './qc.service';
import { QcController } from './qc.controller';
import { OrdersModule } from '../orders/orders.module';

@Module({
  imports: [OrdersModule],
  controllers: [QcController],
  providers: [QcService],
  exports: [QcService],
})
export class QcModule {}
