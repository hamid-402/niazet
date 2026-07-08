import { AdminScope, UserStatus } from '@prisma/client';
import { IsIn, IsOptional, IsString } from 'class-validator';

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
  phone!: string;

  @IsString()
  fullName!: string;

  @IsIn(ADMIN_SCOPES)
  adminScope!: AdminScope;

  @IsOptional()
  @IsString()
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
