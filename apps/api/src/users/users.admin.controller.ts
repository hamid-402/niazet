import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AdminScope, UserRole } from '@prisma/client';
import { UsersService } from './users.service';
import { AuditService } from '../audit/audit.service';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminScopes } from '../common/decorators/admin-scopes.decorator';
import { AdminScopeGuard } from '../common/guards/admin-scope.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { buildPagination } from '../common/dto/pagination.dto';
import {
  AuditLogQueryDto,
  CreateAdminDto,
  ListUsersQueryDto,
  UpdateAdminScopeDto,
  UpdateUserStatusDto,
} from './dto/user.dto';

@Controller('v1/admin/users')
@UseGuards(RolesGuard, AdminScopeGuard)
@Roles(UserRole.admin)
export class UsersAdminController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @AdminScopes(AdminScope.super_admin, AdminScope.ops_admin)
  list(@Query() query: ListUsersQueryDto) {
    const { skip, take } = buildPagination(query);
    return this.users.listUsers({
      role: query.role,
      status: query.status,
      skip,
      take,
    });
  }

  @Get(':id')
  @AdminScopes(AdminScope.super_admin, AdminScope.ops_admin)
  get(@Param('id') id: string) {
    return this.users.getUser(id);
  }

  @Patch(':id/status')
  @AdminScopes(AdminScope.super_admin)
  async setStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateUserStatusDto,
    @Req() req: Request,
  ) {
    return this.users.setStatus(id, dto.status, user, req.ip);
  }
}

@Controller('v1/admin/admins')
@UseGuards(RolesGuard, AdminScopeGuard)
@Roles(UserRole.admin)
@AdminScopes(AdminScope.super_admin)
export class AdminsAdminController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list() {
    return this.users.listAdmins();
  }

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAdminDto,
    @Req() req: Request,
  ) {
    return this.users.createAdmin(dto, user, req.ip);
  }

  @Patch(':id/scope')
  async updateScope(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateAdminScopeDto,
    @Req() req: Request,
  ) {
    return this.users.updateAdminScope(id, dto.adminScope, user, req.ip);
  }
}

@Controller('v1/admin/audit-log')
@UseGuards(RolesGuard, AdminScopeGuard)
@Roles(UserRole.admin)
export class AuditLogAdminController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @AdminScopes(
    AdminScope.super_admin,
    AdminScope.ops_admin,
    AdminScope.finance_admin,
  )
  list(@Query() query: AuditLogQueryDto) {
    const { skip, take } = buildPagination(query);
    return this.audit.list({
      entityType: query.entityType,
      actorUserId: query.actorUserId,
      skip,
      take,
    });
  }
}
