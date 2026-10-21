import { CustomerAccountType } from '@prisma/client';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

const optionalText = (_object: unknown, value: unknown) =>
  value !== undefined && value !== '';

export class UpdateCustomerProfileDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  fullName!: string;

  @ValidateIf(optionalText)
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @IsEnum(CustomerAccountType)
  accountType!: CustomerAccountType;

  @ValidateIf(optionalText)
  @Matches(/^\d{10}$/, { message: 'کد ملی باید ۱۰ رقم باشد.' })
  nationalId?: string;

  @ValidateIf(optionalText)
  @IsString()
  @MaxLength(150)
  companyName?: string;

  @ValidateIf(optionalText)
  @Matches(/^\d{11}$/, { message: 'شناسه ملی شرکت باید ۱۱ رقم باشد.' })
  companyNationalId?: string;

  @ValidateIf(optionalText)
  @IsString()
  @MaxLength(30)
  companyRegistrationNumber?: string;

  @ValidateIf(optionalText)
  @IsString()
  @MaxLength(30)
  economicCode?: string;

  @ValidateIf(optionalText)
  @IsString()
  @MaxLength(150)
  billingRecipientName?: string;

  @ValidateIf(optionalText)
  @IsEmail()
  @MaxLength(254)
  invoiceEmail?: string;

  @ValidateIf(optionalText)
  @IsString()
  @MaxLength(100)
  province?: string;

  @ValidateIf(optionalText)
  @IsString()
  @MaxLength(100)
  city?: string;

  @ValidateIf(optionalText)
  @IsString()
  @MaxLength(500)
  addressLine?: string;

  @ValidateIf(optionalText)
  @Matches(/^\d{10}$/, { message: 'کد پستی باید ۱۰ رقم باشد.' })
  postalCode?: string;

  @IsBoolean()
  marketingConsent!: boolean;

  @IsBoolean()
  analyticsConsent!: boolean;
}

export class RequestAccountDeletionDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
