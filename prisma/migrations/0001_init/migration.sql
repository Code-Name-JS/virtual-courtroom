-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('member', 'operator');

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('DRAFT', 'INDICTMENT_VOTE', 'DISMISSED', 'INDICTMENT_PENDING', 'PRETRIAL', 'EVIDENCE', 'ADVOCATE_SELECTION', 'FINAL_ARGUMENT', 'DELIBERATION', 'SENTENCING', 'REVIEW', 'APPEAL_DECISION', 'APPEAL_RECRUITMENT', 'FINALIZED', 'SITE_CLOSED');

-- CreateEnum
CREATE TYPE "Side" AS ENUM ('indict', 'dismiss');

-- CreateEnum
CREATE TYPE "GeneratedBy" AS ENUM ('ai', 'operator');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('system', 'operator', 'ai');

-- CreateEnum
CREATE TYPE "CaseDecision" AS ENUM ('dismiss_for_quorum', 'indict', 'select_advocate', 'pronounce', 'open_appeal', 'reject_appeal', 'correct_case', 'extend_for_outage', 'close_site');

-- CreateEnum
CREATE TYPE "JoinedVia" AS ENUM ('indictment_vote', 'continued', 'appeal_application');

-- CreateEnum
CREATE TYPE "ParticipationStatus" AS ENUM ('voted', 'signed', 'excluded', 'advocate', 'done');

-- CreateEnum
CREATE TYPE "ExcludedReason" AS ENUM ('unsigned', 'sanction', 'declined_round2');

-- CreateEnum
CREATE TYPE "IpChangeResult" AS ENUM ('approved', 'blocked_in_use', 'failed_verification');

-- CreateEnum
CREATE TYPE "VerificationPurpose" AS ENUM ('signup', 'ip_change');

-- CreateEnum
CREATE TYPE "GuardianConsentStatus" AS ENUM ('pending', 'consented', 'refused', 'expired');

-- CreateEnum
CREATE TYPE "AdvocateSelectedBy" AS ENUM ('operator', 'ai_default', 'vote_default');

-- CreateEnum
CREATE TYPE "VerdictChoice" AS ENUM ('guilty', 'not_guilty');

-- CreateEnum
CREATE TYPE "EvidenceType" AS ENUM ('link', 'image', 'text');

-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('leak', 'abuse', 'other');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('open', 'reviewing', 'resolved', 'rejected');

-- CreateEnum
CREATE TYPE "DetectionType" AS ENUM ('copy_similarity', 'abnormal_view', 'watermark_match');

-- CreateEnum
CREATE TYPE "DetectionStatus" AS ENUM ('open', 'confirmed', 'dismissed');

-- CreateEnum
CREATE TYPE "SanctionLevel" AS ENUM ('warning', 'write_ban', 'excluded');

-- CreateEnum
CREATE TYPE "Violation" AS ENUM ('leak', 'leak_post', 'mass_leak', 'multi_account', 'abuse');

-- CreateEnum
CREATE TYPE "AppealStatus" AS ENUM ('pending', 'accepted', 'rejected');

-- CreateEnum
CREATE TYPE "JudgmentOutcome" AS ENUM ('guilty', 'not_guilty');

