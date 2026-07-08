import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AdminScope, UserRole } from '@prisma/client';
import { CatalogService } from './catalog.service';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminScopes } from '../common/decorators/admin-scopes.decorator';
import { AdminScopeGuard } from '../common/guards/admin-scope.guard';
import {
  CreatePackageDto,
  CreateServiceDto,
  UpdateServiceDto,
} from './dto/service.dto';

@Controller('v1/admin/services')
@Roles(UserRole.admin)
@AdminScopes(AdminScope.ops_admin)
@UseGuards(AdminScopeGuard)
export class CatalogAdminController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  list() {
    return this.catalog.listAllForAdmin();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.catalog.getForAdmin(id);
  }

  @Post()
  create(@Body() dto: CreateServiceDto) {
    return this.catalog.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateServiceDto) {
    return this.catalog.update(id, dto);
  }

  @Patch(':id/active')
  setActive(@Param('id') id: string, @Body('isActive') isActive: boolean) {
    return this.catalog.setActive(id, isActive);
  }

  @Post(':id/packages')
  addPackage(@Param('id') id: string, @Body() dto: CreatePackageDto) {
    return this.catalog.addPackage(id, dto);
  }
}
