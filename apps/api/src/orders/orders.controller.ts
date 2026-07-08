import {
  Body,
  Controller,
  Get,
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
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { buildPagination } from '../common/dto/pagination.dto';
import {
  CancelOrderDto,
  CreateOrderDto,
  DisputeOrderDto,
  ListOrdersQueryDto,
  OrderMessageDto,
  RevisionRequestDto,
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
  pay(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.orders.initiatePayment(user.id, id);
  }

  @Post(':id/payments/:paymentId/verify')
  verifyPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('paymentId') paymentId: string,
  ) {
    return this.orders.verifyPayment(user.id, id, paymentId);
  }

  @Post(':id/confirm')
  confirm(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.orders.confirm(user.id, id);
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
    return this.orders.addMessage(
      id,
      user.id,
      dto.body,
      'customer_visible',
      dto.attachmentFileId,
    );
  }
}
