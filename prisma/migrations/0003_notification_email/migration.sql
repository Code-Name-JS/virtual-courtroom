-- AlterTable
ALTER TABLE "notification" ADD COLUMN     "emailed_at" TIMESTAMP(3),
ADD COLUMN     "send_email" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "notification_send_email_emailed_at_idx" ON "notification"("send_email", "emailed_at");

