import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class RequestPasswordResetDto {
  @IsString()
  @Matches(/^09\d{9}$/, { message: 'شماره موبایل معتبر نیست.' })
  phone!: string;
}

export class ResetPasswordDto extends RequestPasswordResetDto {
  @IsString()
  @Matches(/^\d{6}$/, { message: 'کد تایید باید ۶ رقم باشد.' })
  code!: string;

  @IsString()
  @MinLength(10, { message: 'رمز عبور باید حداقل ۱۰ کاراکتر باشد.' })
  @MaxLength(64)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/, {
    message: 'رمز عبور باید شامل حرف کوچک، حرف بزرگ، عدد و نماد باشد.',
  })
  password!: string;
}
