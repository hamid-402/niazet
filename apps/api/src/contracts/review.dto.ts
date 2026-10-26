import {
  Equals,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class SubmitReviewDto {
  @IsInt() @Min(1) @Max(5) rating!: number;
  @IsOptional() @IsString() @MaxLength(3000) comment?: string;
  @IsBoolean() publicConsent!: boolean;
}
export class ModerateReviewDto {
  @IsInt() @Min(1) version!: number;
  @IsIn(['approved', 'rejected']) status!: 'approved' | 'rejected';
  @IsString() @MinLength(3) @MaxLength(500) reason!: string;
  @IsOptional() @IsString() @MaxLength(3000) publicComment?: string;
  @Equals(true) privacyReviewed!: boolean;
}
export class RateTicketDto {
  @IsInt() @Min(1) @Max(5) rating!: number;
}
