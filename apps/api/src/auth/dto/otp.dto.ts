import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export type OtpPurpose = 'register' | 'login' | 'password_reset';

export class RequestOtpDto {
  @IsString()
  @Matches(/^09\d{9}$/, { message: 'شماره موبایل معتبر نیست.' })
  phone!: string;

  @IsIn(['register', 'login'])
  purpose!: OtpPurpose;

  @IsOptional() @IsString() @MinLength(2) @MaxLength(100) fullName?: string;
  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(64)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/)
  password?: string;
}

export class VerifyOtpDto {
  @IsString()
  @Matches(/^09\d{9}$/, { message: 'شماره موبایل معتبر نیست.' })
  phone!: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'کد تایید باید ۶ رقم باشد.' })
  code!: string;

  @IsIn(['register', 'login'])
  purpose!: OtpPurpose;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  fullName?: string;

  @IsOptional() @IsUUID() registrationAttemptId?: string;
  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(64)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/)
  password?: string;
}
