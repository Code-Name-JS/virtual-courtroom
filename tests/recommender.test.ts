import { describe, expect, it } from "vitest";
import { buildPrompt, createRecommenderFromEnv, parseRecommendation } from "@/server/ai/recommender";

const input = {
  caseTitle: "테스트 사건",
  caseBody: "정리본",
  sideLabel: "공소 제기",
  candidates: [
    { participationId: "p1", nickname: "배심원1", nominationCount: 2, nominationReasons: ["근거가 탄탄함"], posts: ["글 내용"] },
    { participationId: "p2", nickname: "배심원2", nominationCount: 0, nominationReasons: [], posts: [] },
  ],
};

describe("AI 추천 프롬프트", () => {
  it("후보 ID만 고를 수 있는 JSON 스키마를 만들고, 개인정보는 넣지 않는다", () => {
    const prompt = buildPrompt(input);
    expect(prompt.schema).toMatchObject({ properties: { participationId: { enum: ["p1", "p2"] } }, required: ["participationId", "rationale"] });
    expect(prompt.user).toContain("배심원1");
    expect(prompt.user).toContain("근거가 탄탄함");
    expect(prompt.user).not.toMatch(/@|ip/i);
  });
});

describe("AI 응답 해석", () => {
  it("후보 중 하나를 고른 JSON만 받아들인다", () => {
    expect(parseRecommendation('{"participationId":"p1","rationale":"이유"}', ["p1", "p2"])).toEqual({ participationId: "p1", rationale: "이유" });
    expect(parseRecommendation('결과: {"participationId":"p2","rationale":"이유"} 입니다', ["p1", "p2"])?.participationId).toBe("p2");
  });

  it("후보가 아닌 ID, 깨진 JSON, 빈 이유는 실패로 본다", () => {
    expect(parseRecommendation('{"participationId":"x","rationale":"이유"}', ["p1"])).toBeNull();
    expect(parseRecommendation("{participationId: p1}", ["p1"])).toBeNull();
    expect(parseRecommendation('{"participationId":"p1","rationale":""}', ["p1"])).toBeNull();
  });
});

describe("AI 제공자 설정", () => {
  it("설정이 없거나 불완전하면 추천 없이 진행한다", () => {
    expect(createRecommenderFromEnv({})).toBeNull();
    expect(createRecommenderFromEnv({ AI_PROVIDER: "anthropic" })).toBeNull();
    expect(createRecommenderFromEnv({ AI_PROVIDER: "openai-compatible", AI_API_URL: "https://example.com" })).toBeNull();
  });

  it("Claude는 기본 모델 claude-opus-5-5, OpenAI 호환은 지정한 모델을 쓴다", () => {
    expect(createRecommenderFromEnv({ AI_PROVIDER: "anthropic", AI_API_KEY: "test-key" })).toMatchObject({ provider: "anthropic", model: "claude-opus-5-5" });
    expect(
      createRecommenderFromEnv({ AI_PROVIDER: "openai-compatible", AI_API_URL: "https://example.com/v1/chat/completions", AI_MODEL: "some-model" }),
    ).toMatchObject({ provider: "openai-compatible", model: "some-model" });
  });
});
