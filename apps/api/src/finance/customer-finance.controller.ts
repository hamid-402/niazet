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
@Roles(UserRole.customer)
export class CustomerFinanceController {
  constructor(
    private readonly wallet: WalletService,
    private readonly invoices: InvoicesService,
  ) {}

  @Get('wallet')
  getWallet(@CurrentUser() user: AuthenticatedUser) {
    return this.wallet.getSummary(user.id);
  }

  @Get('invoices')
  myInvoices(@CurrentUser() user: AuthenticatedUser) {
    return this.invoices.listForCustomer(user.id);
  }
}
