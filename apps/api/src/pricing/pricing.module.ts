import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { PricingController } from './pricing.controller';
import { PricingService } from './pricing.service';

@Module({
  imports: [CatalogModule],
  controllers: [PricingController],
  providers: [PricingService],
})
export class PricingModule {}
