import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class ReleaseEscrowDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  amount?: number;

  @IsString()
  note!: string;
}

export class RefundEscrowDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  amount?: number;

  @IsString()
  reason!: string;

  @IsString()
  note!: string;
}

export class DecideWithdrawalDto {
  @IsOptional()
  @IsString()
  note?: string;
}
