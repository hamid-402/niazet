import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminScope, UserRole } from '@prisma/client';
import { AdminScopes } from '../common/decorators/admin-scopes.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminScopeGuard } from '../common/guards/admin-scope.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ReportQueryDto } from './dto/report-query.dto';
import { ReportingService } from './reporting.service';

@Controller('v1/admin/reports')
@UseGuards(RolesGuard, AdminScopeGuard)
@Roles(UserRole.admin)
export class ReportingController {
  constructor(private readonly reporting: ReportingService) {}

  @Get('operations')
  @AdminScopes(AdminScope.ops_admin)
  operations(@Query() query: ReportQueryDto) {
    return this.reporting.operations(query);
  }

  @Get('finance')
  @AdminScopes(AdminScope.finance_admin)
  finance(@Query() query: ReportQueryDto) {
    return this.reporting.finance(query);
  }
}
