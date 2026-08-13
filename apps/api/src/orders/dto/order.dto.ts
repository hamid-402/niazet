import { Type } from 'class-transformer';
import {
  IsArray,
  ArrayMinSize,
  ArrayUnique,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class CreateOrderDto {
  @IsString()
  serviceId!: string;

  @IsOptional()
  @IsString()
  packageId?: string | null;

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
  budgetHint?: number | null;

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

export class UpdateOrderDraftDto {
  @IsOptional()
  @IsString()
  packageId?: string | null;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsIn(['low', 'normal', 'high', 'urgent'])
  urgency?: string;

  @IsOptional()
  @IsString()
  briefDescription?: string;

  @IsOptional()
  @IsObject()
  formResponses?: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  @Min(0)
  budgetHint?: number | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  acceptanceCriteria?: string[];

  @IsInt()
  @Min(0)
  version!: number;
}

export class TriageDecisionDto {
  @IsIn([
    'send_to_quote',
    'auto_quote',
    'need_more_info',
    'assign_direct',
    'reject',
  ])
  decision!:
    | 'send_to_quote'
    | 'auto_quote'
    | 'need_more_info'
    | 'assign_direct'
    | 'reject';

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
  assignmentRole?:
    'pursuit_owner' | 'team_lead' | 'contributor' | 'qc_reviewer';

  @IsOptional()
  @IsString()
  note?: string;
}

export class PaymentIntentDto {
  @IsOptional()
  @IsString()
  milestoneId?: string;
}

class MilestoneInputDto {
  @IsInt()
  @Min(1)
  sequence!: number;

  @IsString()
  @MinLength(2)
  title!: string;

  @IsInt()
  @Min(1)
  amount!: number;

  @IsOptional()
  @IsString()
  acceptanceCriteria?: string;
}

export class ConfigureMilestonesDto {
  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => MilestoneInputDto)
  milestones!: MilestoneInputDto[];
}

export class DeliverMilestoneDto {
  @IsString()
  @MinLength(3)
  summary!: string;
}

export class ProgressReportDto {
  @IsString()
  summary!: string;

  @IsOptional()
  @IsString()
  fileId?: string;
}

export class CreateManagementReportDto {
  @IsString()
  @MinLength(3)
  summary!: string;

  @IsOptional()
  @IsString()
  fileId?: string;

  @IsBoolean()
  visibleToCustomer!: boolean;
}

export class DeliverOrderDto {
  @IsString()
  @MinLength(3)
  summary!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsString({ each: true })
  fileIds!: string[];
}

export class RevisionRequestDto {
  @IsString()
  @MinLength(3)
  reason!: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
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
  @IsIn([
    'rework',
    'refund_full',
    'refund_partial',
    'release_to_executor',
    'close',
  ])
  resolutionType!:
    | 'rework'
    | 'refund_full'
    | 'refund_partial'
    | 'release_to_executor'
    | 'close';

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

export class ListOrdersQueryDto extends PaginationDto {
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
  @IsIn(['createdAt', 'updatedAt', 'code', 'quotedPrice'])
  sortBy?: 'createdAt' | 'updatedAt' | 'code' | 'quotedPrice';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDirection?: 'asc' | 'desc';
}
