import { Type } from 'class-transformer';
import {
  IsArray,
  ArrayMinSize,
  IsBoolean,
  IsOptional,
  IsString,
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
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => QcReviewItemDto)
  items!: QcReviewItemDto[];
}
