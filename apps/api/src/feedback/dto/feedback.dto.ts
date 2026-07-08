import { FeedbackTargetType, FeedbackType } from '@prisma/client';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

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
  comment?: string;
}
