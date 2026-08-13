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
import { UserRole } from '@prisma/client';
import { OrdersService } from './orders.service';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RateLimit } from '../common/decorators/rate-limit.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { buildPagination } from '../common/dto/pagination.dto';
import {
  CancelOrderDto,
  CreateOrderDto,
  DisputeOrderDto,
  ListOrdersQueryDto,
  OrderMessageDto,
  RevisionRequestDto,
  PaymentIntentDto,
} from './dto/order.dto';

@Controller('v1/customer/orders')
@UseGuards(RolesGuard)
@Roles(UserRole.customer)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListOrdersQueryDto,
  ) {
    const { skip, take } = buildPagination(query);
    return this.orders.listForCustomer(user.id, {
      status: query.status,
      skip,
      take,
    });
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateOrderDto) {
    return this.orders.createDraft(user.id, dto);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.orders.findOneForCustomer(user.id, id);
  }

  @Post(':id/submit')
  submit(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.orders.submit(user.id, id);
  }

  @Post(':id/accept-quote')
  acceptQuote(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.orders.acceptQuote(user.id, id);
  }

  @Post(':id/pay')
  @RateLimit({ name: 'payment-initiate', limit: 10, windowMs: 60 * 1000 })
  pay(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Body() dto: PaymentIntentDto = {},
  ) {
    return this.orders.initiatePayment(
      user.id,
      id,
      idempotencyKey ?? '',
      dto.milestoneId,
    );
  }

  @Post(':id/milestones/:milestoneId/approve')
  approveMilestone(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('milestoneId') milestoneId: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.orders.approveMilestone(
      user.id,
      id,
      milestoneId,
      idempotencyKey ?? '',
    );
  }

  @Post(':id/payments/:paymentId/verify')
  @RateLimit({ name: 'payment-verify', limit: 15, windowMs: 60 * 1000 })
  verifyPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('paymentId') paymentId: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.orders.verifyPayment(
      user.id,
      id,
      paymentId,
      idempotencyKey ?? '',
    );
  }

  @Post(':id/confirm')
  confirm(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.orders.confirm(user.id, id, idempotencyKey ?? '');
  }

  @Post(':id/revision')
  requestRevision(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RevisionRequestDto,
  ) {
    return this.orders.requestRevision(user.id, id, dto);
  }

  @Post(':id/dispute')
  dispute(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: DisputeOrderDto,
  ) {
    return this.orders.raiseDispute(user.id, user.role, id, dto);
  }

  @Post(':id/cancel')
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CancelOrderDto,
  ) {
    return this.orders.cancelByCustomer(user.id, id, dto.reason);
  }

  @Post(':id/messages')
  addMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: OrderMessageDto,
  ) {
    return this.orders.addCustomerMessage(
      id,
      user.id,
      dto.body,
      dto.attachmentFileId,
    );
  }
}
