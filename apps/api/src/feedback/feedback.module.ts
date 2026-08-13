import { Module } from '@nestjs/common';
import { FeedbackService } from './feedback.service';
import {
  FeedbackAdminController,
  FeedbackController,
} from './feedback.controller';

@Module({
  controllers: [FeedbackController, FeedbackAdminController],
  providers: [FeedbackService],
  exports: [FeedbackService],
})
export class FeedbackModule {}
