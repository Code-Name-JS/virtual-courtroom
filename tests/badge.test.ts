import { describe, expect, it } from "vitest";
import { BADGES, type RoundFacts, earnedBadges } from "@/domain/badge";

const round = (over: Partial<RoundFacts> = {}): RoundFacts => ({
  round: 1,
  side: "indict",
  status: "signed",
  signed: true,
  wrotePost: false,
  advocate: false,
  verdictCast: false,
  reviewed: false,
  persuadedSide: null,
  ...over,
});

describe("배지 (03 U-06)", () => {
  it("아무것도 하지 않았으면 배지가 없다", () => {
    expect(earnedBadges({ indictmentVoted: false, rounds: [] }).size).toBe(0);
  });

  it("투표만 하고 서명하지 않으면 '첫 표'만 받는다", () => {
    expect([...earnedBadges({ indictmentVoted: true, rounds: [round({ signed: false, status: "excluded" })] })]).toEqual(["first_vote"]);
  });

  it("재판 단계를 해 나갈수록 배지가 늘어난다", () => {
    const earned = earnedBadges({ indictmentVoted: true, rounds: [round({ wrotePost: true, advocate: true, verdictCast: true, reviewed: true })] });
    expect([...earned].sort()).toEqual(["advocate", "evidence", "first_vote", "reviewer", "signed", "verdict"]);
  });

  it("설득 지표가 내 진영 쪽으로 움직였을 때만 '설득한 진영'을 받고, 제재로 제외되면 받지 못한다", () => {
    expect(earnedBadges({ indictmentVoted: true, rounds: [round({ persuadedSide: "indict" })] }).has("persuader")).toBe(true);
    expect(earnedBadges({ indictmentVoted: true, rounds: [round({ persuadedSide: "dismiss" })] }).has("persuader")).toBe(false);
    expect(earnedBadges({ indictmentVoted: true, rounds: [round({ persuadedSide: null })] }).has("persuader")).toBe(false);
    expect(earnedBadges({ indictmentVoted: true, rounds: [round({ persuadedSide: "indict", status: "excluded" })] }).has("persuader")).toBe(false);
  });

  it("2심에 서명하고 참여하면 '항소심 배심원'을 받는다 (1심 없이 신청으로 들어온 경우도)", () => {
    const earned = earnedBadges({ indictmentVoted: false, rounds: [round({ round: 2, side: "dismiss" })] });
    expect(earned.has("appeal_juror")).toBe(true);
    expect(earned.has("first_vote")).toBe(false);
    expect(earnedBadges({ indictmentVoted: true, rounds: [round({ round: 2, signed: false, status: "voted" })] }).has("appeal_juror")).toBe(false);
  });

  it("모든 배지에 이름, 단계, 설명, 받는 방법이 있다", () => {
    for (const badge of BADGES) expect(badge.name && badge.stage && badge.description && badge.how).toBeTruthy();
    expect(new Set(BADGES.map((b) => b.id)).size).toBe(BADGES.length);
  });
});
