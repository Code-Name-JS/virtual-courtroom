import { describe, expect, it } from "vitest";
import {
  allocateAppealSeats,
  canCommentOnReview,
  canWriteReview,
  checkApplicantEligibility,
  checkReview,
  round2Baseline,
} from "@/domain/appeal";
import { todoFor } from "@/domain/case";

describe("리뷰", () => {
  it("리뷰 기간에 재판에 참여한 배심원만 쓴다", () => {
    expect(canWriteReview("REVIEW", { isOperator: false, participationStatus: "signed" }).ok).toBe(true);
    expect(canWriteReview("REVIEW", { isOperator: false, participationStatus: "advocate" }).ok).toBe(true);
    expect(canWriteReview("REVIEW", { isOperator: false, participationStatus: "excluded" }).ok).toBe(false);
    expect(canWriteReview("REVIEW", { isOperator: false, participationStatus: null }).ok).toBe(false);
    expect(canWriteReview("FINALIZED", { isOperator: false, participationStatus: "signed" }).ok).toBe(false);
  });

  it("항소(이의) 신청은 1심 리뷰에서만, 별점은 1~5점", () => {
    expect(checkReview({ body: "판결에 동의하지 않습니다", rating: 2, isAppeal: true }, 1).ok).toBe(true);
    expect(checkReview({ body: "좋은 재판", rating: null, isAppeal: true }, 2).ok).toBe(false);
    expect(checkReview({ body: "좋은 재판", rating: 6, isAppeal: false }, 1).ok).toBe(false);
    expect(checkReview({ body: "  ", rating: null, isAppeal: false }, 1).ok).toBe(false);
  });

  it("댓글은 리뷰 기간과 2심 결정 기간에만, 제외된 배심원과 운영자는 쓸 수 없다", () => {
    const user = { loggedIn: true, isOperator: false, participationStatus: null };
    expect(canCommentOnReview("REVIEW", 1, 1, user).ok).toBe(true);
    expect(canCommentOnReview("APPEAL_DECISION", 1, 1, user).ok).toBe(true);
    expect(canCommentOnReview("APPEAL_RECRUITMENT", 2, 1, user).ok).toBe(false);
    expect(canCommentOnReview("REVIEW", 2, 1, user).ok).toBe(false);
    expect(canCommentOnReview("REVIEW", 2, 2, user).ok).toBe(true);
    expect(canCommentOnReview("REVIEW", 1, 1, { ...user, participationStatus: "excluded" }).ok).toBe(false);
    expect(canCommentOnReview("REVIEW", 1, 1, { ...user, isOperator: true }).ok).toBe(false);
  });
});

describe("2심 추가 배심원", () => {
  const base = { isOperator: false, emailVerified: true, hasRound1Comment: true, sanctionCount: 0, round1Status: null };

  it("1심 리뷰 댓글 작성자이고 제재 이력이 없어야 신청할 수 있다", () => {
    expect(checkApplicantEligibility(base).ok).toBe(true);
    expect(checkApplicantEligibility({ ...base, hasRound1Comment: false }).ok).toBe(false);
    expect(checkApplicantEligibility({ ...base, sanctionCount: 1 }).ok).toBe(false);
    expect(checkApplicantEligibility({ ...base, emailVerified: false }).ok).toBe(false);
    // 1심 배심원은 참여 여부만 고르고, 제외된 배심원은 신청할 수 없음
    expect(checkApplicantEligibility({ ...base, round1Status: "signed" }).ok).toBe(false);
    expect(checkApplicantEligibility({ ...base, round1Status: "excluded" }).ok).toBe(false);
  });

  const applicants = (indict: number, dismiss: number) => [
    ...Array.from({ length: indict }, (_, i) => ({ id: `i${i}`, side: "indict" as const, eligible: true })),
    ...Array.from({ length: dismiss }, (_, i) => ({ id: `d${i}`, side: "dismiss" as const, eligible: true })),
  ];

  it("진영별로 같은 수를 승인하고, 적은 쪽에 맞춘다", () => {
    const result = allocateAppealSeats({ applicants: applicants(5, 2), perSideCap: null, remainingCapacity: null, random: Math.random });
    expect(result.perSide).toBe(2);
    expect(result.approved.filter((id) => id.startsWith("i"))).toHaveLength(2);
    expect(result.approved.filter((id) => id.startsWith("d"))).toHaveLength(2);
    expect(result.rejected).toHaveLength(3);
    expect(result.counts.indict).toEqual({ applied: 5, eligible: 5, approved: 2 });
  });

  it("한쪽 신청자가 없으면 아무도 승인하지 않는다", () => {
    const result = allocateAppealSeats({ applicants: applicants(3, 0), perSideCap: null, remainingCapacity: null, random: Math.random });
    expect(result.approved).toHaveLength(0);
    expect(result.rejected[0].reason).toContain("진영 균형");
  });

  it("진영별 상한과 최대 참여 인원을 넘지 않고, 자격이 없으면 제외한다", () => {
    expect(allocateAppealSeats({ applicants: applicants(5, 5), perSideCap: 3, remainingCapacity: null, random: Math.random }).perSide).toBe(3);
    expect(allocateAppealSeats({ applicants: applicants(5, 5), perSideCap: null, remainingCapacity: 5, random: Math.random }).perSide).toBe(2);
    const withIneligible = allocateAppealSeats({
      applicants: [...applicants(1, 1), { id: "x", side: "indict", eligible: false }],
      perSideCap: null,
      remainingCapacity: null,
      random: Math.random,
    });
    expect(withIneligible.approved.sort()).toEqual(["d0", "i0"]);
    expect(withIneligible.rejected).toEqual([{ id: "x", reason: "승인 기준의 자격을 갖추지 못함" }]);
  });

  it("추첨은 주어진 난수로 결정된다", () => {
    const pick = () => allocateAppealSeats({ applicants: applicants(4, 1), perSideCap: null, remainingCapacity: null, random: () => 0 }).approved;
    expect(pick()).toEqual(pick());
  });

  it("2심 설득 지표의 기준은 2심 시작 시 공소 제기 측 인원 비율", () => {
    expect(round2Baseline(3, 1)).toBe(75);
    expect(round2Baseline(0, 0)).toBe(0);
  });
});

describe("리뷰 · 2심 단계의 지금 할 일", () => {
  const base = { loggedIn: true, isOperator: false, hasVoted: true };
  it("1심 리뷰에서는 이의 신청을 안내하고, 2심 리뷰에서는 항소할 수 없음을 알린다", () => {
    expect(todoFor({ ...base, status: "REVIEW", round: 1, review: "can_write" })).toContain("이의 신청");
    expect(todoFor({ ...base, status: "REVIEW", round: 2, review: "can_write" })).toContain("항소할 수 없습니다");
  });
  it("2심 모집에서는 사용자에 따라 할 일이 다르다", () => {
    expect(todoFor({ ...base, status: "APPEAL_RECRUITMENT", appeal: "choose" })).toContain("1심 진영");
    expect(todoFor({ ...base, status: "APPEAL_RECRUITMENT", appeal: "needs_signature" })).toContain("서명");
  });
});
