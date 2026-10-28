import {
  IsEmail,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform, TransformFnParams } from 'class-transformer';

const trimEmail = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class EmailPasswordLoginDto {
  @Transform(trimEmail)
  @IsEmail({ allow_utf8_local_part: false, allow_display_name: false })
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(72)
  password!: string;
}
export class EmailIdentityPasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(72)
  currentPassword!: string;
}
export class RequestVerifiedEmailDto extends EmailIdentityPasswordDto {
  @Transform(trimEmail)
  @IsEmail({ allow_utf8_local_part: false, allow_display_name: false })
  @MaxLength(254)
  email!: string;
}
export class ConfirmVerifiedEmailDto {
  @IsUUID('4')
  challengeId!: string;

  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  token!: string;
}
