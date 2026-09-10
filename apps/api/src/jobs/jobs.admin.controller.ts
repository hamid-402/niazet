import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AdminScope, UserRole } from '@prisma/client';
import { AdminScopes } from '../common/decorators/admin-scopes.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminScopeGuard } from '../common/guards/admin-scope.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { JOB_NAMES, type JobName } from './job.types';
import { JobsService } from './jobs.service';

@Controller('v1/admin/jobs')
@UseGuards(RolesGuard, AdminScopeGuard)
@Roles(UserRole.admin)
@AdminScopes(AdminScope.super_admin)
export class JobsAdminController {
  constructor(private readonly jobs: JobsService) {}

  @Get()
  list() {
    return this.jobs.list();
  }

  @Post(':name/run')
  run(@Param('name') name: string) {
    if (!JOB_NAMES.includes(name as JobName)) {
      throw new BadRequestException(`Unknown job: ${name}`);
    }
    return this.jobs.run(name as JobName);
  }
}
