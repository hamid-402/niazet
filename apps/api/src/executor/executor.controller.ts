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
import { UserRole } from '@prisma/client';
import { ExecutorService } from './executor.service';
import { OrdersService } from '../orders/orders.service';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { buildPagination, PaginationDto } from '../common/dto/pagination.dto';
import {
  DeliverMilestoneDto,
  DeliverOrderDto,
  ProgressReportDto,
} from '../orders/dto/order.dto';
import { UpdateExecutionChecklistDto } from './dto/executor.dto';

@Controller('v1/executor')
@UseGuards(RolesGuard)
@Roles(UserRole.executor)
export class ExecutorController {
  constructor(
    private readonly executor: ExecutorService,
    private readonly orders: OrdersService,
  ) {}

  @Get('dashboard')
  dashboard(@CurrentUser() user: AuthenticatedUser) {
    return this.executor.getDashboard(user.id);
  }

  @Get('performance')
  performance(@CurrentUser() user: AuthenticatedUser) {
    return this.executor.getOwnPerformance(user.id);
  }

  @Get('profile')
  profile(@CurrentUser() user: AuthenticatedUser) {
    return this.executor.getOwnProfile(user.id);
  }

  @Get('orders')
  listOrders(
    @CurrentUser() user: AuthenticatedUser,
    @Query() pagination: PaginationDto,
  ) {
    const { skip, take } = buildPagination(pagination);
    return this.orders.listForExecutor(user.id, { skip, take });
  }

  @Get('orders/:id')
  getOrder(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.orders.findOneForExecutor(user.id, id);
  }

  @Post('orders/:id/start')
  start(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.orders.executorStart(user.id, id);
  }

  @Post('orders/:id/accept')
  accept(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.executor.acceptOrder(user.id, id);
  }

  @Patch('orders/:id/checklist/:itemId')
  updateChecklist(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateExecutionChecklistDto,
  ) {
    return this.executor.updateChecklistItem(
      user.id,
      id,
      itemId,
      dto.completed,
    );
  }

  @Post('orders/:id/progress-report')
  progressReport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ProgressReportDto,
  ) {
    return this.orders.progressReport(user.id, id, dto);
  }

  @Post('orders/:id/deliver')
  deliver(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: DeliverOrderDto,
  ) {
    return this.orders.deliver(user.id, id, dto);
  }

  @Post('orders/:id/milestones/:milestoneId/deliver')
  deliverMilestone(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('milestoneId') milestoneId: string,
    @Body() dto: DeliverMilestoneDto,
  ) {
    return this.orders.deliverMilestone(user.id, id, milestoneId, dto);
  }
}
