import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AdminScope, UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminScopes } from '../common/decorators/admin-scopes.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AdminScopeGuard } from '../common/guards/admin-scope.guard';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { CommercialService } from './commercial.service';
import { FixedRegistrationService } from './fixed-registration.service';
import { RateLimit } from '../common/decorators/rate-limit.decorator';
import {
  CapacityBucketDto,
  CommercialAcceptDto,
  CommercialAdminOfferDto,
  CommercialOfferDto,
  CommercialPolicyDto,
  CommercialReasonDto,
  FixedRegistrationOfferDto,
} from './commercial.dto';

@Controller('v1/customer/orders/:id/commercial')
@UseGuards(RolesGuard)
@Roles(UserRole.customer)
@RateLimit({ name: 'commercial-customer', limit: 60, windowMs: 60000 })
export class CustomerCommercialController {
  constructor(
    private readonly commercial: CommercialService,
    private readonly registration: FixedRegistrationService,
  ) {}
  @Post('registration-offer') registrationOffer(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: FixedRegistrationOfferDto,
    @Headers('idempotency-key') key: string,
  ) {
    return this.registration.offer(u.id, id, dto, key);
  }
  @Get() current(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    return this.commercial.current(u.id, id);
  }
  @Post('offers') offer(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CommercialOfferDto,
    @Headers('idempotency-key') key: string,
  ) {
    return this.commercial.offer({ id: u.id, role: 'customer' }, id, dto, key);
  }
  @Post('offers/:revisionId/accept') accept(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Param('revisionId') revisionId: string,
    @Body() dto: CommercialAcceptDto,
    @Headers('idempotency-key') key: string,
  ) {
    return this.commercial.accept(u.id, id, revisionId, dto.fingerprint, key);
  }
  @Post('release') release(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CommercialReasonDto,
    @Headers('idempotency-key') key: string,
  ) {
    return this.commercial.release(
      { id: u.id, role: 'customer' },
      id,
      dto.reason,
      key,
    );
  }
  @Post('payments/:paymentId/refund-request') refund(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Param('paymentId') paymentId: string,
    @Body() dto: CommercialReasonDto,
    @Headers('idempotency-key') key: string,
  ) {
    return this.commercial.requestRefund(u.id, id, paymentId, dto.reason, key);
  }
}

@Controller('v1/admin/commercial')
@UseGuards(RolesGuard, AdminScopeGuard)
@Roles(UserRole.admin)
@AdminScopes(AdminScope.ops_admin)
@RateLimit({ name: 'commercial-ops', limit: 60, windowMs: 60000 })
export class CommercialAdminController {
  constructor(private readonly commercial: CommercialService) {}
  @Get('services/:id/policy') getPolicy(@Param('id') id: string) {
    return this.commercial.policy(id);
  }
  @Put('services/:id/policy') policy(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CommercialPolicyDto,
    @Headers('idempotency-key') key: string,
  ) {
    return this.commercial.setPolicy({ id: u.id, role: 'admin' }, id, dto, key);
  }
  @Put('capacity') capacity(
    @CurrentUser() u: AuthenticatedUser,
    @Body() dto: CapacityBucketDto,
    @Headers('idempotency-key') key: string,
  ) {
    return this.commercial.setBucket({ id: u.id, role: 'admin' }, dto, key);
  }
  @Post('orders/:id/offers') offer(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CommercialAdminOfferDto,
    @Headers('idempotency-key') key: string,
  ) {
    return this.commercial.offer({ id: u.id, role: 'admin' }, id, dto, key);
  }
  @Post('orders/:id/release-capacity') release(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CommercialReasonDto,
    @Headers('idempotency-key') key: string,
  ) {
    return this.commercial.release(
      { id: u.id, role: 'admin' },
      id,
      dto.reason,
      key,
    );
  }
}
