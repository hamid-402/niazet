import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AdminScope, UserRole } from '@prisma/client';
import { QcService } from './qc.service';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminScopes } from '../common/decorators/admin-scopes.decorator';
import { AdminScopeGuard } from '../common/guards/admin-scope.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { SubmitQcReviewDto } from './dto/qc.dto';

@Controller('v1/admin/qc')
@UseGuards(RolesGuard, AdminScopeGuard)
@Roles(UserRole.admin)
@AdminScopes(AdminScope.ops_admin)
export class QcController {
  constructor(private readonly qc: QcService) {}

  @Get('queue')
  queue() {
    return this.qc.listQueue();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.qc.getOne(id);
  }

  @Post(':id/approve')
  approve(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: SubmitQcReviewDto) {
    return this.qc.approve(id, user.id, dto);
  }

  @Post(':id/request-rework')
  requestRework(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SubmitQcReviewDto,
  ) {
    return this.qc.requestRework(id, user.id, dto);
  }

  @Post(':id/reject')
  reject(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: SubmitQcReviewDto) {
    return this.qc.reject(id, user.id, dto);
  }
}
