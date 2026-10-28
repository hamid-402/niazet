import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AdminScope, UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminScopes } from '../common/decorators/admin-scopes.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AdminScopeGuard } from '../common/guards/admin-scope.guard';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { ReportQueryDto } from '../reporting/dto/report-query.dto';
import { resolveReportRange } from '../reporting/reporting-metrics';
import { ContractDashboardService } from './dashboard.service';

@Controller('v1/customer/dashboard')
@UseGuards(RolesGuard)
@Roles(UserRole.customer)
export class CustomerDashboardController {
  constructor(private readonly data: ContractDashboardService) {}
  @Get() dashboard(@CurrentUser() user: AuthenticatedUser) {
    return this.data.customer(user.id);
  }
}
@Controller('v1/admin')
@UseGuards(RolesGuard, AdminScopeGuard)
@Roles(UserRole.admin)
export class ContractAdminReadController {
  constructor(private readonly data: ContractDashboardService) {}
  @Get('stats')
  @AdminScopes(AdminScope.super_admin)
  stats() {
    return this.data.global();
  }
  @Get('staff-report')
  @AdminScopes(AdminScope.ops_admin)
  staffReport(@Query() query: ReportQueryDto) {
    const range = resolveReportRange(query.from, query.to);
    return this.data.supportReport(range.start, range.end);
  }
  @Get('staff/:id/performance')
  @AdminScopes(AdminScope.ops_admin)
  performance(@Param('id') id: string) {
    return this.data.staffPerformance(id);
  }
}
