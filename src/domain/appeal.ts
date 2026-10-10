import type { CaseStatus, ParticipationStatus, Side } from "@prisma/client";
import { nominationDeadline } from "./trial";

// 02 리뷰 · 2심 진행 방식, 03 접근 권한, 05 2심 추가 배심원 승인 기준

export type Check = { ok: true } | { ok: false; reason: string };

function isActive(status: ParticipationStatus | null | undefined): boolean {
  return status === "signed" || status === "advocate";
}

// ─── 리뷰 ────────────────────────────────────────────────

export const REVIEW_MAX_LENGTH = 3000;
export const COMMENT_MAX_LENGTH = 1000;

/** 리뷰는 리뷰 기간에, 이번 심급에 참여 중인 배심원이 1건씩 씁니다 (02, 03: 제외된 배심원은 쓸 수 없음). */
export function canWriteReview(status: CaseStatus, viewer: { isOperator: boolean; participationStatus: ParticipationStatus | null }): Check {
  if (status !== "REVIEW") return { ok: false, reason: "리뷰는 리뷰 기간에만 쓸 수 있습니다." };
  if (viewer.isOperator) return { ok: false, reason: "운영자는 리뷰를 쓸 수 없습니다." };
  if (!isActive(viewer.participationStatus)) return { ok: false, reason: "이번 심급의 재판에 참여한 배심원만 리뷰를 쓸 수 있습니다." };
  return { ok: true };
}

export type ReviewInput = { body: string; rating: number | null; isAppeal: boolean };

/** 항소(이의) 신청은 1심 리뷰에서만 할 수 있습니다. 3심은 없으므로 2심 리뷰는 교육용 피드백입니다 (02 결정 8). */
export function checkReview(input: ReviewInput, round: number): { ok: true } | { ok: false; error: string } {
  const body = input.body.trim();
  if (!body) return { ok: false, error: "리뷰 내용을 적어 주세요." };
  if (body.length > REVIEW_MAX_LENGTH) return { ok: false, error: `리뷰는 ${REVIEW_MAX_LENGTH}자까지 쓸 수 있습니다.` };
  if (input.rating !== null && (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5)) {
    return { ok: false, error: "별점은 1~5점 중에서 골라 주세요." };
  }
  if (input.isAppeal && round !== 1) return { ok: false, error: "2심 판결에는 항소할 수 없습니다. 리뷰는 피드백으로만 남습니다." };
  return { ok: true };
}

/**
 * 리뷰 댓글은 리뷰 기간(그 심급의 리뷰)과 2심 결정 기간(1심 리뷰)에만 씁니다. 2심이 열린 뒤에는 댓글을 받지 않아,
 * 2심 개시 결정을 보고 한쪽 진영에 사람을 채우려는 신청을 막습니다 (M5 결정).
 * 사건에 참여하지 않은 사용자도 쓸 수 있지만, 제외된 배심원과 운영자는 쓸 수 없습니다 (03).
 */
export function canCommentOnReview(
  status: CaseStatus,
  caseRound: number,
  reviewRound: number,
  commenter: { loggedIn: boolean; isOperator: boolean; participationStatus: ParticipationStatus | null },
): Check {
  const open = (status === "REVIEW" && reviewRound === caseRound) || (status === "APPEAL_DECISION" && reviewRound === 1);
  if (!open) return { ok: false, reason: "리뷰 댓글은 리뷰 기간과 2심 결정 기간에만 쓸 수 있습니다." };
  if (!commenter.loggedIn) return { ok: false, reason: "이메일 인증을 마친 회원만 댓글을 쓸 수 있습니다." };
  if (commenter.isOperator) return { ok: false, reason: "운영자는 리뷰에 댓글을 쓸 수 없습니다." };
  if (commenter.participationStatus === "excluded") return { ok: false, reason: "재판에서 제외된 배심원은 댓글을 쓸 수 없습니다." };
  return { ok: true };
}

// ─── 2심 배심원 모집 ─────────────────────────────────────

/**
 * 2심 배심원 모집 기간의 앞 절반은 1심 배심원의 참여 선택과 추가 배심원 신청, 뒤 절반은 승인된 신청자의 서명 기간입니다.
 * 신청 마감이 지나면 시스템이 05 승인 기준을 기계적으로 적용합니다 (M5 결정).
 */
export function applicationDeadline(startsAt: Date, endsAt: Date): Date {
  return nominationDeadline(startsAt, endsAt);
}

