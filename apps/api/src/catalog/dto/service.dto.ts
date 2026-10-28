import { PricingModel } from '@prisma/client';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Min,
  MinLength,
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

const FORM_FIELD_TYPES = [
  'text',
  'textarea',
  'number',
  'select',
  'radio',
  'checkbox',
  'multiselect',
  'date',
  'email',
  'url',
] as const;

export class CreateFormFieldDto {
  @IsString()
  @MinLength(2)
  label!: string;

  @IsString()
  @Matches(/^[a-z][a-z0-9_]{1,63}$/)
  fieldKey!: string;

  @IsIn(FORM_FIELD_TYPES)
  fieldType!: string;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  options?: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class CreateAcceptanceCriterionDto {
  @IsString()
  @MinLength(3)
  description!: string;
}

export class CreateQcTemplateDto {
  @IsString()
  @MinLength(2)
  name!: string;
}

export class CreateQcItemDto {
  @IsString()
  @MinLength(2)
  label!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
