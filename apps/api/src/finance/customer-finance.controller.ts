import { Controller, Get, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { WalletService } from './wallet.service';
import { InvoicesService } from './invoices.service';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';

@Controller('v1/customer')
@UseGuards(RolesGuard)
export class CustomerFinanceController {
  constructor(
    private readonly wallet: WalletService,
    private readonly invoices: InvoicesService,
  ) {}

  // کیف پول برای مشتری و مجری هر دو معنا دارد (مشتری: اعتبار/رفاند، مجری: تسویه).
  @Get('wallet')
  @Roles(UserRole.customer, UserRole.executor)
  getWallet(@CurrentUser() user: AuthenticatedUser) {
    return this.wallet.getSummary(user.id);
  }

  @Get('invoices')
  @Roles(UserRole.customer)
  myInvoices(@CurrentUser() user: AuthenticatedUser) {
    return this.invoices.listForCustomer(user.id);
  }
}
