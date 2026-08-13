import { ExecutorStatus, ExecutorType } from '@prisma/client';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

const EXECUTOR_TYPES: ExecutorType[] = ['internal_staff', 'vetted_external'];
const EXECUTOR_STATUSES: ExecutorStatus[] = [
  'active',
  'over_capacity',
  'on_leave',
  'under_review',
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
}

export class UpdateStaffCapacityDto {
  @IsInt()
  @Min(0)
  @Max(100)
  capacityPercent!: number;
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

export class UpdateExecutionChecklistDto {
  @IsBoolean()
  completed!: boolean;
}
