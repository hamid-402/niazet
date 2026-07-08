import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsOptional, IsString, ValidateNested } from 'class-validator';

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

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QcReviewItemDto)
  items?: QcReviewItemDto[];
}
