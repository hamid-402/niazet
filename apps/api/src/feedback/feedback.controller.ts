import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { FeedbackService } from './feedback.service';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { CreateFeedbackDto } from './dto/feedback.dto';

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
  ) {
    return this.feedback.create(user.id, orderId, dto);
  }
}
