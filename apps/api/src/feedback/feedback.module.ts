import { Module } from '@nestjs/common';
import { FeedbackService } from './feedback.service';
import { ReviewsService } from '../contracts/reviews.service';
import {
  CustomerReviewController,
  PublicReviewController,
  ReviewAdminController,
} from '../contracts/reviews.controller';
import {
  FeedbackAdminController,
  FeedbackController,
} from './feedback.controller';

@Module({
  controllers: [
    FeedbackController,
    FeedbackAdminController,
    CustomerReviewController,
    PublicReviewController,
    ReviewAdminController,
  ],
  providers: [FeedbackService, ReviewsService],
  exports: [FeedbackService],
})
export class FeedbackModule {}
