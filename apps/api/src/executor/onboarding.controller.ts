import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  Matches,
} from 'class-validator';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminScopes } from '../common/decorators/admin-scopes.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RateLimit } from '../common/decorators/rate-limit.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AdminScopeGuard } from '../common/guards/admin-scope.guard';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import type { OnboardingDecision } from './onboarding-policy';
import { OnboardingService } from './onboarding.service';

export class ReviewOnboardingDto {
  @IsInt() @Min(0) version!: number;
  @IsIn(['approve_step', 'reject', 'reopen']) decision!: OnboardingDecision;
  @IsString()
  @MinLength(10)
  @MaxLength(1500)
  @Matches(/\S.{8,}\S/s)
  note!: string;
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  @Matches(/^[a-zA-Z0-9_\-/]+$/)
  evidenceReference?: string;
}
@Controller('v1/admin/staff/:id/onboarding')
@UseGuards(RolesGuard, AdminScopeGuard)
@Roles('admin')
@AdminScopes('ops_admin')
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}
  @Get() read(@Param('id') id: string) {
    return this.onboarding.read(id);
  }
  @Post('start')
  @RateLimit({ name: 'onboarding-start', limit: 20, windowMs: 60000 })
  start(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.onboarding.start(id, actor);
  }
  @Post('review')
  @RateLimit({ name: 'onboarding-review', limit: 30, windowMs: 60000 })
  review(
    @Param('id') id: string,
    @Body() dto: ReviewOnboardingDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.onboarding.review(id, dto, actor);
  }
}
