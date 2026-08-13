import { AdminScope, UserStatus } from '@prisma/client';
import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

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
