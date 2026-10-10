-- 만 14세 미만 회원의 법정대리인 동의 시각 (M6)
ALTER TABLE "user" ADD COLUMN "guardian_consented_at" TIMESTAMP(3);
