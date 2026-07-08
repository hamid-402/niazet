import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminScope, MessageVisibility, UserRole } from '@prisma/client';
import { OrdersService } from './orders.service';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminScopes } from '../common/decorators/admin-scopes.decorator';
import { AdminScopeGuard } from '../common/guards/admin-scope.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { buildPagination } from '../common/dto/pagination.dto';
import { PrismaService } from '../prisma/prisma.service';
import {
  AssignOrderDto,
  CancelOrderDto,
  ListOrdersQueryDto,
  OrderMessageDto,
  QuoteOrderDto,
  ResolveDisputeDto,
  TriageDecisionDto,
} from './dto/order.dto';

@Controller('v1/admin/orders')
@UseGuards(RolesGuard, AdminScopeGuard)
@Roles(UserRole.admin)
export class OrdersAdminController {
  constructor(
    private readonly orders: OrdersService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @AdminScopes(AdminScope.ops_admin, AdminScope.finance_admin)
  list(@Query() query: ListOrdersQueryDto) {
    const { skip, take } = buildPagination(query);
    return this.orders.listForAdmin({
      status: query.status,
      serviceId: query.serviceId,
      search: query.search,
      skip,
      take,
    });
  }

  @Get('dashboard')
  @AdminScopes(AdminScope.ops_admin)
  async dashboard() {
    const [byStatus, riskySla, activeComplaints] = await Promise.all([
      this.prisma.order.groupBy({ by: ['status'], _count: true }),
      this.prisma.order.count({
        where: {
          status: { in: ['in_progress', 'assigned'] },
        },
      }),
      this.prisma.feedback.count({ where: { feedbackType: 'complaint' } }),
    ]);

    return {
      byStatus: Object.fromEntries(
        byStatus.map((row) => [row.status, row._count]),
      ),
      activeExecutionCount: riskySla,
      activeComplaints,
    };
  }

  @Get(':id')
  @AdminScopes(AdminScope.ops_admin, AdminScope.finance_admin)
  get(@Param('id') id: string) {
    return this.orders.findOneForAdmin(id);
  }

  @Post(':id/triage')
  @AdminScopes(AdminScope.ops_admin)
  triage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: TriageDecisionDto,
  ) {
    return this.orders.triage(user.id, id, dto);
  }

  @Post(':id/quote')
  @AdminScopes(AdminScope.ops_admin)
  quote(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: QuoteOrderDto,
  ) {
    return this.orders.quote(user.id, id, dto);
  }

  @Post(':id/assign')
  @AdminScopes(AdminScope.ops_admin)
  assign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AssignOrderDto,
  ) {
    return this.orders.assign(user.id, id, dto);
  }

  @Post(':id/reassign')
  @AdminScopes(AdminScope.ops_admin)
  reassign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AssignOrderDto,
  ) {
    return this.orders.reassign(user.id, id, dto);
  }

  @Post(':id/resolve-dispute')
  @AdminScopes(AdminScope.ops_admin, AdminScope.finance_admin)
  resolveDispute(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ResolveDisputeDto,
  ) {
    return this.orders.resolveDispute(user.id, id, dto);
  }

  @Post(':id/cancel')
  @AdminScopes(AdminScope.ops_admin)
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CancelOrderDto,
  ) {
    return this.orders.cancelByAdmin(user.id, id, dto.reason);
  }

  @Post(':id/messages')
  @AdminScopes(AdminScope.ops_admin)
  addMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: OrderMessageDto,
  ) {
    return this.orders.addMessage(
      id,
      user.id,
      dto.body,
      dto.visibility ?? MessageVisibility.internal_only,
      dto.attachmentFileId,
    );
  }
}
