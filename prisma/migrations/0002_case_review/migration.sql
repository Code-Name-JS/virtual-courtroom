-- AlterTable
ALTER TABLE "case" ADD COLUMN     "ai_generated_at" TIMESTAMP(3),
ADD COLUMN     "review_checklist" JSONB;

