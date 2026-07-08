import { IsString, Matches } from 'class-validator';

export class LoginDto {
  @IsString()
  @Matches(/^09\d{9}$/, { message: 'شماره موبایل معتبر نیست.' })
  phone!: string;

  @IsString()
  password!: string;
}
