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
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: TicketStatus,
    @Query('priority') priority?: TicketPriority,
    @Query('category') category?: TicketCategory,
    @Query('assignedToUserId') assignedToUserId?: string,
    @Query('view') view?: 'queue' | 'mine',
  ) {
    return this.tickets.listQueue({
      status,
      priority,
      category,
      assignedToUserId:
        view === 'mine'
          ? user.id
          : user.role === UserRole.admin
            ? assignedToUserId
            : undefined,
    });
  }

  @Get('dashboard/summary')
  dashboard(@CurrentUser() user: AuthenticatedUser) {
    return this.tickets.supportDashboard(user.id);
  }

  @Get('canned-replies')
  cannedReplies() {
    return this.tickets.listCannedReplies();
  }

  @Get('performance')
  performance(@CurrentUser() user: AuthenticatedUser) {
    return this.tickets.supportPerformance(
      user.role === UserRole.support ? user.id : undefined,
    );
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.tickets.findOneForSupport(id);
  }

  @Patch(':id/assign')
  assign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AssignTicketDto,
  ) {
    return this.tickets.assign(id, dto.assignedToUserId, user);
  }

  @Post(':id/claim')
  claim(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.tickets.assign(id, user.id, user);
  }

  @Post(':id/reply')
  reply(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AddTicketMessageDto,
  ) {
    return this.tickets.reply(user, id, dto);
  }

  @Post(':id/escalate')
  escalate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: EscalateTicketDto,
  ) {
    return this.tickets.escalate(id, user, dto.reason);
  }

  @Post(':id/resolve')
  resolve(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.tickets.resolve(id, user);
  }

  @Post(':id/close')
  close(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.tickets.close(id, user);
  }
}
