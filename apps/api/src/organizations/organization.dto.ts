import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  Matches,
} from 'class-validator';
export class OrganizationNameDto {
  @IsString() @MinLength(2) @MaxLength(100) @Matches(/\S/) name!: string;
}
export class InviteOrganizationDto {
  @IsString() @MinLength(3) @MaxLength(100) phone!: string;
  @IsIn(['manager', 'member']) role!: 'manager' | 'member';
  @IsOptional() @IsString() teamId?: string;
}
export class RespondInvitationDto {
  @IsBoolean() accept!: boolean;
}
export class EditOrganizationMemberDto {
  @IsIn(['manager', 'member']) role!: 'manager' | 'member';
  @IsIn(['active', 'revoked']) status!: 'active' | 'revoked';
  @IsOptional() @IsString() teamId?: string | null;
  @IsString() @MinLength(3) @MaxLength(500) note!: string;
}
export class TransferOrganizationDto {
  @IsString() memberId!: string;
  @IsString() @MinLength(3) @MaxLength(500) note!: string;
}
export class AttachOrganizationOrderDto {
  @IsString() @MinLength(3) @MaxLength(500) @Matches(/\S/) note!: string;
  @IsString() orderId!: string;
  @IsOptional() @IsString() teamId?: string;
  @IsInt() @Min(0) version!: number;
}
export class RequestOrganizationPlanDto {
  @IsString() planId!: string;
}
export class CreateOrganizationPlanDto extends OrganizationNameDto {
  @IsInt() @Min(1) @Max(10000) seats!: number;
  @IsInt() @Min(1) @Max(1000000) ordersPerPeriod!: number;
  @IsInt() @Min(0) @Max(2000000000) feeToman!: number;
  @IsInt() @Min(1) @Max(366) durationDays!: number;
}
export class SetOrganizationPlanActiveDto {
  @IsBoolean() active!: boolean;
}
export class ActivateOrganizationPlanDto extends RequestOrganizationPlanDto {
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  @Matches(/^[a-zA-Z0-9_\-/]+$/)
  contractReference!: string;
  @IsInt() @Min(0) version!: number;
  @IsString() @MinLength(3) @MaxLength(500) note!: string;
}
export class CancelOrganizationPlanDto {
  @IsInt() @Min(0) version!: number;
  @IsString() @MinLength(3) @MaxLength(500) note!: string;
}
