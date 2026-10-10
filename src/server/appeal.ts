// 리뷰와 2심 참여 (02 리뷰 · 2심 진행 방식, 03 C-11 · C-12, 05 2심 추가 배심원 승인 기준).
// DB 통합 테스트에서도 쓰므로 Next.js 전용 모듈을 가져오지 않습니다.
import { Prisma, type PrismaClient, type Side } from "@prisma/client";
import {
  COMMENT_MAX_LENGTH,
  type ReviewInput,
  applicationDeadline,
  canCommentOnReview,
  canWriteReview,
  checkApplicantEligibility,
  checkReview,
} from "@/domain/appeal";
import type { AppealTodo } from "@/domain/case";
import { CASE_ID, advanceDueStages } from "./lifecycle";

export type Result = { ok: true } | { ok: false; error: string };

type Member = { id: string; role: string; emailVerifiedAt: Date | null };

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

async function currentCase(db: PrismaClient) {
  await advanceDueStages(db);
  return db.case.findUnique({ where: { id: CASE_ID } });
}

/** 03 C-11 리뷰 작성: 이번 심급의 배심원이 1건씩. 리뷰 기간이 끝나기 전까지는 고칠 수 있습니다. */
export async function writeReview(db: PrismaClient, user: Member, input: ReviewInput): Promise<Result> {
  const c = await currentCase(db);
  if (!c) return { ok: false, error: "사건이 없습니다." };
  const me = await db.participation.findUnique({ where: { userId_round: { userId: user.id, round: c.round } } });
  const allowed = canWriteReview(c.status, { isOperator: user.role === "operator", participationStatus: me?.status ?? null });
  if (!allowed.ok) return { ok: false, error: allowed.reason };
  const check = checkReview(input, c.round);
  if (!check.ok) return check;

  const data = { body: input.body.trim(), rating: input.rating, isAppeal: c.round === 1 && input.isAppeal };
  await db.review.upsert({
    where: { authorParticipationId_round: { authorParticipationId: me!.id, round: c.round } },
    create: { round: c.round, authorParticipationId: me!.id, ...data },
    update: data,
  });
  return { ok: true };
}

/** 리뷰 댓글: 사건에 참여하지 않은 회원도 쓸 수 있습니다. 1심 리뷰 댓글은 2심 참여 신청 자격이 됩니다 (02). */
export async function commentOnReview(db: PrismaClient, user: Member, reviewId: string, body: string): Promise<Result> {
  const c = await currentCase(db);
  const review = await db.review.findUnique({ where: { id: reviewId } });
  if (!c || !review) return { ok: false, error: "댓글을 달 리뷰를 찾을 수 없습니다." };
  const mine = await db.participation.findUnique({ where: { userId_round: { userId: user.id, round: review.round } } });
  const allowed = canCommentOnReview(c.status, c.round, review.round, {
    loggedIn: Boolean(user.emailVerifiedAt),
    isOperator: user.role === "operator",
    participationStatus: mine?.status ?? null,
  });
  if (!allowed.ok) return { ok: false, error: allowed.reason };
  const text = body.trim();
  if (!text || text.length > COMMENT_MAX_LENGTH) return { ok: false, error: `댓글은 1~${COMMENT_MAX_LENGTH}자로 써 주세요.` };
  await db.reviewComment.create({ data: { reviewId, authorUserId: user.id, body: text } });
  return { ok: true };
}

/** 2심 신청 마감 시각. 모집 단계가 아니면 null */
async function recruitmentDeadline(db: PrismaClient): Promise<Date | null> {
  const schedule = await db.stageSchedule.findUnique({ where: { round_stage: { round: 2, stage: "APPEAL_RECRUITMENT" } } });
  return schedule?.startsAt && schedule.endsAt ? applicationDeadline(schedule.startsAt, schedule.endsAt) : null;
}

async function openForApplications(db: PrismaClient, now: Date): Promise<Result> {
  const c = await currentCase(db);
  if (c?.status !== "APPEAL_RECRUITMENT") return { ok: false, error: "지금은 2심 배심원 모집 기간이 아닙니다." };
  const deadline = await recruitmentDeadline(db);
  if (!deadline || now >= deadline || c.appealApprovedAt) return { ok: false, error: "2심 참여 선택과 신청이 마감되었습니다." };
  return { ok: true };
}

