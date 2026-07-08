import { IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class RegisterDto {
  @IsString()
  @Matches(/^09\d{9}$/, { message: 'شماره موبایل معتبر نیست.' })
  phone!: string;

  @IsString()
  @MinLength(2, { message: 'نام نمایشی خیلی کوتاه است.' })
  fullName!: string;

  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'رمز عبور باید حداقل ۸ کاراکتر باشد.' })
  password?: string;
}
