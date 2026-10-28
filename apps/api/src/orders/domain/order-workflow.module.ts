import { Module } from '@nestjs/common';
import { OrderWorkflowService } from './order-workflow.service';

// Shared domain boundary, independent of order controllers and finance modules.
@Module({ providers: [OrderWorkflowService], exports: [OrderWorkflowService] })
export class OrderWorkflowModule {}
