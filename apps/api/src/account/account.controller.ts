import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { AccountService } from './account.service';
import {
  RequestAccountDeletionDto,
  UpdateCustomerProfileDto,
} from './dto/account.dto';

@Controller('v1/customer/account')
@UseGuards(RolesGuard)
@Roles(UserRole.customer)
export class AccountController {
  constructor(private readonly account: AccountService) {}

  @Get('profile')
  profile(@CurrentUser() user: AuthenticatedUser) {
    return this.account.getProfile(user.id);
  }

  @Put('profile')
  updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateCustomerProfileDto,
    @Req() req: Request,
  ) {
    return this.account.updateProfile(user, dto, req.ip);
  }

  @Post('privacy/export')
  exportData(@CurrentUser() user: AuthenticatedUser, @Req() req: Request) {
    return this.account.exportData(user, req.ip);
  }

  @Get('privacy/requests')
  privacyRequests(@CurrentUser() user: AuthenticatedUser) {
    return this.account.listPrivacyRequests(user.id);
  }

  @Post('privacy/deletion-request')
  requestDeletion(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RequestAccountDeletionDto,
    @Req() req: Request,
  ) {
    return this.account.requestDeletion(user, dto, req.ip);
  }
}
