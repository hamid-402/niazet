import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
export class PublicationChecklistItemDto {
  @IsString() @MinLength(1) checklistItemId!: string;
  @IsBoolean() passed!: boolean;
}
export class ReviewOutputPublicationDto {
  @IsString() @Matches(/^[a-f0-9]{64}$/) expectedChecksum!: string;
  @IsString() @MinLength(3) @MaxLength(500) reason!: string;
  @IsOptional() @IsString() @MinLength(1) qcReviewId?: string;
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => PublicationChecklistItemDto)
  items!: PublicationChecklistItemDto[];
}
export class PublicationQueueDto {
  @IsOptional() @IsString() @Matches(/^[A-Za-z0-9_-]{1,128}$/) cursor?: string;
}
