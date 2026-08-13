import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { WalletService } from './wallet.service';
import { InvoicesService } from './invoices.service';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { WithdrawalsService } from './withdrawals.service';
import { RequestWithdrawalDto } from './dto/finance.dto';
import { CustomerFinanceOverviewService } from './customer-finance-overview.service';

@Controller('v1/customer')
@UseGuards(RolesGuard)
export class CustomerFinanceController {
  constructor(
    private readonly wallet: WalletService,
    private readonly invoices: InvoicesService,
    private readonly withdrawals: WithdrawalsService,
    private readonly overview: CustomerFinanceOverviewService,
  ) {}

  @Get('finance/overview')
  @Roles(UserRole.customer)
  financeOverview(@CurrentUser() user: AuthenticatedUser) {
    return this.overview.get(user.id);
  }

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

  @Get('invoices/:id/pdf')
  @Roles(UserRole.customer)
  async invoicePdf(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const pdf = await this.invoices.pdfForCustomer(user.id, id);
    return new StreamableFile(pdf.content, {
      type: 'application/pdf',
      disposition: `attachment; filename="${pdf.filename}"`,
    });
  }

  @Post('withdrawals')
  @Roles(UserRole.executor)
  requestWithdrawal(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RequestWithdrawalDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.withdrawals.requestForUser(
      user.id,
      dto.amount,
      dto.shabaNumber,
      idempotencyKey ?? '',
    );
  }
}
