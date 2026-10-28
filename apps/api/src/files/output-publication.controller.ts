import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminScope, UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminScopes } from '../common/decorators/admin-scopes.decorator';
import { RateLimit } from '../common/decorators/rate-limit.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AdminScopeGuard } from '../common/guards/admin-scope.guard';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { OutputPublicationService } from './output-publication.service';
import {
  PublicationQueueDto,
  ReviewOutputPublicationDto,
} from './output-publication.dto';

@Controller('v1/admin/output-publications')
@UseGuards(RolesGuard, AdminScopeGuard)
@Roles(UserRole.admin)
@AdminScopes(AdminScope.ops_admin)
@RateLimit({ name: 'output-publication-review', limit: 30, windowMs: 60000 })
export class AdminOutputPublicationController {
  constructor(private readonly publications: OutputPublicationService) {}
  @Get() queue(@Query() query: PublicationQueueDto) {
    return this.publications.reviewQueue(query.cursor);
  }
  @Post(':fileId/review') review(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('fileId') fileId: string,
    @Body() dto: ReviewOutputPublicationDto,
    @Headers('idempotency-key') key: string,
  ) {
    return this.publications.reviewFile(actor, fileId, dto, key);
  }
}
@Controller('v1/customer/orders/:id/output-publications')
@UseGuards(RolesGuard)
@Roles(UserRole.customer)
@RateLimit({ name: 'customer-output-publications', limit: 60, windowMs: 60000 })
export class CustomerOutputPublicationController {
  constructor(private readonly publications: OutputPublicationService) {}
  @Get() read(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.publications.forCustomer(user.id, id);
  }
}
