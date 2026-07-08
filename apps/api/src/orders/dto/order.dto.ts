import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateOrderDto {
  @IsString()
  serviceId!: string;

  @IsOptional()
  @IsString()
  packageId?: string;

  @IsString()
  title!: string;

  @IsOptional()
  @IsIn(['low', 'normal', 'high', 'urgent'])
  urgency?: string;

  @IsString()
  briefDescription!: string;

  @IsOptional()
  @IsObject()
  formResponses?: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  @Min(0)
  budgetHint?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  acceptanceCriteria?: string[];
}

export class SubmitOrderDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  acceptanceCriteria?: string[];
}

export class TriageDecisionDto {
  @IsIn(['send_to_quote', 'auto_quote', 'need_more_info', 'assign_direct', 'reject'])
  decision!: 'send_to_quote' | 'auto_quote' | 'need_more_info' | 'assign_direct' | 'reject';

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  finalPrice?: number;
}

export class QuoteOrderDto {
  @IsInt()
  @Min(1000)
  finalPrice!: number;

  @IsOptional()
  @IsString()
  note?: string;
}

export class AssignOrderDto {
  @IsString()
  executorProfileId!: string;

  @IsOptional()
  @IsString()
  teamId?: string;

  @IsOptional()
  @IsIn(['pursuit_owner', 'team_lead', 'contributor', 'qc_reviewer'])
  assignmentRole?: 'pursuit_owner' | 'team_lead' | 'contributor' | 'qc_reviewer';

  @IsOptional()
  @IsString()
  note?: string;
}

export class ProgressReportDto {
  @IsString()
  summary!: string;

  @IsOptional()
  @IsString()
  fileId?: string;
}

export class DeliverOrderDto {
  @IsString()
  summary!: string;

  @IsArray()
  @IsString({ each: true })
  fileIds!: string[];
}

export class RevisionRequestDto {
  @IsString()
  reason!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  unmetCriteriaIds?: string[];
}

export class DisputeOrderDto {
  @IsString()
  reason!: string;

  @IsString()
  note!: string;
}

export class ResolveDisputeDto {
  @IsIn(['rework', 'refund_full', 'refund_partial', 'release_to_executor', 'close'])
  resolutionType!: 'rework' | 'refund_full' | 'refund_partial' | 'release_to_executor' | 'close';

  @IsOptional()
  @IsInt()
  @Min(0)
  amount?: number;

  @IsString()
  note!: string;
}

export class CancelOrderDto {
  @IsString()
  reason!: string;
}

export class OrderMessageDto {
  @IsString()
  body!: string;

  @IsOptional()
  @IsString()
  attachmentFileId?: string;

  @IsOptional()
  @IsIn(['customer_visible', 'internal_only'])
  visibility?: 'customer_visible' | 'internal_only';
}

export class ListOrdersQueryDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  serviceId?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  pageSize?: number;
}
