import { IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';

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

export class RequestWithdrawalDto {
  @IsInt()
  @Min(1)
  amount!: number;

  @IsString()
  @Matches(/^IR\d{24}$/)
  shabaNumber!: string;
}

export class VerifyShabaDto {
  @IsString()
  executorProfileId!: string;

  @IsString()
  @Matches(/^IR\d{24}$/)
  shabaNumber!: string;
}

export class CorrectLedgerEntryDto {
  @IsString()
  reason!: string;
}
