import { Module } from '@nestjs/common';
import { LedgerService } from './ledger.service';
import { WalletService } from './wallet.service';
import { PaymentsService } from './payments.service';
import { EscrowService } from './escrow.service';
import { InvoicesService } from './invoices.service';
import { WithdrawalsService } from './withdrawals.service';
import { MockPaymentGateway } from './payment-gateway';
import { CustomerFinanceController } from './customer-finance.controller';
import { FinanceAdminController } from './finance.admin.controller';

@Module({
  controllers: [CustomerFinanceController, FinanceAdminController],
  providers: [
    LedgerService,
    WalletService,
    PaymentsService,
    EscrowService,
    InvoicesService,
    WithdrawalsService,
    MockPaymentGateway,
  ],
  exports: [
    LedgerService,
    WalletService,
    PaymentsService,
    EscrowService,
    InvoicesService,
    WithdrawalsService,
  ],
})
export class FinanceModule {}
