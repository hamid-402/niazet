import { BadRequestException } from '@nestjs/common';
import { OnboardingStage } from '@prisma/client';

export const ONBOARDING_STEPS: OnboardingStage[] = [
  'registered',
  'identity_verification',
  'skills_exam',
  'interview',
  'reference_check',
  'contract',
  'nda',
  'trial_period',
  'limited_access',
  'initial_evaluation',
  'approved',
];
export type OnboardingDecision = 'approve_step' | 'reject' | 'reopen';

export function nextOnboardingStage(
  stage: OnboardingStage,
  decision: OnboardingDecision,
  evidence?: string,
): OnboardingStage {
  if (decision === 'reopen') {
    if (stage !== 'rejected')
      throw new BadRequestException('فقط پرونده ردشده قابل بازگشایی است.');
    return 'registered';
  }
  if (stage === 'rejected')
    throw new BadRequestException('ابتدا پرونده را با دلیل بازگشایی کنید.');
  if (decision === 'reject') return 'rejected';
  const index = ONBOARDING_STEPS.indexOf(stage);
  if (index < 0 || stage === 'approved')
    throw new BadRequestException('مرحله دیگری برای تأیید وجود ندارد.');
  if (stage !== 'registered' && !evidence?.trim())
    throw new BadRequestException(
      'شناسه مدرک بررسی‌شده در مخزن خصوصی لازم است.',
    );
  return ONBOARDING_STEPS[index + 1];
}
