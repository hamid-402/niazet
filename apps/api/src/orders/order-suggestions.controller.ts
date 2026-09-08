import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminScopes } from '../common/decorators/admin-scopes.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RateLimit } from '../common/decorators/rate-limit.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AdminScopeGuard } from '../common/guards/admin-scope.guard';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { OrderSuggestionsService } from './order-suggestions.service';
@Controller('v1/admin/orders/:id/suggestions')
@UseGuards(RolesGuard, AdminScopeGuard)
@Roles('admin')
@AdminScopes('ops_admin')
export class OrderSuggestionsController {
  constructor(private readonly suggestions: OrderSuggestionsService) {}
  @Get()
  @RateLimit({ name: 'order-suggestions', limit: 10, windowMs: 60000 })
  get(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.suggestions.suggest(id, actor);
  }
}
