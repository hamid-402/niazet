import { Controller, Get, Res, UseGuards } from '@nestjs/common';
import { AdminScope, UserRole } from '@prisma/client';
import type { Response } from 'express';
import { AdminScopes } from '../common/decorators/admin-scopes.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminScopeGuard } from '../common/guards/admin-scope.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { HealthService } from './health.service';

@Controller()
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Public()
  @Get('health')
  liveness() {
    return this.health.liveness();
  }

  @Public()
  @Get('ready')
  async readiness(@Res({ passthrough: true }) response: Response) {
    const report = await this.health.readiness();
    response.status(report.status === 'ready' ? 200 : 503);
    return {
      status: report.status,
      checkedAt: report.checkedAt,
      checks: Object.fromEntries(
        report.checks.map((check) => [check.name, check.status]),
      ),
    };
  }

  @Get('v1/admin/health/readiness')
  @UseGuards(RolesGuard, AdminScopeGuard)
  @Roles(UserRole.admin)
  @AdminScopes(
    AdminScope.super_admin,
    AdminScope.ops_admin,
    AdminScope.finance_admin,
  )
  async adminReadiness(@Res({ passthrough: true }) response: Response) {
    const report = await this.health.readiness();
    response.status(report.status === 'ready' ? 200 : 503);
    return report;
  }
}
