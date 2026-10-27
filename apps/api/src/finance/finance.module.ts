import { Module } from '@nestjs/common';
import { LedgerService } from './ledger.service';
import { WalletService } from './wallet.service';
import { PaymentsService } from './payments.service';
import { EscrowService } from './escrow.service';
import { InvoicesService } from './invoices.service';
import { WithdrawalsService } from './withdrawals.service';
import { MockPaymentGateway } from './payment-gateway';
import { PaymentGatewayService } from './zarinpal.gateway';
import { CustomerFinanceController } from './customer-finance.controller';
import { FinanceAdminController } from './finance.admin.controller';
import { IdempotencyService } from './idempotency.service';
import { FinanceReportingService } from './finance-reporting.service';
import { FinanceReconciliationService } from './finance-reconciliation.service';
import { CustomerFinanceOverviewService } from './customer-finance-overview.service';
import { WalletPaymentsService } from './wallet-payments.service';
import { WalletPaymentsController } from './wallet-payments.controller';
import { OrderWorkflowModule } from '../orders/domain/order-workflow.module';
import { CommercialModule } from '../pricing/commercial.module';
import { CommercialReviewController } from './commercial-review.controller';
import { CommercialReviewService } from './commercial-review.service';

@Module({
  imports: [OrderWorkflowModule, CommercialModule],
  controllers: [
    CustomerFinanceController,
    FinanceAdminController,
    WalletPaymentsController,
    CommercialReviewController,
  ],
  providers: [
    LedgerService,
    WalletService,
    PaymentsService,
    EscrowService,
    InvoicesService,
    WithdrawalsService,
    MockPaymentGateway,
    PaymentGatewayService,
    IdempotencyService,
    FinanceReportingService,
    FinanceReconciliationService,
    CustomerFinanceOverviewService,
    WalletPaymentsService,
    CommercialReviewService,
  ],
  exports: [
    LedgerService,
    WalletService,
    PaymentsService,
    EscrowService,
    InvoicesService,
    WithdrawalsService,
    IdempotencyService,
    FinanceReportingService,
    MockPaymentGateway,
    PaymentGatewayService,
  ],
})
export class FinanceModule {}
