import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import {
  AdminScope,
  EscrowStatus,
  PaymentStatus,
  RefundStatus,
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
  VerifyShabaDto,
  CorrectLedgerEntryDto,
} from './dto/finance.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { AuditService } from '../audit/audit.service';
import { RateLimit } from '../common/decorators/rate-limit.decorator';
import { FinanceReportingService } from './finance-reporting.service';
import { FinanceReconciliationService } from './finance-reconciliation.service';

@Controller('v1/admin/finance')
@UseGuards(RolesGuard, AdminScopeGuard)
@Roles(UserRole.admin)
@AdminScopes(AdminScope.finance_admin)
export class FinanceAdminController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly escrow: EscrowService,
    private readonly ledger: LedgerService,
    private readonly invoices: InvoicesService,
    private readonly withdrawals: WithdrawalsService,
    private readonly audit: AuditService,
    private readonly reporting: FinanceReportingService,
    private readonly reconciliation: FinanceReconciliationService,
  ) {}

  @Get('dashboard')
  dashboard() {
    return this.reporting.dashboard();
  }

  @Post('reconciliation/run')
  runReconciliation() {
    return this.reconciliation.runNightly(true);
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
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.escrow.release({
      orderId,
      amount: dto.amount,
      decidedByUserId: user.id,
      note: dto.note,
      idempotencyKey: idempotencyKey ?? '',
    });
  }

  @Post('escrow/:orderId/refund')
  @RateLimit({ name: 'finance-escrow-refund', limit: 10, windowMs: 60 * 1000 })
  async refundEscrow(
    @Param('orderId') orderId: string,
    @Body() dto: RefundEscrowDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.escrow.refund({
      orderId,
      amount: dto.amount,
      reason: dto.reason,
      note: dto.note,
      decidedByUserId: user.id,
      idempotencyKey: idempotencyKey ?? '',
    });
  }

  @Get('refunds')
  refundsList(
    @Query() pagination: PaginationDto,
    @Query('status') status?: RefundStatus,
  ) {
    const { skip, take } = buildPagination(pagination);
    return this.escrow.listRefundsForAdmin({ status, skip, take });
  }

  @Get('ledger/export')
  async ledgerExport(
    @Query('referenceId') referenceId: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.audit.record({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'ledger.export',
      entityType: 'ledger_entries',
      entityId: referenceId ?? 'all',
      sensitivity: 'sensitive',
    });
    const content = await this.ledger.exportCsv({ referenceId });
    return new StreamableFile(Buffer.from(content, 'utf8'), {
      type: 'text/csv; charset=utf-8',
      disposition: 'attachment; filename="niazat-ledger.csv"',
    });
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

  @Post('ledger/:id/correction')
  correctLedgerEntry(
    @Param('id') id: string,
    @Body() dto: CorrectLedgerEntryDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.ledger.postCorrection({
      originalEntryId: id,
      reason: dto.reason,
      createdByUserId: user.id,
      idempotencyKey: idempotencyKey ?? '',
    });
  }

  @Get('invoices')
  invoicesList(@Query() pagination: PaginationDto) {
    const { skip, take } = buildPagination(pagination);
    return this.invoices.listForAdmin({ skip, take });
  }

  @Get('invoices/:id/pdf')
  async invoicePdf(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const pdf = await this.invoices.pdfForAdmin(id);
    await this.audit.record({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'invoice.download',
      entityType: 'invoice',
      entityId: id,
      sensitivity: 'sensitive',
    });
    return new StreamableFile(pdf.content, {
      type: 'application/pdf',
      disposition: `attachment; filename="${pdf.filename}"`,
    });
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
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.withdrawals.decide(
      id,
      true,
      user.id,
      dto.note,
      idempotencyKey ?? '',
    );
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
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.withdrawals.decide(
      id,
      false,
      user.id,
      dto.note,
      idempotencyKey ?? '',
    );
  }

  @Post('withdrawals/verify-shaba')
  verifyShaba(
    @Body() dto: VerifyShabaDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.withdrawals.verifyShaba(
      dto.executorProfileId,
      dto.shabaNumber,
      user.id,
    );
  }
}
