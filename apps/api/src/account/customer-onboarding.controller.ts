import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RateLimit } from '../common/decorators/rate-limit.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { CustomerOnboardingService } from './customer-onboarding.service';
import { SaveCustomerOnboardingDto } from './dto/onboarding.dto';

@Controller('v1/customer/account/onboarding')
@UseGuards(RolesGuard)
@Roles(UserRole.customer)
export class CustomerOnboardingController {
  constructor(private readonly onboarding: CustomerOnboardingService) {}
  @Get()
  read(@CurrentUser() user: AuthenticatedUser) {
    return this.onboarding.read(user.id);
  }
  @Put()
  @RateLimit({
    name: 'customer-onboarding-save',
    limit: 30,
    windowMs: 60 * 1000,
  })
  save(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SaveCustomerOnboardingDto,
  ) {
    return this.onboarding.save(user.id, dto);
  }
}
