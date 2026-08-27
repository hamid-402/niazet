import { AdminScope, UserRole, UserStatus } from '@prisma/client';
import {
  IsDefined,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class ListUsersQueryDto extends PaginationDto {
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}

export class AuditLogQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  entityType?: string;

  @IsOptional()
  @IsString()
  actorUserId?: string;
}

const ADMIN_SCOPES: AdminScope[] = [
  'super_admin',
  'ops_admin',
  'finance_admin',
];
const USER_STATUSES: UserStatus[] = [
  'pending_verification',
  'active',
  'suspended',
  'blocked',
];

export class CreateAdminDto {
  @IsString()
  @Matches(/^09\d{9}$/, { message: 'شماره موبایل معتبر نیست.' })
  phone!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  fullName!: string;

  @IsIn(ADMIN_SCOPES)
  adminScope!: AdminScope;

  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(64)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/, {
    message: 'رمز عبور باید شامل حرف کوچک، حرف بزرگ، عدد و نماد باشد.',
  })
  password?: string;
}

export class UpdateAdminScopeDto {
  @IsIn(ADMIN_SCOPES)
  adminScope!: AdminScope;
}

export class UpdateUserStatusDto {
  @IsIn(USER_STATUSES)
  status!: UserStatus;
}

export const SYSTEM_SETTING_KEYS = [
  'finance.commission_rate',
  'finance.withdrawal_min',
  'finance.withdrawal_max',
  'finance.cancel_in_progress_refund_rate',
  'calendar.iran_holidays',
  'ai.enabled',
  'ai.order_triage_enabled',
  'ai.support_draft_enabled',
  'ai.human_approval_required',
] as const;

export class UpdateSettingDto {
  @IsString()
  @IsIn(SYSTEM_SETTING_KEYS)
  key!: (typeof SYSTEM_SETTING_KEYS)[number];

  @IsDefined()
  value!: unknown;
}
