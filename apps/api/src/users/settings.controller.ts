import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { AdminScope, UserRole } from '@prisma/client';
import { SettingsService } from './settings.service';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminScopes } from '../common/decorators/admin-scopes.decorator';
import { AdminScopeGuard } from '../common/guards/admin-scope.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';

@Controller('v1/admin/settings')
@UseGuards(RolesGuard, AdminScopeGuard)
@Roles(UserRole.admin)
@AdminScopes(AdminScope.super_admin)
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  list() {
    return this.settings.list();
  }

  @Put()
  set(
    @CurrentUser() user: AuthenticatedUser,
    @Body('key') key: string,
    @Body('value') value: unknown,
  ) {
    return this.settings.set(key, value, user.id);
  }
}