/** 05 2심 추가 배심원 승인 기준 1. 자격 */
export function checkApplicantEligibility(input: {
  isOperator: boolean;
  emailVerified: boolean;
  hasRound1Comment: boolean;
  sanctionCount: number;
  round1Status: ParticipationStatus | null;
}): Check {
  if (input.isOperator) return { ok: false, reason: "운영자는 배심원으로 참여할 수 없습니다." };
  if (isActive(input.round1Status)) return { ok: false, reason: "1심 배심원은 신청하지 않고 2심 참여 여부만 선택합니다." };
  if (input.round1Status !== null) return { ok: false, reason: "1심에서 제외된 배심원은 2심에 신청할 수 없습니다." };
  if (!input.emailVerified) return { ok: false, reason: "이메일 인증을 마친 회원만 신청할 수 있습니다." };
  if (!input.hasRound1Comment) return { ok: false, reason: "1심 리뷰에 댓글을 단 회원만 신청할 수 있습니다." };
  if (input.sanctionCount > 0) return { ok: false, reason: "제재 이력이 있어 신청할 수 없습니다." };
  return { ok: true };
}

export type Applicant = { id: string; side: Side; eligible: boolean };

export type SeatAllocation = {
  /** 진영별 승인 인원 (두 진영이 같음) */
  perSide: number;
  approved: string[];
  rejected: { id: string; reason: string }[];
  counts: Record<Side, { applied: number; eligible: number; approved: number }>;
};

/** 피셔-예이츠 섞기. random은 [0, 1) 값을 돌려주는 함수 (테스트에서 고정) */
function shuffle<T>(items: T[], random: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * 05 2심 추가 배심원 승인 기준 2~4를 기계적으로 적용합니다.
 * - 진영별로 같은 수를 승인하고, 한쪽 신청자가 적으면 적은 쪽에 맞춤
 * - 운영자가 2심을 열 때 공개한 진영별 상한을 넘지 않음
 * - 1심에서 이어서 참여하는 배심원을 포함해 사건의 최대 참여 인원을 넘지 않음
 * - 승인 인원보다 신청자가 많으면 무작위 추첨
 */
export function allocateAppealSeats(input: {
  applicants: Applicant[];
  perSideCap: number | null;
  /** 최대 참여 인원에서 1심에서 이어서 참여하는 사람을 뺀 남은 자리. 제한이 없으면 null */
  remainingCapacity: number | null;
  random: () => number;
}): SeatAllocation {
  const sides: Side[] = ["indict", "dismiss"];
  const eligible = Object.fromEntries(sides.map((side) => [side, input.applicants.filter((a) => a.side === side && a.eligible)])) as Record<Side, Applicant[]>;
  const limits = [eligible.indict.length, eligible.dismiss.length];
  if (input.perSideCap !== null) limits.push(Math.max(0, input.perSideCap));
  if (input.remainingCapacity !== null) limits.push(Math.max(0, Math.floor(input.remainingCapacity / 2)));
  const perSide = Math.min(...limits);

  const approved: string[] = [];
  const rejected: { id: string; reason: string }[] = input.applicants.filter((a) => !a.eligible).map((a) => ({ id: a.id, reason: "승인 기준의 자격을 갖추지 못함" }));
  for (const side of sides) {
    const drawn = shuffle(eligible[side], input.random);
    approved.push(...drawn.slice(0, perSide).map((a) => a.id));
    const reason =
      perSide === 0 && (eligible.indict.length === 0 || eligible.dismiss.length === 0)
        ? "상대 진영에 자격을 갖춘 신청자가 없어 진영 균형을 위해 승인하지 않음"
        : "진영별 승인 인원보다 신청자가 많아 추첨에서 뽑히지 않음";
    rejected.push(...drawn.slice(perSide).map((a) => ({ id: a.id, reason })));
  }

  const counts = Object.fromEntries(
    sides.map((side) => [
      side,
      { applied: input.applicants.filter((a) => a.side === side).length, eligible: eligible[side].length, approved: Math.min(perSide, eligible[side].length) },
    ]),
  ) as SeatAllocation["counts"];
  return { perSide, approved, rejected, counts };
}

/** 2심 설득 지표의 기준: 2심이 시작될 때의 진영별 인원 비율 (02 2심 진행 방식, 04 judgment) */
export function round2Baseline(indictCount: number, dismissCount: number): number {
  const total = indictCount + dismissCount;
  return total === 0 ? 0 : Math.round((indictCount / total) * 1000) / 10;
}

export const DEFAULT_APPEAL_CRITERIA = [
  "1. 자격: 1심 리뷰에 댓글을 단 회원이고, 이메일 인증을 마쳤으며, 제재 이력이 없어야 합니다.",
  "2. 진영 균형: 진영별로 같은 수를 승인합니다. 한쪽 신청자가 적으면 적은 쪽 인원에 맞춥니다.",
  "3. 추첨: 진영별 승인 인원보다 신청자가 많으면 무작위로 추첨하고, 결과를 공개합니다.",
  "4. 상한: 1심에서 이어서 참여하는 배심원을 포함해 사건의 최대 참여 인원을 넘지 않습니다.",
  "신청 마감이 지나면 시스템이 위 기준을 그대로 적용하며, 운영자가 신청자를 개별로 고르지 않습니다.",
].join("\n");
