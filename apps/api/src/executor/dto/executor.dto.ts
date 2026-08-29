import { Type } from 'class-transformer';
import {
  AttendanceStatus,
  ExecutorStatus,
  ExecutorType,
  UserStatus,
  VerificationStatus,
} from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const EXECUTOR_TYPES: ExecutorType[] = ['internal_staff', 'vetted_external'];
const VERIFICATION_STATUSES: VerificationStatus[] = [
  'pending',
  'in_review',
  'approved',
  'rejected',
];
const EXECUTOR_STATUSES: ExecutorStatus[] = [
  'active',
  'over_capacity',
  'on_leave',
  'under_review',
  'blocked',
];
const ATTENDANCE_STATUSES: AttendanceStatus[] = [
  'present',
  'remote',
  'leave',
  'sick_leave',
  'absent',
];
const USER_STATUSES: UserStatus[] = [
  'pending_verification',
  'active',
  'suspended',
  'blocked',
];

export class CreateStaffDto {
  @IsString()
  phone!: string;

  @IsString()
  fullName!: string;

  @IsString()
  displayAlias!: string;

  @IsOptional()
  @IsString()
  teamId?: string;

  @IsOptional()
  @IsIn(EXECUTOR_TYPES)
  executorType?: ExecutorType;
}

export class UpdateStaffStatusDto {
  @IsIn(EXECUTOR_STATUSES)
  status!: ExecutorStatus;

  @IsString()
  @MinLength(3)
  note!: string;
}

export class UpdateStaffCapacityDto {
  @IsInt()
  @Min(0)
  @Max(100)
  capacityPercent!: number;

  @IsString()
  @MinLength(3)
  note!: string;
}

export class CreateTeamDto {
  @IsString()
  name!: string;

  @IsString()
  code!: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class CreateSkillDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  category?: string;
}

export class UpdateStaffProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  displayAlias?: string;

  @IsOptional()
  @IsString()
  teamId?: string | null;

  @IsOptional()
  @IsIn(EXECUTOR_TYPES)
  executorType?: ExecutorType;

  @IsOptional()
  @IsIn(VERIFICATION_STATUSES)
  verificationStatus?: VerificationStatus;

  @IsString()
  @MinLength(3)
  note!: string;
}

export class StaffSkillInputDto {
  @IsString()
  skillId!: string;

  @IsInt()
  @Min(1)
  @Max(5)
  level!: number;
}

export class UpdateStaffSkillsDto {
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => StaffSkillInputDto)
  skills!: StaffSkillInputDto[];

  @IsString()
  @MinLength(3)
  note!: string;
}

export class UpsertAttendanceDto {
  @IsDateString()
  workDate!: string;

  @IsIn(ATTENDANCE_STATUSES)
  status!: AttendanceStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsString()
  @MinLength(3)
  reason!: string;
}

export class AttendanceQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

export class UpdateStaffAccessDto {
  @IsIn(USER_STATUSES)
  userStatus!: UserStatus;

  @IsBoolean()
  customerCapability!: boolean;

  @IsString()
  @MinLength(3)
  note!: string;
}

export class UpdateExecutionChecklistDto {
  @IsBoolean()
  completed!: boolean;
}
