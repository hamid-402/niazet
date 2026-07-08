import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminScope, UserRole, UserStatus } from '@prisma/client';
import { UsersService } from './users.service';
import { AuditService } from '../audit/audit.service';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminScopes } from '../common/decorators/admin-scopes.decorator';
import { AdminScopeGuard } from '../common/guards/admin-scope.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { buildPagination, PaginationDto } from '../common/dto/pagination.dto';
import {
  CreateAdminDto,
  UpdateAdminScopeDto,
  UpdateUserStatusDto,
} from './dto/user.dto';

@Controller('v1/admin/users')
@UseGuards(RolesGuard, AdminScopeGuard)
@Roles(UserRole.admin)
export class UsersAdminController {
  constructor(
    private readonly users: UsersService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @AdminScopes(AdminScope.super_admin, AdminScope.ops_admin)
  list(
    @Query() pagination: PaginationDto,
    @Query('role') role?: UserRole,
    @Query('status') status?: UserStatus,
  ) {
    const { skip, take } = buildPagination(pagination);
    return this.users.listUsers({ role, status, skip, take });
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
  ) {
    const result = await this.users.setStatus(id, dto.status);
    await this.audit.record({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'user.status_changed',
      entityType: 'user',
      entityId: id,
      after: { status: dto.status },
      sensitivity: 'critical',
    });
    return result;
  }
}

@Controller('v1/admin/admins')
@UseGuards(RolesGuard, AdminScopeGuard)
@Roles(UserRole.admin)
@AdminScopes(AdminScope.super_admin)
export class AdminsAdminController {
  constructor(
    private readonly users: UsersService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list() {
    return this.users.listAdmins();
  }

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAdminDto,
  ) {
    const result = await this.users.createAdmin(dto);
    await this.audit.record({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'admin.created',
      entityType: 'user',
      entityId: result.id,
      after: { adminScope: dto.adminScope },
      sensitivity: 'critical',
    });
    return result;
  }

  @Patch(':id/scope')
  async updateScope(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateAdminScopeDto,
  ) {
    const result = await this.users.updateAdminScope(id, dto.adminScope);
    await this.audit.record({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'admin.scope_changed',
      entityType: 'user',
      entityId: id,
      after: { adminScope: dto.adminScope },
      sensitivity: 'critical',
    });
    return result;
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
  list(
    @Query() pagination: PaginationDto,
    @Query('entityType') entityType?: string,
    @Query('actorUserId') actorUserId?: string,
  ) {
    const { skip, take } = buildPagination(pagination);
    return this.audit.list({ entityType, actorUserId, skip, take });
  }
}
