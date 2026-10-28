import { IsIn, IsString, IsUUID, Length, ValidateIf } from 'class-validator';

export const PRICING_PRIORITIES = ['normal', 'urgent', 'same_day'] as const;
export type PricingPriority = (typeof PRICING_PRIORITIES)[number];

export class CalculatePriceDto {
  @IsString()
  @Length(1, 100)
  serviceSlug!: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsUUID()
  packageId?: string;

  @IsIn(PRICING_PRIORITIES)
  priority!: PricingPriority;
}
