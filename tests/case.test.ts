import { describe, expect, it } from "vitest";
import {
  MIN_PARTICIPANTS,
  REVIEW_CHECKLIST,
  checkCaseSettings,
  defaultDurations,
  missingChecklistItems,
  progressIndex,
  ratio,
  resolveIndictmentVote,
} from "@/domain/case";

describe("공소 투표 결과 판정", () => {
  it("공소 제기가 더 많으면 공소 제기", () => {
    expect(resolveIndictmentVote(30, 20, 50).result).toBe("indicted");
  });

  it("동점이면 공소 제기 (02 결정 2)", () => {
    expect(resolveIndictmentVote(25, 25, 50).result).toBe("indicted");
  });

  it("불기소가 더 많으면 폐기", () => {
    expect(resolveIndictmentVote(20, 30, 50).result).toBe("dismissed_by_vote");
  });

  it("최소 인원에 못 미치면 득표와 상관없이 연장 없이 폐기 (05 결정 6)", () => {
    const outcome = resolveIndictmentVote(40, 9, 50);
    expect(outcome.result).toBe("dismissed_for_quorum");
    expect(outcome.total).toBe(49);
  });

  it("득표율은 소수 첫째 자리까지 계산하고, 0명이면 0%", () => {
    expect(ratio(2, 3)).toBe(66.7);
    expect(ratio(0, 0)).toBe(0);
  });
});

describe("사건 설정 검사", () => {
  const base = { minParticipants: MIN_PARTICIPANTS, maxParticipants: null, durations: defaultDurations() };

  it("기본값은 실제 운영 기준을 통과한다", () => {
    expect(checkCaseSettings(base, false).ok).toBe(true);
  });

  it("실제 운영에서는 최소 참여 인원 50명 미만, 1일 미만 기간을 허용하지 않는다", () => {
    expect(checkCaseSettings({ ...base, minParticipants: 3 }, false).ok).toBe(false);
    expect(checkCaseSettings({ ...base, durations: { ...base.durations, INDICTMENT_VOTE: 5 } }, false).ok).toBe(false);
  });

  it("시연 모드에서는 분 단위 기간과 적은 인원을 허용한다", () => {
    expect(checkCaseSettings({ ...base, minParticipants: 2, durations: { ...base.durations, INDICTMENT_VOTE: 2 } }, true).ok).toBe(true);
  });

  it("최대 인원은 최소 인원보다 적을 수 없다", () => {
    expect(checkCaseSettings({ ...base, maxParticipants: 10 }, false).ok).toBe(false);
  });
});

describe("검수 체크리스트와 진행 막대", () => {
  it("확인하지 않은 항목을 돌려준다", () => {
    expect(missingChecklistItems(REVIEW_CHECKLIST.map((i) => i.key))).toEqual([]);
    expect(missingChecklistItems(["no_real_names"])).toHaveLength(REVIEW_CHECKLIST.length - 1);
  });

  it("공소 제기 대기와 폐기는 공소 투표 칸에 표시한다", () => {
    expect(progressIndex("INDICTMENT_PENDING")).toBe(progressIndex("INDICTMENT_VOTE"));
    expect(progressIndex("DISMISSED")).toBe(0);
  });
});
