import {
  FeedbackStatus,
  FeedbackTargetType,
  FeedbackType,
} from '@prisma/client';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const TARGET_TYPES: FeedbackTargetType[] = [
  'order',
  'team',
  'executor',
  'support',
  'qc',
];
const FEEDBACK_TYPES: FeedbackType[] = ['rating', 'complaint', 'compliment'];

export class CreateFeedbackDto {
  @IsIn(TARGET_TYPES)
  targetType!: FeedbackTargetType;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{2,5}-[A-Z0-9]+$/)
  publicHandlerCode?: string;

  @IsIn(FEEDBACK_TYPES)
  feedbackType!: FeedbackType;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  satisfactionPercent?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}

export class ListFeedbackQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(30)
  code?: string;

  @IsOptional()
  @IsIn(FEEDBACK_TYPES)
  feedbackType?: FeedbackType;

  @IsOptional()
  @IsIn(['submitted', 'in_review', 'resolved', 'closed'])
  status?: FeedbackStatus;
}

export class UpdateFeedbackStatusDto {
  @IsIn(['in_review', 'resolved', 'closed'])
  status!: FeedbackStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  resolutionNote?: string;
}
