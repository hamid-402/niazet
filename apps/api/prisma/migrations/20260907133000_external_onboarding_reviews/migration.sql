ALTER TABLE "executor_onboardings" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE "onboarding_reviews" (
  "id" TEXT NOT NULL,
  "onboarding_id" TEXT NOT NULL,
  "actor_user_id" TEXT NOT NULL,
  "stage" "OnboardingStage" NOT NULL,
  "decision" TEXT NOT NULL CHECK ("decision" IN ('approve_step', 'reject', 'reopen')),
  "note" TEXT NOT NULL,
  "evidence_reference" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "onboarding_reviews_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "onboarding_reviews_onboarding_id_fkey" FOREIGN KEY ("onboarding_id") REFERENCES "executor_onboardings"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "onboarding_reviews_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "onboarding_reviews_onboarding_id_created_at_idx" ON "onboarding_reviews"("onboarding_id", "created_at");
