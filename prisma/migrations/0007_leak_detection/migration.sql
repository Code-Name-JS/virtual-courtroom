-- 유출 자동 탐지 결과에 심급, 근거, 운영자 처리 기록을 더함 (M7)
ALTER TABLE "leak_detection" ADD COLUMN "round" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "leak_detection" ADD COLUMN "detail" JSONB;
ALTER TABLE "leak_detection" ADD COLUMN "handled_by" TEXT;
ALTER TABLE "leak_detection" ADD COLUMN "handled_at" TIMESTAMP(3);
ALTER TABLE "leak_detection" ADD COLUMN "resolution_note" TEXT;

-- 탐지된 회원이 지워지면(사이트 폐쇄 파기 등) 연결만 끊음
UPDATE "leak_detection" SET "suspect_user_id" = NULL
WHERE "suspect_user_id" IS NOT NULL AND "suspect_user_id" NOT IN (SELECT "id" FROM "user");
ALTER TABLE "leak_detection" ADD CONSTRAINT "leak_detection_suspect_user_id_fkey" FOREIGN KEY ("suspect_user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "leak_detection" ADD CONSTRAINT "leak_detection_handled_by_fkey" FOREIGN KEY ("handled_by") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "leak_detection_type_target_post_id_source_post_id_key" ON "leak_detection"("type", "target_post_id", "source_post_id");
CREATE INDEX "leak_detection_status_detected_at_idx" ON "leak_detection"("status", "detected_at");
CREATE INDEX "leak_detection_suspect_user_id_type_idx" ON "leak_detection"("suspect_user_id", "type");

-- 복사 글 탐지에서 원본 글을 열람한 사람을 찾을 때
CREATE INDEX "view_log_post_id_viewed_at_idx" ON "view_log"("post_id", "viewed_at");
