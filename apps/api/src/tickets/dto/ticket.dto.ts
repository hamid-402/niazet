import { TicketCategory, TicketPriority } from '@prisma/client';
import { IsIn, IsOptional, IsString } from 'class-validator';

const CATEGORIES: TicketCategory[] = [
  'payment',
  'quality',
  'delay',
  'file',
  'report',
  'support',
  'complaint',
  'compliment',
  'other',
];
const PRIORITIES: TicketPriority[] = ['low', 'normal', 'high', 'urgent'];

export class CreateTicketDto {
  @IsString()
  subject!: string;

  @IsIn(CATEGORIES)
  category!: TicketCategory;

  @IsOptional()
  @IsString()
  orderId?: string;

  @IsOptional()
  @IsString()
  relatedPublicHandlerCode?: string;

  @IsString()
  message!: string;

  @IsOptional()
  @IsString()
  attachmentFileId?: string;

  @IsOptional()
  @IsIn(PRIORITIES)
  priority?: TicketPriority;
}

export class AddTicketMessageDto {
  @IsString()
  body!: string;

  @IsOptional()
  @IsString()
  attachmentFileId?: string;

  @IsOptional()
  @IsIn(['customer_visible', 'internal_only'])
  visibility?: 'customer_visible' | 'internal_only';
}

export class EscalateTicketDto {
  @IsString()
  reason!: string;
}

export class AssignTicketDto {
  @IsString()
  assignedToUserId!: string;
}
