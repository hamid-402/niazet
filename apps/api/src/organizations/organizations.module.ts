import { Module } from '@nestjs/common';
import {
  OrganizationsController,
  OrganizationAdminController,
} from './organizations.controller';
import { OrganizationsService } from './organizations.service';
@Module({
  controllers: [OrganizationsController, OrganizationAdminController],
  providers: [OrganizationsService],
})
export class OrganizationsModule {}
