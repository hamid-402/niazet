import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { TicketStatus, UserRole } from '@prisma/client';
import { TicketsService } from './tickets.service';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { AddTicketMessageDto, CreateTicketDto } from './dto/ticket.dto';

@Controller('v1/customer/tickets')
@UseGuards(RolesGuard)
@Roles(UserRole.customer)
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query('status') status?: TicketStatus) {
    return this.tickets.listForCustomer(user.id, status);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTicketDto) {
    return this.tickets.create(user.id, dto);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.tickets.findOneForCustomer(user.id, id);
  }

  @Post(':id/messages')
  addMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AddTicketMessageDto,
  ) {
    return this.tickets.addCustomerMessage(user.id, id, dto);
  }
}
