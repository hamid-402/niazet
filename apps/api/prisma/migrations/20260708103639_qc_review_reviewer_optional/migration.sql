-- DropForeignKey
ALTER TABLE "qc_reviews" DROP CONSTRAINT "qc_reviews_reviewer_user_id_fkey";

-- AlterTable
ALTER TABLE "qc_reviews" ALTER COLUMN "reviewer_user_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "qc_reviews" ADD CONSTRAINT "qc_reviews_reviewer_user_id_fkey" FOREIGN KEY ("reviewer_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