/**
 * 1심 배심원의 2심 참여 여부 선택 (02: 참여하면 1심 진영을 그대로 유지, 진영 변경 불가).
 * 1심에서 서명했으므로 다시 서명하지 않습니다. 한 번 고르면 바꿀 수 없습니다.
 */
export async function chooseRound2(db: PrismaClient, userId: string, join: boolean, now = new Date()): Promise<Result> {
  const open = await openForApplications(db, now);
  if (!open.ok) return open;
  const first = await db.participation.findUnique({ where: { userId_round: { userId, round: 1 } } });
  if (!first || (first.status !== "signed" && first.status !== "advocate")) return { ok: false, error: "1심 재판에 참여한 배심원만 참여 여부를 고를 수 있습니다." };
  try {
    await db.participation.create({
      data: join
        ? { userId, round: 2, side: first.side, joinedVia: "continued", status: "signed", signedAt: now }
        : { userId, round: 2, side: first.side, joinedVia: "continued", status: "excluded", excludedReason: "declined_round2" },
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: "이미 2심 참여 여부를 골랐습니다." };
    throw error;
  }
  return { ok: true };
}

/** 2심 추가 배심원 신청: 1심 리뷰 댓글 작성자가 진영을 골라 신청합니다. 승인은 신청 마감 후 시스템이 기준대로 적용합니다. */
export async function applyForRound2(db: PrismaClient, user: Member, side: Side, now = new Date()): Promise<Result> {
  const open = await openForApplications(db, now);
  if (!open.ok) return open;
  const eligibility = await applicantEligibility(db, user);
  if (!eligibility.ok) return { ok: false, error: eligibility.reason };
  try {
    await db.appealApplication.create({ data: { userId: user.id, requestedSide: side } });
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: "이미 2심 참여를 신청했습니다." };
    throw error;
  }
  return { ok: true };
}

async function applicantEligibility(db: PrismaClient, user: Member) {
  const [comments, sanctions, first] = await Promise.all([
    db.reviewComment.count({ where: { authorUserId: user.id, review: { round: 1 } } }),
    db.sanction.count({ where: { userId: user.id } }),
    db.participation.findUnique({ where: { userId_round: { userId: user.id, round: 1 } } }),
  ]);
  return checkApplicantEligibility({
    isOperator: user.role === "operator",
    emailVerified: Boolean(user.emailVerifiedAt),
    hasRound1Comment: comments > 0,
    sanctionCount: sanctions,
    round1Status: first?.status ?? null,
  });
}

/** 승인된 2심 추가 배심원의 공판준비절차 서명 (02: 승인된 사람은 서명한 뒤 참여). 모집 마감 전까지 */
export async function signRound2(db: PrismaClient, userId: string, now = new Date()): Promise<Result> {
  const c = await currentCase(db);
  if (c?.status !== "APPEAL_RECRUITMENT") return { ok: false, error: "지금은 서명 기간이 아닙니다." };
  const signed = await db.participation.updateMany({ where: { userId, round: 2, status: "voted" }, data: { status: "signed", signedAt: now } });
  if (signed.count !== 1) return { ok: false, error: "승인된 2심 추가 배심원만 서명할 수 있습니다. 이미 서명했다면 다시 할 필요가 없습니다." };
  return { ok: true };
}

