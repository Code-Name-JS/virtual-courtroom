-- 03 L-03 문의하기 (M8)
CREATE TYPE "InquiryCategory" AS ENUM ('account', 'case_progress', 'privacy', 'copyright', 'bug', 'other');
CREATE TYPE "InquiryStatus" AS ENUM ('open', 'answered');

CREATE TABLE "inquiry" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "category" "InquiryCategory" NOT NULL,
    "body" TEXT NOT NULL,
    "status" "InquiryStatus" NOT NULL DEFAULT 'open',
    "answer" TEXT,
    "answered_by" TEXT,
    "answered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inquiry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "inquiry_status_created_at_idx" ON "inquiry"("status", "created_at");
CREATE INDEX "inquiry_user_id_created_at_idx" ON "inquiry"("user_id", "created_at");

-- 회원을 지우면(사이트 폐쇄 파기 등) 그 회원의 문의도 함께 지움
ALTER TABLE "inquiry" ADD CONSTRAINT "inquiry_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inquiry" ADD CONSTRAINT "inquiry_answered_by_fkey" FOREIGN KEY ("answered_by") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
