import { describe, expect, it } from "vitest";
import { checkJudgment, isNominationOpen, nominationDeadline, persuasion, pickByVotes, pickEarliestSigned } from "@/domain/trial";

const at = (minutes: number) => new Date(Date.UTC(2026, 9, 10, 0, minutes));

describe("최종 변론인 선정 기간", () => {
  it("단계의 앞 절반이 추천 투표 기간이다", () => {
    expect(nominationDeadline(at(0), at(10))).toEqual(at(5));
    expect(isNominationOpen(at(4), at(0), at(10))).toBe(true);
    expect(isNominationOpen(at(5), at(0), at(10))).toBe(false);
  });
});

describe("기본 최종 변론인", () => {
  it("추천 표를 가장 많이 받은 후보, 같으면 먼저 추천받은 후보", () => {
    expect(
      pickByVotes([
        { candidateParticipationId: "b", createdAt: at(2) },
        { candidateParticipationId: "a", createdAt: at(1) },
        { candidateParticipationId: "b", createdAt: at(3) },
      ]),
    ).toBe("b");
    expect(
      pickByVotes([
        { candidateParticipationId: "b", createdAt: at(2) },
        { candidateParticipationId: "a", createdAt: at(1) },
      ]),
    ).toBe("a");
    expect(pickByVotes([])).toBeNull();
  });

  it("추천이 없으면 가장 먼저 서명한 배심원", () => {
    expect(pickEarliestSigned([{ id: "x", signedAt: at(5) }, { id: "y", signedAt: at(2) }, { id: "z", signedAt: null }])).toBe("y");
  });
});

describe("설득 지표", () => {
  it("공소 제기 62% → 유죄 48%이면 불기소 측이 14%p 설득", () => {
    const result = persuasion(62, 48, 52);
    expect(result.guiltyRatio).toBe(48);
    expect(result.deltaPoints).toBe(-14);
    expect(result.persuadedSide).toBe("dismiss");
  });

  it("유죄 비율이 높아지면 공소 제기 측이 설득, 같거나 평결이 없으면 없음", () => {
    expect(persuasion(50, 3, 1).persuadedSide).toBe("indict");
    expect(persuasion(50, 1, 1).persuadedSide).toBeNull();
    expect(persuasion(50, 0, 0).persuadedSide).toBeNull();
  });
});

describe("판결", () => {
  it("유죄에는 형의 종류와 형량, 무죄에는 형이 없어야 하고, 선고 이유는 필수", () => {
    expect(checkJudgment({ outcome: "guilty", sentenceType: "fine", sentenceDetail: "300만 원", reasoning: "이유" }).ok).toBe(true);
    expect(checkJudgment({ outcome: "guilty", sentenceType: null, sentenceDetail: "", reasoning: "이유" }).ok).toBe(false);
    expect(checkJudgment({ outcome: "not_guilty", sentenceType: "prison", sentenceDetail: "1년", reasoning: "이유" }).ok).toBe(false);
    expect(checkJudgment({ outcome: "not_guilty", sentenceType: null, sentenceDetail: "", reasoning: " " }).ok).toBe(false);
  });
});
