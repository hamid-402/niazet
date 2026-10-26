import { Module } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { CatalogController } from './catalog.controller';
import { CatalogAdminController } from './catalog.admin.controller';
import { ServicePolicyAdminController } from '../contracts/service-policy.controller';

@Module({
  controllers: [
    CatalogController,
    CatalogAdminController,
    ServicePolicyAdminController,
  ],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
