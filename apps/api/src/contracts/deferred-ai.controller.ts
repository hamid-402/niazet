import {
  Body,
  Controller,
  Post,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { IsUUID } from 'class-validator';
import { AdminScope, UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminScopes } from '../common/decorators/admin-scopes.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AdminScopeGuard } from '../common/guards/admin-scope.guard';
import { RateLimit } from '../common/decorators/rate-limit.decorator';

class AiOrderRequestDto {
  @IsUUID() orderId!: string;
}
class AiTicketRequestDto {
  @IsUUID() ticketId!: string;
}
// D1 explicitly labels these as future-ready. This is an authenticated,
// fail-closed API contract, NEVER a fabricated AI result or a live adapter.
@Controller('v1/ai')
@UseGuards(RolesGuard, AdminScopeGuard)
@Roles(UserRole.admin)
@AdminScopes(AdminScope.ops_admin)
@RateLimit({ name: 'deferred-ai-command', limit: 10, windowMs: 60000 })
export class DeferredAiController {
  private unavailable(): never {
    throw new ServiceUnavailableException({
      error: 'AI_PROVIDER_DEFERRED',
      message:
        'موتور هوش مصنوعی طبق تصمیم مالک فعلاً متصل نیست؛ هیچ پیشنهاد یا تغییر خودکاری انجام نشد.',
      humanApprovalRequired: true,
      providerCalled: false,
    });
  }
  @Post('suggest-price') price(@Body() _dto: AiOrderRequestDto) {
    void _dto;
    return this.unavailable();
  }
  @Post('triage') triage(@Body() _dto: AiOrderRequestDto) {
    void _dto;
    return this.unavailable();
  }
  @Post('support-reply') reply(@Body() _dto: AiTicketRequestDto) {
    void _dto;
    return this.unavailable();
  }
}
