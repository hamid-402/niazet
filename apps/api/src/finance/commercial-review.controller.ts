import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AdminScope, UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminScopes } from '../common/decorators/admin-scopes.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AdminScopeGuard } from '../common/guards/admin-scope.guard';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { CommercialReasonDto } from '../pricing/commercial.dto';
import { CommercialReviewService } from './commercial-review.service';
import { RateLimit } from '../common/decorators/rate-limit.decorator';

@Controller('v1/admin/commercial/financial-review')
@UseGuards(RolesGuard, AdminScopeGuard)
@Roles(UserRole.admin)
@AdminScopes(AdminScope.finance_admin)
@RateLimit({ name: 'commercial-finance-review', limit: 30, windowMs: 60000 })
export class CommercialReviewController {
  constructor(private readonly reviews: CommercialReviewService) {}
  @Get() list() {
    return this.reviews.list();
  }
  @Post(':paymentId/refund-to-wallet') refund(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('paymentId') paymentId: string,
    @Body() dto: CommercialReasonDto,
    @Headers('idempotency-key') key: string,
  ) {
    return this.reviews.refundToWallet(actor.id, paymentId, dto.reason, key);
  }
}
