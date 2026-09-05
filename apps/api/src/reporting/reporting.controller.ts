import {
  Controller,
  Get,
  Query,
  Req,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AdminScope, UserRole } from '@prisma/client';
import { AdminScopes } from '../common/decorators/admin-scopes.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminScopeGuard } from '../common/guards/admin-scope.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RateLimit } from '../common/decorators/rate-limit.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { AuditService } from '../audit/audit.service';
import { ReportQueryDto } from './dto/report-query.dto';
import { ReportingService } from './reporting.service';

@Controller('v1/admin/reports')
@UseGuards(RolesGuard, AdminScopeGuard)
@Roles(UserRole.admin)
export class ReportingController {
  constructor(
    private readonly reporting: ReportingService,
    private readonly audit: AuditService,
  ) {}

  @Get('operations/export')
  @AdminScopes(AdminScope.ops_admin)
  @RateLimit({ name: 'operations-report-export', limit: 5, windowMs: 60_000 })
  async operationsExport(
    @Query() query: ReportQueryDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    const exported = await this.reporting.operationsCsv(query);
    await this.audit.record({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'report.operations.export',
      entityType: 'report_export',
      entityId: 'operations',
      sensitivity: 'sensitive',
      ipAddress: request.ip,
      after: {
        format: 'csv',
        rowCount: exported.rowCount,
        period: exported.period,
      },
    });
    return new StreamableFile(Buffer.from(exported.content, 'utf8'), {
      type: 'text/csv; charset=utf-8',
      disposition: 'attachment; filename="niazat-operations-report.csv"',
    });
  }

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

  @Get('finance/export')
  @AdminScopes(AdminScope.finance_admin)
  @RateLimit({ name: 'finance-report-export', limit: 5, windowMs: 60_000 })
  async financeExport(
    @Query() query: ReportQueryDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    const exported = await this.reporting.financeCsv(query);
    await this.audit.record({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'report.finance.export',
      entityType: 'report_export',
      entityId: 'finance',
      sensitivity: 'sensitive',
      ipAddress: request.ip,
      after: {
        format: 'csv',
        rowCount: exported.rowCount,
        period: exported.period,
      },
    });
    return new StreamableFile(Buffer.from(exported.content, 'utf8'), {
      type: 'text/csv; charset=utf-8',
      disposition: 'attachment; filename="niazat-finance-report.csv"',
    });
  }
}
