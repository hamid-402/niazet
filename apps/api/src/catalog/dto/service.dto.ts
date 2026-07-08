import { PricingModel } from '@prisma/client';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

const PRICING_MODELS: PricingModel[] = ['fixed', 'formula', 'manual_quote'];

export class CreateServiceDto {
  @IsString()
  slug!: string;

  @IsString()
  title!: string;

  @IsString()
  category!: string;

  @IsString()
  description!: string;

  @IsOptional()
  @IsString()
  deliverables?: string;

  @IsIn(PRICING_MODELS)
  pricingModel!: PricingModel;

  @IsOptional()
  @IsInt()
  @Min(0)
  basePrice?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  slaHours?: number;

  @IsOptional()
  @IsString()
  revisionPolicy?: string;
}

export class UpdateServiceDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  deliverables?: string;

  @IsOptional()
  @IsIn(PRICING_MODELS)
  pricingModel?: PricingModel;

  @IsOptional()
  @IsInt()
  @Min(0)
  basePrice?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  slaHours?: number;

  @IsOptional()
  @IsString()
  revisionPolicy?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreatePackageDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  slaHours?: number;

  @IsOptional()
  @IsString()
  deliverables?: string;
}
