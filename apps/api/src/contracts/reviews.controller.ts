import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AdminScope, UserRole } from '@prisma/client';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminScopes } from '../common/decorators/admin-scopes.decorator';
import { RateLimit } from '../common/decorators/rate-limit.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AdminScopeGuard } from '../common/guards/admin-scope.guard';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { ReviewsService } from './reviews.service';
import { ModerateReviewDto, SubmitReviewDto } from './review.dto';

@Controller('v1/customer/orders/:orderId/review')
@UseGuards(RolesGuard)
@Roles(UserRole.customer)
export class CustomerReviewController {
  constructor(private readonly reviews: ReviewsService) {}
  @Post()
  @RateLimit({ name: 'service-review-write', limit: 10, windowMs: 60000 })
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId') orderId: string,
    @Body() dto: SubmitReviewDto,
  ) {
    return this.reviews.submit(user.id, orderId, dto);
  }
  @Get()
  own(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId') orderId: string,
  ) {
    return this.reviews.own(user.id, orderId);
  }
}
@Controller('v1/services/:slug/reviews')
export class PublicReviewController {
  constructor(private readonly reviews: ReviewsService) {}
  @Get()
  @Public()
  @Header('Cache-Control', 'no-store')
  @RateLimit({ name: 'service-review-public', limit: 60, windowMs: 60000 })
  list(@Param('slug') slug: string) {
    return this.reviews.publicList(slug);
  }
}
@Controller('v1/admin/reviews')
@UseGuards(RolesGuard, AdminScopeGuard)
@Roles(UserRole.admin)
@AdminScopes(AdminScope.ops_admin)
export class ReviewAdminController {
  constructor(private readonly reviews: ReviewsService) {}
  @Get() list() {
    return this.reviews.listForModeration();
  }
  @Patch(':id/moderation')
  moderate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ModerateReviewDto,
  ) {
    return this.reviews.moderate(user, id, dto);
  }
}
