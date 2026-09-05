import {
  Body,
  Controller,
  Get,
  Headers,
  Patch,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminScope, UserRole } from '@prisma/client';
import { FeedbackService } from './feedback.service';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import {
  CreateFeedbackDto,
  ListFeedbackQueryDto,
  UpdateFeedbackStatusDto,
} from './dto/feedback.dto';
import { AdminScopes } from '../common/decorators/admin-scopes.decorator';
import { AdminScopeGuard } from '../common/guards/admin-scope.guard';

@Controller('v1/customer/orders/:orderId/feedback')
@UseGuards(RolesGuard)
@Roles(UserRole.customer)
export class FeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId') orderId: string,
    @Body() dto: CreateFeedbackDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.feedback.create(user.id, orderId, dto, idempotencyKey ?? '');
  }

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId') orderId: string,
  ) {
    return this.feedback.listForCustomerOrder(user.id, orderId);
  }
}

@Controller('v1/admin/feedback')
@UseGuards(RolesGuard, AdminScopeGuard)
@Roles(UserRole.admin)
@AdminScopes(AdminScope.super_admin, AdminScope.ops_admin)
export class FeedbackAdminController {
  constructor(private readonly feedback: FeedbackService) {}

  @Get()
  list(@Query() query: ListFeedbackQueryDto) {
    return this.feedback.listForAdmin(query);
  }

  @Patch(':id/status')
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateFeedbackStatusDto,
  ) {
    return this.feedback.updateStatus(user, id, dto);
  }
}
