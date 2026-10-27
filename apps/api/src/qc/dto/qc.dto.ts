import { Type } from 'class-transformer';
import {
  IsArray,
  ArrayMinSize,
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';

class QcReviewItemDto {
  @IsString()
  checklistItemId!: string;

  @IsBoolean()
  passed!: boolean;

  @IsOptional()
  @IsString()
  note?: string;
}

export class SubmitQcReviewDto {
  @IsOptional()
  @IsString()
  comment?: string;

  @IsArray()
  @ArrayMinSize(0)
  @ValidateNested({ each: true })
  @Type(() => QcReviewItemDto)
  items!: QcReviewItemDto[];

  @IsOptional()
  @IsBoolean()
  outputReviewed?: boolean;

  @IsOptional()
  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  manifestFingerprint?: string;
}
