-- 2심 개시 때 공개하는 진영별 추가 인원 상한과 승인 기준 적용 시각 (M5)
ALTER TABLE "case" ADD COLUMN "appeal_side_cap" INTEGER;
ALTER TABLE "case" ADD COLUMN "appeal_approved_at" TIMESTAMP(3);
