import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  TicketCategory,
  TicketPriority,
  TicketStatus,
  UserRole,
} from '@prisma/client';
import { TicketsService } from './tickets.service';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import {
  AddTicketMessageDto,
  AssignTicketDto,
  EscalateTicketDto,
} from './dto/ticket.dto';

@Controller('v1/support/tickets')
@UseGuards(RolesGuard)
@Roles(UserRole.support, UserRole.admin)
export class TicketsSupportController {
  constructor(private readonly tickets: TicketsService) {}

  @Get()
  list(
    @Query('status') status?: TicketStatus,
    @Query('priority') priority?: TicketPriority,
    @Query('category') category?: TicketCategory,
    @Query('assignedToUserId') assignedToUserId?: string,
  ) {
    return this.tickets.listQueue({
      status,
      priority,
      category,
      assignedToUserId,
    });
  }

  @Get('performance')
  performance() {
    return this.tickets.supportPerformance();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.tickets.findOneForSupport(id);
  }

  @Patch(':id/assign')
  assign(@Param('id') id: string, @Body() dto: AssignTicketDto) {
    return this.tickets.assign(id, dto.assignedToUserId);
  }

  @Post(':id/reply')
  reply(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AddTicketMessageDto,
  ) {
    return this.tickets.reply(user.id, id, dto);
  }

  @Post(':id/escalate')
  escalate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: EscalateTicketDto,
  ) {
    return this.tickets.escalate(id, user.id, dto.reason);
  }

  @Post(':id/resolve')
  resolve(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.tickets.resolve(id, user.id);
  }

  @Post(':id/close')
  close(@Param('id') id: string) {
    return this.tickets.close(id);
  }
}