/** 03 C-12 2심 참여 패널용 데이터: 공개한 승인 기준, 진영별 인원, 이 사용자가 할 일 */
export async function getAppealView(db: PrismaClient, user: Member | null) {
  const c = await db.case.findUnique({ where: { id: CASE_ID } });
  if (c?.status !== "APPEAL_RECRUITMENT") return null;
  const deadline = await recruitmentDeadline(db);
  const now = new Date();
  const open = deadline !== null && now < deadline && !c.appealApprovedAt;

  const [continued, applications] = await Promise.all([
    db.participation.groupBy({ by: ["side"], where: { round: 2, joinedVia: "continued", status: "signed" }, _count: true }),
    db.appealApplication.groupBy({ by: ["requestedSide", "status"], _count: true }),
  ]);
  const count = (side: Side) => ({
    continued: continued.find((x) => x.side === side)?._count ?? 0,
    applied: applications.filter((a) => a.requestedSide === side).reduce((sum, a) => sum + a._count, 0),
    approved: applications.find((a) => a.requestedSide === side && a.status === "approved")?._count ?? 0,
  });

  let todo: AppealTodo | null = null;
  let side: Side | null = null;
  let applicationNote: string | null = null;
  if (user && user.role !== "operator") {
    const [first, second, application] = await Promise.all([
      db.participation.findUnique({ where: { userId_round: { userId: user.id, round: 1 } } }),
      db.participation.findUnique({ where: { userId_round: { userId: user.id, round: 2 } } }),
      db.appealApplication.findUnique({ where: { userId: user.id } }),
    ]);
    side = second?.side ?? first?.side ?? application?.requestedSide ?? null;
    applicationNote = application?.note ?? null;
    if (second?.joinedVia === "continued") todo = second.status === "excluded" ? "declined" : "joined";
    else if (second?.status === "voted") todo = "needs_signature";
    else if (second?.joinedVia === "appeal_application") todo = second.status === "excluded" ? "rejected" : "signed";
    else if (application?.status === "rejected") todo = "rejected";
    else if (application) todo = "applied";
    else if (open && first && (first.status === "signed" || first.status === "advocate")) todo = "choose";
    else if (open && (await applicantEligibility(db, user)).ok) todo = "can_apply";
  }

  return {
    criteria: c.appealCriteria,
    sideCap: c.appealSideCap,
    deadline,
    open,
    approvedAt: c.appealApprovedAt,
    counts: { indict: count("indict"), dismiss: count("dismiss") },
    todo,
    side,
    applicationNote,
  };
}

export type AppealView = NonNullable<Awaited<ReturnType<typeof getAppealView>>>;

/** 03 C-11 리뷰 목록과 댓글. 로그인한 회원만 볼 수 있습니다 (03). */
export async function getReviewsView(db: PrismaClient, user: Member | null, round: number) {
  await advanceDueStages(db);
  const c = await db.case.findUnique({ where: { id: CASE_ID } });
  if (!c) return null;
  const reviews = await db.review.findMany({
    where: { round },
    include: {
      author: { select: { side: true, userId: true, user: { select: { nickname: true } } } },
      comments: { include: { author: { select: { nickname: true } } }, orderBy: { createdAt: "asc" } },
    },
    orderBy: { createdAt: "asc" },
  });

  let mine = null;
  let canWrite = false;
  let canComment = false;
  if (user) {
    const [roundParticipation, myReview] = await Promise.all([
      db.participation.findUnique({ where: { userId_round: { userId: user.id, round } } }),
      db.review.findFirst({ where: { round, author: { userId: user.id } } }),
    ]);
    mine = myReview;
    canWrite = round === c.round && canWriteReview(c.status, { isOperator: user.role === "operator", participationStatus: roundParticipation?.status ?? null }).ok;
    canComment = canCommentOnReview(c.status, c.round, round, {
      loggedIn: Boolean(user.emailVerifiedAt),
      isOperator: user.role === "operator",
      participationStatus: roundParticipation?.status ?? null,
    }).ok;
  }
  const ratings = reviews.map((r) => r.rating).filter((r): r is number => r !== null);
  return {
    case: c,
    round,
    reviews,
    appealCount: reviews.filter((r) => r.isAppeal).length,
    averageRating: ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null,
    mine,
    canWrite,
    canComment,
  };
}

/** 사건 페이지의 리뷰 요약: 심급별 리뷰 수와 이의 신청 수 */
export async function reviewCounts(db: PrismaClient) {
  const rows = await db.review.groupBy({ by: ["round", "isAppeal"], _count: true });
  return [1, 2]
    .map((round) => ({
      round,
      reviews: rows.filter((r) => r.round === round).reduce((sum, r) => sum + r._count, 0),
      appeals: rows.find((r) => r.round === round && r.isAppeal)?._count ?? 0,
    }))
    .filter((r) => r.reviews > 0);
}

/** 지금 할 일에 쓰는 리뷰 상태: 이번 심급에 리뷰를 쓸 수 있는지, 이미 썼는지 */
export async function myReviewState(db: PrismaClient, user: Member | null): Promise<"can_write" | "written" | null> {
  if (!user) return null;
  const c = await db.case.findUnique({ where: { id: CASE_ID } });
  if (c?.status !== "REVIEW") return null;
  const me = await db.participation.findUnique({ where: { userId_round: { userId: user.id, round: c.round } }, include: { reviews: { where: { round: c.round } } } });
  if (!canWriteReview(c.status, { isOperator: user.role === "operator", participationStatus: me?.status ?? null }).ok) return null;
  return me!.reviews.length > 0 ? "written" : "can_write";
}
