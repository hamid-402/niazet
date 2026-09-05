import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @IsString()
  @Matches(/^09\d{9}$/, { message: 'شماره موبایل معتبر نیست.' })
  phone!: string;

  @IsString()
  @MinLength(2, { message: 'نام نمایشی خیلی کوتاه است.' })
  @MaxLength(100)
  fullName!: string;

  @IsOptional()
  @IsString()
  @MinLength(10, { message: 'رمز عبور باید حداقل ۱۰ کاراکتر باشد.' })
  @MaxLength(64)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/, {
    message: 'رمز عبور باید شامل حرف کوچک، حرف بزرگ، عدد و نماد باشد.',
  })
  password?: string;
}