-- CreateEnum
CREATE TYPE "SentenceType" AS ENUM ('prison', 'probation', 'fine');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "email_verified_at" TIMESTAMP(3),
    "password_hash" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'member',
    "is_under_14" BOOLEAN NOT NULL DEFAULT false,
    "totp_secret_enc" TEXT,
    "totp_enabled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "totp_verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ip_binding" (
    "user_id" TEXT NOT NULL,
    "ip_hash" TEXT NOT NULL,
    "verified_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ip_binding_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "ip_change_log" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "old_ip_hash" TEXT,
    "new_ip_hash" TEXT NOT NULL,
    "result" "IpChangeResult" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ip_change_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_verification" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "purpose" "VerificationPurpose" NOT NULL,
    "code_hash" TEXT NOT NULL,
    "pending_ip_hash" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),

    CONSTRAINT "email_verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardian_consent" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "guardian_name" TEXT NOT NULL,
    "guardian_email" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "status" "GuardianConsentStatus" NOT NULL DEFAULT 'pending',
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guardian_consent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limit_event" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rate_limit_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "ai_original_body" TEXT NOT NULL,
    "generated_by" "GeneratedBy" NOT NULL DEFAULT 'ai',
    "ai_model" TEXT,
    "review_note" TEXT,
    "status" "CaseStatus" NOT NULL DEFAULT 'DRAFT',
    "round" INTEGER NOT NULL DEFAULT 1,
    "min_participants" INTEGER NOT NULL DEFAULT 50,
    "max_participants" INTEGER,
    "appeal_criteria" TEXT,
    "published_at" TIMESTAMP(3),
    "closure_scheduled_at" TIMESTAMP(3),
    "closure_summary" TEXT,
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stage_schedule" (
    "id" TEXT NOT NULL,
    "case_id" INTEGER NOT NULL DEFAULT 1,
    "round" INTEGER NOT NULL,
    "stage" "CaseStatus" NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),

    CONSTRAINT "stage_schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_event" (
    "id" TEXT NOT NULL,
    "case_id" INTEGER NOT NULL DEFAULT 1,
    "round" INTEGER NOT NULL,
    "from_status" "CaseStatus",
    "to_status" "CaseStatus",
    "actor_type" "ActorType" NOT NULL,
    "actor_user_id" TEXT,
    "decision" "CaseDecision",
    "reason" TEXT,
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "participation" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "side" "Side" NOT NULL,
    "joined_via" "JoinedVia" NOT NULL,
    "status" "ParticipationStatus" NOT NULL,
    "signed_at" TIMESTAMP(3),
    "excluded_reason" "ExcludedReason",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "participation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "indictment_vote" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "choice" "Side" NOT NULL,
    "voted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "indictment_vote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "advocate_nomination" (
    "id" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "voter_participation_id" TEXT NOT NULL,
    "candidate_participation_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "advocate_nomination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "advocate" (
    "id" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "side" "Side" NOT NULL,
    "ai_recommended_participation_id" TEXT,
    "ai_rationale" TEXT,
    "ai_request" TEXT,
    "ai_response" TEXT,
    "participation_id" TEXT NOT NULL,
    "selected_by" "AdvocateSelectedBy" NOT NULL,
    "operator_reason" TEXT,
    "selected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "advocate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verdict_receipt" (
    "participation_id" TEXT NOT NULL,
    "round" INTEGER NOT NULL,

    CONSTRAINT "verdict_receipt_pkey" PRIMARY KEY ("participation_id")
);

-- CreateTable
CREATE TABLE "verdict_ballot" (
    "id" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "choice" "VerdictChoice" NOT NULL,

    CONSTRAINT "verdict_ballot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post" (
    "id" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "side" "Side" NOT NULL,
    "author_participation_id" TEXT NOT NULL,
    "root_post_id" TEXT,
    "parent_post_id" TEXT,
    "body" TEXT NOT NULL,
    "is_hidden" BOOLEAN NOT NULL DEFAULT false,
    "hidden_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_revision" (
    "id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "revised_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_revision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence" (
    "id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "type" "EvidenceType" NOT NULL,
    "url_or_file_key" TEXT NOT NULL,
    "source_note" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "final_argument" (
    "id" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "side" "Side" NOT NULL,
    "advocate_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "final_argument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "view_log" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "watermark_code" TEXT NOT NULL,
    "viewed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "view_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report" (
    "id" TEXT NOT NULL,
    "reporter_user_id" TEXT NOT NULL,
    "target_post_id" TEXT NOT NULL,
    "reason" "ReportReason" NOT NULL,
    "detail" TEXT NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'open',
    "handled_by" TEXT,
    "handled_at" TIMESTAMP(3),
    "resolution_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leak_detection" (
    "id" TEXT NOT NULL,
    "type" "DetectionType" NOT NULL,
    "target_post_id" TEXT,
    "source_post_id" TEXT,
    "suspect_user_id" TEXT,
    "score" INTEGER NOT NULL,
    "status" "DetectionStatus" NOT NULL DEFAULT 'open',
    "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leak_detection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sanction" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "level" "SanctionLevel" NOT NULL,
    "violation" "Violation" NOT NULL,
    "reason" TEXT NOT NULL,
    "report_id" TEXT,
    "detection_id" TEXT,
    "issued_by" TEXT NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sanction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sanction_appeal" (
    "id" TEXT NOT NULL,
    "sanction_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "AppealStatus" NOT NULL DEFAULT 'pending',
    "decided_by" TEXT,
    "decision_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMP(3),

    CONSTRAINT "sanction_appeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "judgment" (
    "id" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "outcome" "JudgmentOutcome" NOT NULL,
    "sentence_type" "SentenceType",
    "sentence_detail" TEXT,
    "reasoning" TEXT NOT NULL,
    "baseline_indict_ratio" DOUBLE PRECISION NOT NULL,
    "verdict_guilty" INTEGER NOT NULL,
    "verdict_not_guilty" INTEGER NOT NULL,
    "pronounced_by" TEXT NOT NULL,
    "pronounced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "judgment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review" (
    "id" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "author_participation_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "rating" INTEGER,
    "is_appeal" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_comment" (
    "id" TEXT NOT NULL,
    "review_id" TEXT NOT NULL,
    "author_user_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appeal_application" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "requested_side" "Side" NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'pending',
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appeal_application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notice" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "author_user_id" TEXT,
    "is_pinned" BOOLEAN NOT NULL DEFAULT false,
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB,
    "link" TEXT,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_nickname_key" ON "user"("nickname");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_hash_key" ON "session"("token_hash");

-- CreateIndex
CREATE INDEX "session_user_id_idx" ON "session"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "ip_binding_ip_hash_key" ON "ip_binding"("ip_hash");

-- CreateIndex
CREATE INDEX "ip_change_log_user_id_created_at_idx" ON "ip_change_log"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "email_verification_user_id_purpose_idx" ON "email_verification"("user_id", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "guardian_consent_user_id_key" ON "guardian_consent"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "guardian_consent_token_hash_key" ON "guardian_consent"("token_hash");

-- CreateIndex
CREATE INDEX "rate_limit_event_key_created_at_idx" ON "rate_limit_event"("key", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "stage_schedule_round_stage_key" ON "stage_schedule"("round", "stage");

-- CreateIndex
CREATE INDEX "case_event_created_at_idx" ON "case_event"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "participation_user_id_round_key" ON "participation"("user_id", "round");

-- CreateIndex
CREATE UNIQUE INDEX "indictment_vote_user_id_key" ON "indictment_vote"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "advocate_nomination_voter_participation_id_round_key" ON "advocate_nomination"("voter_participation_id", "round");

-- CreateIndex
CREATE UNIQUE INDEX "advocate_round_side_key" ON "advocate"("round", "side");

-- CreateIndex
CREATE INDEX "verdict_ballot_round_idx" ON "verdict_ballot"("round");

-- CreateIndex
CREATE INDEX "post_round_side_created_at_idx" ON "post"("round", "side", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "final_argument_advocate_id_key" ON "final_argument"("advocate_id");

-- CreateIndex
CREATE UNIQUE INDEX "final_argument_round_side_key" ON "final_argument"("round", "side");

-- CreateIndex
CREATE INDEX "view_log_watermark_code_idx" ON "view_log"("watermark_code");

-- CreateIndex
CREATE INDEX "view_log_user_id_viewed_at_idx" ON "view_log"("user_id", "viewed_at");

-- CreateIndex
CREATE UNIQUE INDEX "sanction_appeal_sanction_id_key" ON "sanction_appeal"("sanction_id");

-- CreateIndex
CREATE UNIQUE INDEX "judgment_round_key" ON "judgment"("round");

-- CreateIndex
CREATE UNIQUE INDEX "review_author_participation_id_round_key" ON "review"("author_participation_id", "round");

-- CreateIndex
CREATE UNIQUE INDEX "appeal_application_user_id_key" ON "appeal_application"("user_id");

-- CreateIndex
CREATE INDEX "notification_user_id_created_at_idx" ON "notification"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ip_binding" ADD CONSTRAINT "ip_binding_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ip_change_log" ADD CONSTRAINT "ip_change_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_verification" ADD CONSTRAINT "email_verification_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardian_consent" ADD CONSTRAINT "guardian_consent_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stage_schedule" ADD CONSTRAINT "stage_schedule_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_event" ADD CONSTRAINT "case_event_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_event" ADD CONSTRAINT "case_event_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participation" ADD CONSTRAINT "participation_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "indictment_vote" ADD CONSTRAINT "indictment_vote_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advocate_nomination" ADD CONSTRAINT "advocate_nomination_voter_participation_id_fkey" FOREIGN KEY ("voter_participation_id") REFERENCES "participation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advocate_nomination" ADD CONSTRAINT "advocate_nomination_candidate_participation_id_fkey" FOREIGN KEY ("candidate_participation_id") REFERENCES "participation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advocate" ADD CONSTRAINT "advocate_participation_id_fkey" FOREIGN KEY ("participation_id") REFERENCES "participation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advocate" ADD CONSTRAINT "advocate_ai_recommended_participation_id_fkey" FOREIGN KEY ("ai_recommended_participation_id") REFERENCES "participation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verdict_receipt" ADD CONSTRAINT "verdict_receipt_participation_id_fkey" FOREIGN KEY ("participation_id") REFERENCES "participation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post" ADD CONSTRAINT "post_author_participation_id_fkey" FOREIGN KEY ("author_participation_id") REFERENCES "participation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post" ADD CONSTRAINT "post_root_post_id_fkey" FOREIGN KEY ("root_post_id") REFERENCES "post"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post" ADD CONSTRAINT "post_parent_post_id_fkey" FOREIGN KEY ("parent_post_id") REFERENCES "post"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_revision" ADD CONSTRAINT "post_revision_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "final_argument" ADD CONSTRAINT "final_argument_advocate_id_fkey" FOREIGN KEY ("advocate_id") REFERENCES "advocate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "view_log" ADD CONSTRAINT "view_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "view_log" ADD CONSTRAINT "view_log_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report" ADD CONSTRAINT "report_reporter_user_id_fkey" FOREIGN KEY ("reporter_user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report" ADD CONSTRAINT "report_handled_by_fkey" FOREIGN KEY ("handled_by") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report" ADD CONSTRAINT "report_target_post_id_fkey" FOREIGN KEY ("target_post_id") REFERENCES "post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leak_detection" ADD CONSTRAINT "leak_detection_target_post_id_fkey" FOREIGN KEY ("target_post_id") REFERENCES "post"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leak_detection" ADD CONSTRAINT "leak_detection_source_post_id_fkey" FOREIGN KEY ("source_post_id") REFERENCES "post"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sanction" ADD CONSTRAINT "sanction_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sanction" ADD CONSTRAINT "sanction_issued_by_fkey" FOREIGN KEY ("issued_by") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sanction" ADD CONSTRAINT "sanction_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "report"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sanction" ADD CONSTRAINT "sanction_detection_id_fkey" FOREIGN KEY ("detection_id") REFERENCES "leak_detection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sanction_appeal" ADD CONSTRAINT "sanction_appeal_sanction_id_fkey" FOREIGN KEY ("sanction_id") REFERENCES "sanction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review" ADD CONSTRAINT "review_author_participation_id_fkey" FOREIGN KEY ("author_participation_id") REFERENCES "participation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_comment" ADD CONSTRAINT "review_comment_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "review"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_comment" ADD CONSTRAINT "review_comment_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appeal_application" ADD CONSTRAINT "appeal_application_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notice" ADD CONSTRAINT "notice_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- 사건은 사이트당 1건 (01 한 사이트, 한 사건 / 04 설계 원칙 1)
ALTER TABLE "case" ADD CONSTRAINT "case_singleton" CHECK ("id" = 1);
