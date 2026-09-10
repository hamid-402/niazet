import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminScopes } from '../common/decorators/admin-scopes.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RateLimit } from '../common/decorators/rate-limit.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AdminScopeGuard } from '../common/guards/admin-scope.guard';
import { PaginationDto, buildPagination } from '../common/dto/pagination.dto';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { OrganizationsService } from './organizations.service';
import {
  ActivateOrganizationPlanDto,
  AttachOrganizationOrderDto,
  CancelOrganizationPlanDto,
  CreateOrganizationPlanDto,
  EditOrganizationMemberDto,
  InviteOrganizationDto,
  OrganizationNameDto,
  RequestOrganizationPlanDto,
  RespondInvitationDto,
  SetOrganizationPlanActiveDto,
  TransferOrganizationDto,
} from './organization.dto';

@Controller('v1/customer/organizations')
@UseGuards(RolesGuard)
@Roles('customer')
export class OrganizationsController {
  constructor(private readonly org: OrganizationsService) {}
  @Get() list(@CurrentUser() actor: AuthenticatedUser) {
    return this.org.list(actor.id);
  }
  @Get('plans') plans() {
    return this.org.plans();
  }
  @Post()
  @RateLimit({ name: 'org-create', limit: 5, windowMs: 60000 })
  create(
    @Body() dto: OrganizationNameDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.org.create(dto.name, actor);
  }
  @Post('invitations/:invitationId/respond')
  @RateLimit({ name: 'org-invite-response', limit: 20, windowMs: 60000 })
  respond(
    @Param('invitationId') invitationId: string,
    @Body() dto: RespondInvitationDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.org.respond(invitationId, dto.accept, actor);
  }
  @Get(':id') detail(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.org.detail(id, actor);
  }
  @Post(':id/invitations')
  @RateLimit({ name: 'org-invite', limit: 20, windowMs: 60000 })
  invite(
    @Param('id') id: string,
    @Body() dto: InviteOrganizationDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.org.invite(id, dto, actor);
  }
  @Post(':id/teams')
  @RateLimit({ name: 'org-team', limit: 20, windowMs: 60000 })
  team(
    @Param('id') id: string,
    @Body() dto: OrganizationNameDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.org.createTeam(id, dto.name, actor);
  }
  @Patch(':id/members/:memberId')
  @RateLimit({ name: 'org-member', limit: 20, windowMs: 60000 })
  edit(
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @Body() dto: EditOrganizationMemberDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.org.editMember(id, memberId, dto, actor);
  }
  @Post(':id/transfer-owner')
  @RateLimit({ name: 'org-transfer', limit: 5, windowMs: 60000 })
  transfer(
    @Param('id') id: string,
    @Body() dto: TransferOrganizationDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.org.transfer(id, dto.memberId, dto.note, actor);
  }
  @Post(':id/plan-request')
  @RateLimit({ name: 'org-plan-request', limit: 5, windowMs: 60000 })
  request(
    @Param('id') id: string,
    @Body() dto: RequestOrganizationPlanDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.org.requestPlan(id, dto.planId, actor);
  }
  @Get(':id/orders') orders(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: PaginationDto,
  ) {
    const { skip, take } = buildPagination(query);
    return this.org.orders(id, actor, skip, take);
  }
  @Post(':id/orders')
  @RateLimit({ name: 'org-order-attach', limit: 20, windowMs: 60000 })
  attach(
    @Param('id') id: string,
    @Body() dto: AttachOrganizationOrderDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.org.attach(id, dto, actor);
  }
}

@Controller('v1/admin/organizations')
@UseGuards(RolesGuard, AdminScopeGuard)
@Roles('admin')
@AdminScopes('finance_admin')
export class OrganizationAdminController {
  constructor(private readonly org: OrganizationsService) {}
  @Get() list(@Query() query: PaginationDto) {
    const { skip, take } = buildPagination(query);
    return this.org.adminList(skip, take);
  }
  @Get('plans') plans() {
    return this.org.plans(true);
  }
  @Post('plans')
  @RateLimit({ name: 'org-plan-create', limit: 10, windowMs: 60000 })
  create(
    @Body() dto: CreateOrganizationPlanDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.org.createPlan(dto, actor);
  }
  @Patch('plans/:id')
  @RateLimit({ name: 'org-plan-change', limit: 10, windowMs: 60000 })
  setActive(
    @Param('id') id: string,
    @Body() dto: SetOrganizationPlanActiveDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.org.setPlanActive(id, dto.active, actor);
  }
  @Post(':id/subscription')
  @RateLimit({ name: 'org-subscription', limit: 10, windowMs: 60000 })
  activate(
    @Param('id') id: string,
    @Body() dto: ActivateOrganizationPlanDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.org.activate(id, dto, actor);
  }
  @Post(':id/subscription/cancel')
  @RateLimit({ name: 'org-subscription-cancel', limit: 10, windowMs: 60000 })
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelOrganizationPlanDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.org.cancel(id, dto, actor);
  }
}
