import {
  Equals,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
export const ONBOARDING_PURPOSES = [
  'request_services',
  'track_orders',
  'explore',
  'interested_in_collaboration',
] as const;
export class SaveCustomerOnboardingDto {
  @IsInt()
  @Equals(1)
  schemaVersion!: 1;

  @IsInt()
  @Min(0)
  @Max(2147483646)
  expectedRevision!: number;

  @IsBoolean()
  skipped!: boolean;

  @IsOptional()
  @IsIn(ONBOARDING_PURPOSES)
  purpose?: (typeof ONBOARDING_PURPOSES)[number] | null;
}
