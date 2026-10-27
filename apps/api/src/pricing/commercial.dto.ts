import {
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import type { PricingPriority } from './dto/calculate-price.dto';

export class CommercialPolicyDto {
  @IsInt() @Min(1) @Max(2147483647) version!: number;
  @IsObject() config!: Record<string, unknown>;
  @IsString() @MinLength(3) @MaxLength(500) reason!: string;
}
export class CommercialOfferDto {
  @IsIn(['normal', 'urgent', 'same_day']) priority!: PricingPriority;
  @IsOptional() @IsObject() inputs?: Record<string, unknown>;
}
export class CommercialAdminOfferDto extends CommercialOfferDto {
  @IsOptional() @IsInt() @Min(0) @Max(2000000000) quotedBasePrice?: number;
  @IsString() @MinLength(3) @MaxLength(500) reason!: string;
}
export class CommercialAcceptDto {
  @IsString() @Matches(/^[a-f0-9]{64}$/) fingerprint!: string;
}
export class CommercialReasonDto {
  @IsString() @MinLength(3) @MaxLength(500) reason!: string;
}
export class CapacityBucketDto extends CommercialReasonDto {
  @IsString() @MinLength(1) serviceId!: string;
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) day!: string;
  @IsString() @Matches(/^(\*|[a-z][a-z0-9_-]{0,63})$/) skill!: string;
  @IsInt() @Min(0) @Max(1000000) limit!: number;
}
