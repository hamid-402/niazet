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
  AdminScope,
  EscrowStatus,
  PaymentStatus,
  UserRole,
  WithdrawalStatus,
} from '@prisma/client';
import { PaymentsService } from './payments.service';
import { EscrowService } from './escrow.service';
import { LedgerService } from './ledger.service';
import { InvoicesService } from './invoices.service';
import { WithdrawalsService } from './withdrawals.service';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminScopes } from '../common/decorators/admin-scopes.decorator';
import { AdminScopeGuard } from '../common/guards/admin-scope.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PaginationDto, buildPagination } from '../common/dto/pagination.dto';
import {
  ReleaseEscrowDto,
  RefundEscrowDto,
  DecideWithdrawalDto,
} from './dto/finance.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { RateLimit } from '../common/decorators/rate-limit.decorator';

@Controller('v1/admin/finance')
@UseGuards(RolesGuard, AdminScopeGuard)
@Roles(UserRole.admin)
@AdminScopes(AdminScope.finance_admin)
export class FinanceAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
    private readonly escrow: EscrowService,
    private readonly ledger: LedgerService,
    private readonly invoices: InvoicesService,
    private readonly withdrawals: WithdrawalsService,
    private readonly audit: AuditService,
  ) {}

  @Get('dashboard')
  async dashboard() {
    const [
      pendingRefunds,
      activeEscrow,
      pendingWithdrawals,
      failedPayments,
      monthRevenue,
    ] = await Promise.all([
      this.prisma.refund.count({ where: { status: 'pending' } }),
      this.prisma.escrowHold.aggregate({
        _sum: { amount: true },
        _count: true,
        where: {
          status: { in: [EscrowStatus.held, EscrowStatus.partially_released] },
        },
      }),
      this.prisma.withdrawal.count({
        where: { status: WithdrawalStatus.pending },
      }),
      this.prisma.payment.count({ where: { status: PaymentStatus.failed } }),
      this.prisma.payment.aggregate({
        _sum: { amount: true },
        where: {
          status: PaymentStatus.succeeded,
          createdAt: { gte: new Date(new Date().setDate(1)) },
        },
      }),
    ]);

    return {
      pendingRefunds,
      activeEscrowAmount: activeEscrow._sum.amount ?? 0,
      activeEscrowCount: activeEscrow._count,
      pendingWithdrawals,
      failedPayments,
      monthRevenue: monthRevenue._sum.amount ?? 0,
    };
  }

  @Get('payments')
  paymentsList(
    @Query() pagination: PaginationDto,
    @Query('status') status?: PaymentStatus,
  ) {
    const { skip, take } = buildPagination(pagination);
    return this.payments.listForAdmin({ status, skip, take });
  }

  @Get('escrow')
  escrowList(
    @Query() pagination: PaginationDto,
    @Query('status') status?: EscrowStatus,
  ) {
    const { skip, take } = buildPagination(pagination);
    return this.escrow.listForAdmin({ status, skip, take });
  }

  @Post('escrow/:orderId/release')
  @RateLimit({ name: 'finance-escrow-release', limit: 10, windowMs: 60 * 1000 })
  async releaseEscrow(
    @Param('orderId') orderId: string,
    @Body() dto: ReleaseEscrowDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const result = await this.escrow.release({
      orderId,
      amount: dto.amount,
      decidedByUserId: user.id,
      note: dto.note,
    });
    await this.audit.record({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'escrow.release',
      entityType: 'order',
      entityId: orderId,
      after: { amount: dto.amount, note: dto.note },
      sensitivity: 'critical',
    });
    return result;
  }

  @Post('escrow/:orderId/refund')
  @RateLimit({ name: 'finance-escrow-refund', limit: 10, windowMs: 60 * 1000 })
  async refundEscrow(
    @Param('orderId') orderId: string,
    @Body() dto: RefundEscrowDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const result = await this.escrow.refund({
      orderId,
      amount: dto.amount,
      reason: dto.reason,
      note: dto.note,
      decidedByUserId: user.id,
    });
    await this.audit.record({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'escrow.refund',
      entityType: 'order',
      entityId: orderId,
      after: { amount: dto.amount, reason: dto.reason, note: dto.note },
      sensitivity: 'critical',
    });
    return result;
  }

  @Get('ledger')
  async ledgerList(
    @Query() pagination: PaginationDto,
    @Query('referenceId') referenceId?: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    const { skip, take } = buildPagination(pagination);
    if (user) {
      await this.audit.record({
        actorUserId: user.id,
        actorRole: user.role,
        action: 'ledger.view',
        entityType: 'ledger_entries',
        entityId: referenceId ?? 'all',
        sensitivity: 'sensitive',
      });
    }
    return this.ledger.listEntries({ referenceId, skip, take });
  }

  @Get('invoices')
  invoicesList(@Query() pagination: PaginationDto) {
    const { skip, take } = buildPagination(pagination);
    return this.invoices.listForAdmin({ skip, take });
  }

  @Get('withdrawals')
  withdrawalsList(@Query('status') status?: WithdrawalStatus) {
    return this.withdrawals.listForAdmin(status);
  }

  @Patch('withdrawals/:id/approve')
  @RateLimit({
    name: 'finance-withdrawal-approve',
    limit: 10,
    windowMs: 60 * 1000,
  })
  async approveWithdrawal(
    @Param('id') id: string,
    @Body() dto: DecideWithdrawalDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const result = await this.withdrawals.decide(id, true, user.id, dto.note);
    await this.audit.record({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'withdrawal.approve',
      entityType: 'withdrawal',
      entityId: id,
      sensitivity: 'critical',
    });
    return result;
  }

  @Patch('withdrawals/:id/reject')
  @RateLimit({
    name: 'finance-withdrawal-reject',
    limit: 10,
    windowMs: 60 * 1000,
  })
  async rejectWithdrawal(
    @Param('id') id: string,
    @Body() dto: DecideWithdrawalDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const result = await this.withdrawals.decide(id, false, user.id, dto.note);
    await this.audit.record({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'withdrawal.reject',
      entityType: 'withdrawal',
      entityId: id,
      sensitivity: 'critical',
    });
    return result;
  }
}
