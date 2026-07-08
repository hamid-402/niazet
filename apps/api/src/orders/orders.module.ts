import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { OrdersAdminController } from './orders.admin.controller';
import { FinanceModule } from '../finance/finance.module';

@Module({
  imports: [FinanceModule],
  controllers: [OrdersController, OrdersAdminController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
