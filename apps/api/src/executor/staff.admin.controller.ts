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
import { AdminScope, ExecutorStatus, UserRole } from '@prisma/client';
import { ExecutorService } from './executor.service';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminScopes } from '../common/decorators/admin-scopes.decorator';
import { AdminScopeGuard } from '../common/guards/admin-scope.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { buildPagination, PaginationDto } from '../common/dto/pagination.dto';
import {
  CreateStaffDto,
  CreateTeamDto,
  UpdateStaffCapacityDto,
  UpdateStaffStatusDto,
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
  create(@Body() dto: CreateStaffDto) {
    return this.executor.createStaff(dto);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.executor.getProfileForAdmin(id);
  }

  @Get(':id/performance')
  performance(@Param('id') id: string) {
    return this.executor.recalculatePerformance(id);
  }

  @Patch(':id/status')
  setStatus(@Param('id') id: string, @Body() dto: UpdateStaffStatusDto) {
    return this.executor.setStatus(id, dto.status);
  }

  @Patch(':id/capacity')
  setCapacity(@Param('id') id: string, @Body() dto: UpdateStaffCapacityDto) {
    return this.executor.setCapacity(id, dto.capacityPercent);
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
  create(@Body() dto: CreateTeamDto) {
    return this.executor.createTeam(dto);
  }
}
