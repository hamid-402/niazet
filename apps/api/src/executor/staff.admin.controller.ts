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
import { AdminScope, ExecutorStatus, UserRole } from '@prisma/client';
import { ExecutorService } from './executor.service';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminScopes } from '../common/decorators/admin-scopes.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AdminScopeGuard } from '../common/guards/admin-scope.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { buildPagination, PaginationDto } from '../common/dto/pagination.dto';
import {
  AcknowledgeStaffRiskDto,
  AttendanceQueryDto,
  CreateStaffDto,
  CreateSkillDto,
  CreateTeamDto,
  UpdateStaffAccessDto,
  UpdateStaffCapacityDto,
  UpdateStaffProfileDto,
  UpdateStaffSkillsDto,
  UpdateStaffStatusDto,
  UpsertAttendanceDto,
} from './dto/executor.dto';

@Controller('v1/admin/staff')
@UseGuards(RolesGuard, AdminScopeGuard)
@Roles(UserRole.admin)
@AdminScopes(AdminScope.ops_admin)
export class StaffAdminController {
  constructor(private readonly executor: ExecutorService) {}

  @Get()
  list(
    @Query() pagination: PaginationDto,
    @Query('teamId') teamId?: string,
    @Query('status') status?: ExecutorStatus,
  ) {
    const { skip, take } = buildPagination(pagination);
    return this.executor.listStaffForAdmin({ teamId, status, skip, take });
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateStaffDto,
    @Req() req: Request,
  ) {
    return this.executor.createStaff(dto, user, req.ip);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.executor.getProfileForAdmin(id);
  }

  @Post(':id/performance/recalculate')
  performance(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.executor.recalculatePerformanceForAdmin(id, user, req.ip);
  }

  @Patch(':id/status')
  setStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateStaffStatusDto,
    @Req() req: Request,
  ) {
    return this.executor.setStatus(id, dto.status, dto.note, user, req.ip);
  }

  @Patch(':id/capacity')
  setCapacity(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateStaffCapacityDto,
    @Req() req: Request,
  ) {
    return this.executor.setCapacity(
      id,
      dto.capacityPercent,
      dto.note,
      user,
      req.ip,
    );
  }

  @Patch(':id/profile')
  updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateStaffProfileDto,
    @Req() req: Request,
  ) {
    return this.executor.updateProfile(id, dto, user, req.ip);
  }

  @Patch(':id/skills')
  updateSkills(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateStaffSkillsDto,
    @Req() req: Request,
  ) {
    return this.executor.updateSkills(id, dto, user, req.ip);
  }

  @Get(':id/attendance')
  attendance(@Param('id') id: string, @Query() query: AttendanceQueryDto) {
    return this.executor.listAttendance(id, query);
  }

  @Patch(':id/attendance')
  upsertAttendance(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpsertAttendanceDto,
    @Req() req: Request,
  ) {
    return this.executor.upsertAttendance(id, dto, user, req.ip);
  }

  @Patch(':id/access')
  updateAccess(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateStaffAccessDto,
    @Req() req: Request,
  ) {
    return this.executor.updateAccess(id, dto, user, req.ip);
  }

  @Patch(':id/alerts/:alertId/acknowledge')
  acknowledgeAlert(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('alertId') alertId: string,
    @Body() dto: AcknowledgeStaffRiskDto,
    @Req() req: Request,
  ) {
    return this.executor.acknowledgeRiskAlert(
      id,
      alertId,
      dto.note,
      user,
      req.ip,
    );
  }
}

@Controller('v1/admin/teams')
@UseGuards(RolesGuard, AdminScopeGuard)
@Roles(UserRole.admin)
@AdminScopes(AdminScope.ops_admin)
export class TeamsAdminController {
  constructor(private readonly executor: ExecutorService) {}

  @Get()
  list() {
    return this.executor.listTeams();
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateTeamDto,
    @Req() req: Request,
  ) {
    return this.executor.createTeam(dto, user, req.ip);
  }
}

@Controller('v1/admin/skills')
@UseGuards(RolesGuard, AdminScopeGuard)
@Roles(UserRole.admin)
@AdminScopes(AdminScope.ops_admin)
export class SkillsAdminController {
  constructor(private readonly executor: ExecutorService) {}

  @Get()
  list() {
    return this.executor.listSkills();
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSkillDto,
    @Req() req: Request,
  ) {
    return this.executor.createSkill(dto, user, req.ip);
  }
}
