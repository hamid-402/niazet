import { IsIn, IsString, Matches } from 'class-validator';

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
  code!: string;

  @IsIn(['register', 'login'])
  purpose!: OtpPurpose;

  @IsString()
  fullName?: string;
}
