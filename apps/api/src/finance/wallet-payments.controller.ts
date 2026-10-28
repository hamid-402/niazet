import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RateLimit } from '../common/decorators/rate-limit.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import {
  MAX_WALLET_AMOUNT,
  WalletPaymentsService,
} from './wallet-payments.service';

export class WalletTopUpDto {
  @IsInt() @Min(1) @Max(MAX_WALLET_AMOUNT) amount!: number;
}
export class WalletOrderPaymentDto {
  @IsOptional() @IsUUID() milestoneId?: string;
}
@Controller('v1/customer')
@UseGuards(RolesGuard)
@Roles(UserRole.customer)
export class WalletPaymentsController {
  constructor(private readonly service: WalletPaymentsService) {}
  @Get('wallet/top-ups') list(@CurrentUser() user: AuthenticatedUser) {
    return this.service.list(user.id);
  }
  @Post('wallet/top-ups')
  @RateLimit({ name: 'wallet-topup', limit: 10, windowMs: 60000 })
  initiate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: WalletTopUpDto,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.service.initiate(user.id, dto.amount, key ?? '');
  }
  @Post('wallet/top-ups/:id/verify')
  @RateLimit({ name: 'wallet-topup-verify', limit: 20, windowMs: 60000 })
  verify(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.service.verify(user.id, id, key ?? '');
  }
  @Post('orders/:id/pay-from-wallet')
  @RateLimit({ name: 'wallet-order-pay', limit: 10, windowMs: 60000 })
  payOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: WalletOrderPaymentDto,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.service.payOrder(user.id, id, key ?? '', dto.milestoneId);
  }
}
