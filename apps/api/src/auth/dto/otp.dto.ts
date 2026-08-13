import { IsIn, IsOptional, IsString, Matches } from 'class-validator';

export type OtpPurpose = 'register' | 'login';

export class RequestOtpDto {
  @IsString()
  @Matches(/^09\d{9}$/, { message: 'شماره موبایل معتبر نیست.' })
  phone!: string;

  @IsIn(['register', 'login'])
  purpose!: OtpPurpose;
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
  fullName?: string;
}
